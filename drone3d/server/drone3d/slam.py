"""Keyframe-based monocular mapping, aided by DJI telemetry.

Pipeline per frame
  1. ORB features.
  2. Tracking: match against the local map -> PnP RANSAC -> camera pose.
     (Before a map exists: bootstrap from an essential matrix; telemetry gives
     metric scale and absolute orientation, so the map lives in local ENU.)
  3. Keyframe? -> triangulate new sparse points with the previous keyframes,
     then densify with DIS optical flow between keyframes, triangulated with the
     known poses, and fuse everything into a multi-resolution voxel map.
  4. Lost tracking -> global relocalisation, then re-bootstrap anchored to the
     telemetry pose (GPS outside / velocity integration inside).
"""
import time
import math
import numpy as np
import cv2

from .geo import intrinsics, rotation_angle_deg
from .telemetry import TelemetryPose
from .voxelmap import VoxelMap
from .ba import local_ba


DEFAULTS = dict(
    hfov=73.7,            # 24 mm-equivalent lens (DJI Mini 3/4 Pro, Air 2S, ...)
    max_width=960,        # frames are resized to at most this width
    n_features=2500,
    min_track_inliers=25,
    kf_baseline_ratio=0.07,
    kf_rot_deg=12.0,
    dense=True,
    dense_stride=3,
    dense_min_parallax_deg=2.0,
    dense_min_baseline_ratio=0.04,
    sparse_min_parallax_deg=1.0,
    reinit_after_lost=8,
    local_kfs=6,
    ba_window=8,
    scale_min_spread_m=2.0,
    gyro_guard_deg=1.5,           # max disagreement between visual and gyro rotation per frame
    ba_sigma_gravity_deg=1.0,    # gimbal IMU pitch/roll accuracy
    ba_sigma_rel_rot_deg=0.3,    # gyro relative rotation between keyframes
    ba_sigma_pos_scale=1.0,      # multiplier on GPS / velocity displacement sigmas
    sparse_max_reproj=2.0,
)


class Keyframe:
    __slots__ = ("id", "gray", "color", "kps", "des", "pids", "R_wc", "C", "median_depth", "tracked",
                 "R_tel", "C_tel", "tel_src")

    def __init__(self, kid, gray, color, kps, des, R_wc, C, tel=(None, None, "none")):
        self.R_tel, self.C_tel, self.tel_src = tel
        self.id = kid
        self.gray, self.color = gray, color
        self.kps, self.des = kps, des
        self.pids = -np.ones(len(kps), np.int64)
        self.R_wc, self.C = R_wc, C
        self.median_depth = 1.0
        self.tracked = 0


def _proj_mat(K, R_wc, C):
    R_cw = R_wc.T
    return K @ np.hstack([R_cw, (-R_cw @ C)[:, None]])


def _to_cam(R_wc, C, X):
    return (X - C) @ R_wc            # == (R_cw @ (X-C).T).T


def _project(K, R_wc, C, X):
    Xc = _to_cam(R_wc, C, X)
    z = Xc[:, 2]
    uv = (Xc[:, :2] / np.maximum(z[:, None], 1e-9)) * [K[0, 0], K[1, 1]] + [K[0, 2], K[1, 2]]
    return uv, z


def _sample(img, x, y):
    """Bilinear lookup at float coords; reshaped to stay below OpenCV's remap size limit."""
    n = len(x)
    cols = 1024
    rows = max(1, (n + cols - 1) // cols)
    mx = np.zeros(rows * cols, np.float32)
    my = np.zeros(rows * cols, np.float32)
    mx[:n], my[:n] = x, y
    out = cv2.remap(img, mx.reshape(rows, cols), my.reshape(rows, cols), cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_REPLICATE)
    return out.reshape(rows * cols, *img.shape[2:])[:n]


def _fundamental(K, kf_a, R_wc_b, C_b):
    R_cw_a, R_cw_b = kf_a.R_wc.T, R_wc_b.T
    R = R_cw_b @ kf_a.R_wc
    t = R_cw_b @ (kf_a.C - C_b)
    tx = np.array([[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]])
    Ki = np.linalg.inv(K)
    return Ki.T @ tx @ R @ Ki


def _epi_dist(F, p0, p1):
    h0 = np.hstack([p0, np.ones((len(p0), 1))])
    h1 = np.hstack([p1, np.ones((len(p1), 1))])
    l = h0 @ F.T
    return np.abs(np.sum(l * h1, 1)) / np.maximum(np.hypot(l[:, 0], l[:, 1]), 1e-9)


class Mapper:
    def __init__(self, **cfg):
        self.cfg = dict(DEFAULTS, **cfg)
        self.orb = cv2.ORB_create(self.cfg["n_features"], scaleFactor=1.2, nlevels=8, fastThreshold=12)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        self.bfx = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self.dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self):
        self.tel = TelemetryPose()
        self.K = None
        self.size = None
        self.state = "init"
        self.ref = None
        self.kfs = []
        self.mp_xyz = np.zeros((0, 3))
        self.mp_des = np.zeros((0, 32), np.uint8)
        self.voxels = None
        self.metric = False
        self.frame_id = 0
        self.lost = 0
        self.poses = []           # (frame_id, R_wc, C) of tracked frames
        self.trajectory = []      # camera centres of keyframes + tracked frames
        self.last_pose = None
        self.prev_pose = None
        self.anchor = None        # last good (R_wc, C) for re-init
        self.timing = {}
        self.telemetry_scale = []
        self._tel = (None, None, "none")
        self._last_tel_R = None
        self.ba_info = None
        self.rescaled = False
        self.gyro_guard_hits = 0
        self._last_matches = None
        self.scale_corrections = []
        self._scale_from = 0
        self._last_rescale_kf = 0

    # ---------------------------------------------------------------- helpers
    def _prepare(self, img, tm):
        h, w = img.shape[:2]
        if w > self.cfg["max_width"]:
            s = self.cfg["max_width"] / w
            img = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]
        hfov = (tm or {}).get("hfov") or self.cfg["hfov"]
        if self.K is None or self.size != (w, h):
            self.K = intrinsics(w, h, hfov)
            self.size = (w, h)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return img, gray

    def _features(self, gray):
        kp, des = self.orb.detectAndCompute(gray, None)
        if des is None:
            return np.zeros((0, 2), np.float32), np.zeros((0, 32), np.uint8)
        return np.array([k.pt for k in kp], np.float32), des

    def _ratio_match(self, d1, d2, ratio=0.8):
        if len(d1) < 2 or len(d2) < 2:
            return np.zeros((0, 2), int)
        out = []
        for m in self.bf.knnMatch(d1, d2, k=2):
            if len(m) == 2 and m[0].distance < ratio * m[1].distance and m[0].distance < 70:
                out.append((m[0].queryIdx, m[0].trainIdx))
        return np.array(out, int).reshape(-1, 2)

    def _add_points(self, X, des):
        self.mp_xyz = np.vstack([self.mp_xyz, X])
        self.mp_des = np.vstack([self.mp_des, des])
        return np.arange(len(self.mp_xyz) - len(X), len(self.mp_xyz))

    def _colors(self, color, uv):
        h, w = color.shape[:2]
        u = np.clip(np.round(uv[:, 0]).astype(int), 0, w - 1)
        v = np.clip(np.round(uv[:, 1]).astype(int), 0, h - 1)
        return color[v, u][:, ::-1]  # BGR -> RGB

    # -------------------------------------------------------------- bootstrap
    def _bootstrap(self, gray, color, kps, des, R_tel, C_tel):
        if self.ref is None or len(self.ref["kps"]) < 100:
            if self.anchor is not None:
                R0, C0 = self.anchor
                if R_tel is not None and C_tel is not None and self.metric:
                    R0, C0 = R_tel, C_tel
            else:
                R0 = R_tel if R_tel is not None else np.eye(3)
                C0 = C_tel if C_tel is not None else np.zeros(3)
            self.ref = dict(gray=gray, color=color, kps=kps, des=des, R_wc=R0, C=C0,
                            C_tel=C_tel, tel=self._tel, frames=0)
            return False
        ref = self.ref
        ref["frames"] += 1
        m = self._ratio_match(ref["des"], des, 0.75)
        if len(m) < 80:
            if ref["frames"] > 15:
                self.ref = None
            return False
        p0, p1 = ref["kps"][m[:, 0]].astype(np.float64), kps[m[:, 1]].astype(np.float64)
        if np.median(np.linalg.norm(p1 - p0, axis=1)) < 0.02 * self.size[0]:
            return False
        R_tel_rel = None
        if ref["tel"][0] is not None and R_tel is not None:
            R_tel_rel = R_tel.T @ ref["tel"][0]          # cam0 -> cam1, x1 = R x0 + t
        sol = None
        E, mask = cv2.findEssentialMat(p0, p1, self.K, cv2.RANSAC, 0.999, 1.0)
        if E is not None and E.shape == (3, 3):
            n, R, t, mask2 = cv2.recoverPose(E, p0, p1, self.K, mask=mask.copy())
            if n >= 60 and (R_tel_rel is None or rotation_angle_deg(R, R_tel_rel) < 3.0):
                sol = (R, t.ravel(), mask2.ravel() > 0)
        if sol is None and R_tel_rel is not None:
            # essential matrix ambiguous (planar scene) -> trust gyro rotation, solve translation
            sol = self._translation_2pt(p0, p1, R_tel_rel)
        if sol is None:
            return False
        R, t, inl = sol
        if inl.sum() < 60:
            return False
        P0 = self.K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        P1 = self.K @ np.hstack([R, t[:, None]])
        Xh = cv2.triangulatePoints(P0, P1, p0[inl].T, p1[inl].T)
        X0 = (Xh[:3] / Xh[3]).T
        # parallax check
        c1 = -R.T @ t
        a = X0 / np.linalg.norm(X0, axis=1, keepdims=True)
        b = (X0 - c1) / np.linalg.norm(X0 - c1, axis=1, keepdims=True)
        par = np.degrees(np.arccos(np.clip(np.sum(a * b, 1), -1, 1)))
        X1 = X0 @ R.T + t
        good = (X0[:, 2] > 0) & (X1[:, 2] > 0) & (par > self.cfg["sparse_min_parallax_deg"])
        if good.sum() < 50 or np.median(par[good]) < 1.5:
            return False

        # metric scale from telemetry baseline (if we have it)
        scale = None
        if ref["C_tel"] is not None and C_tel is not None:
            bl = float(np.linalg.norm(C_tel - ref["C_tel"]))
            if bl > 0.15:
                scale = bl
        if scale is None:
            scale = 1.0 if self.anchor is None else self._typical_baseline()
        else:
            self.metric = True

        R_wc0, C0 = ref["R_wc"], ref["C"]
        R_wc1 = R_wc0 @ R.T
        C1 = C0 + R_wc0 @ (c1 * scale)
        Xw = (X0[good] * scale) @ R_wc0.T + C0

        if self.voxels is None:
            unit = 1.0 if self.metric else np.median(X0[good][:, 2]) * scale / 5.0
            self.voxels = VoxelMap(base_size=0.02 * unit)

        kf0 = Keyframe(len(self.kfs), ref["gray"], ref["color"], ref["kps"], ref["des"], R_wc0, C0, ref["tel"])
        self.kfs.append(kf0)
        kf1 = Keyframe(len(self.kfs), gray, color, kps, des, R_wc1, C1, self._tel)
        self.kfs.append(kf1)
        idx0 = m[inl][good, 0]
        idx1 = m[inl][good, 1]
        pids = self._add_points(Xw, des[idx1])
        kf0.pids[idx0] = pids
        kf1.pids[idx1] = pids
        for kf in (kf0, kf1):
            kf.median_depth = float(np.median(_to_cam(kf.R_wc, kf.C, Xw)[:, 2]))
            kf.tracked = len(pids)
        self._new_pts = [(Xw, self._colors(color, kps[idx1]), _to_cam(R_wc1, C1, Xw)[:, 2], 2.0)]
        self._dense(kf0, kf1)
        self.state = "tracking"
        self.ref = None
        self.lost = 0
        self.prev_pose = (R_wc0, C0)
        self.last_pose = (R_wc1, C1)
        self.trajectory += [C0.copy(), C1.copy()]
        return True

    def _translation_2pt(self, p0, p1, R, iters=200, thr_px=1.0):
        """Known rotation -> translation direction by 2-point RANSAC on the epipolar constraint."""
        Ki = np.linalg.inv(self.K)
        f0 = np.hstack([p0, np.ones((len(p0), 1))]) @ Ki.T
        f1 = np.hstack([p1, np.ones((len(p1), 1))]) @ Ki.T
        A = np.cross(f0 @ R.T, f1)                       # t . a_i = 0
        An = A / np.maximum(np.linalg.norm(A, axis=1, keepdims=True), 1e-12)
        thr = thr_px / self.K[0, 0]
        rng = np.random.default_rng(0)
        best, best_n = None, 0
        for _ in range(iters):
            i, j = rng.choice(len(A), 2, replace=False)
            t = np.cross(A[i], A[j])
            nt = np.linalg.norm(t)
            if nt < 1e-12:
                continue
            t /= nt
            inl = np.abs(An @ t) < thr
            k = int(inl.sum())
            if k > best_n:
                best, best_n = inl, k
        if best is None or best_n < 60:
            return None
        _, _, Vt = np.linalg.svd(A[best])
        t = Vt[2]
        # sign: points must be in front of both cameras
        for sgn in (1, -1):
            tt = sgn * t
            P0 = self.K @ np.hstack([np.eye(3), np.zeros((3, 1))])
            P1 = self.K @ np.hstack([R, tt[:, None]])
            Xh = cv2.triangulatePoints(P0, P1, p0[best].T, p1[best].T)
            X0 = (Xh[:3] / Xh[3]).T
            X1 = X0 @ R.T + tt
            if np.mean((X0[:, 2] > 0) & (X1[:, 2] > 0)) > 0.7:
                inl = best.copy()
                inl[best] = (X0[:, 2] > 0) & (X1[:, 2] > 0)
                return R, tt, inl
        return None

    def _typical_baseline(self):
        if len(self.kfs) < 2:
            return 1.0
        d = [np.linalg.norm(self.kfs[i].C - self.kfs[i - 1].C) for i in range(max(1, len(self.kfs) - 8), len(self.kfs))]
        return float(np.median(d)) or 1.0

    # --------------------------------------------------------------- tracking
    def _predict(self):
        if self.last_pose is None:
            return None
        R1, C1 = self.last_pose
        if self.prev_pose is None:
            return R1, C1
        R0, C0 = self.prev_pose
        dR = R1 @ R0.T
        R_pred = dR @ R1
        # gyro-accurate relative rotation from telemetry, if available
        if self._tel[0] is not None and self._last_tel_R is not None:
            R_pred = R1 @ (self._last_tel_R.T @ self._tel[0])
        return R_pred, C1 + (C1 - C0)

    def _local_ids(self):
        ids = [kf.pids[kf.pids >= 0] for kf in self.kfs[-self.cfg["local_kfs"]:]]
        return np.unique(np.concatenate(ids)) if ids else np.zeros(0, np.int64)

    def _pnp(self, kps, des, ids, prior):
        if len(ids) < 30:
            return None
        m = self._ratio_match(des, self.mp_des[ids], 0.8)
        if len(m) < self.cfg["min_track_inliers"]:
            return None
        obj = self.mp_xyz[ids[m[:, 1]]].astype(np.float64)
        img = kps[m[:, 0]].astype(np.float64)
        self._last_matches = (obj, img, m[:, 0], ids[m[:, 1]])
        args = dict(iterationsCount=300, reprojectionError=3.0, confidence=0.999)
        if prior is not None:
            R_cw = prior[0].T
            rvec, _ = cv2.Rodrigues(R_cw)
            tvec = -R_cw @ prior[1]
            ok, rvec, tvec, inl = cv2.solvePnPRansac(obj, img, self.K, None, rvec.copy(), tvec.reshape(3, 1).copy(),
                                                     useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE, **args)
        else:
            ok, rvec, tvec, inl = cv2.solvePnPRansac(obj, img, self.K, None, flags=cv2.SOLVEPNP_EPNP, **args)
        if not ok or inl is None or len(inl) < self.cfg["min_track_inliers"]:
            return None
        inl = inl.ravel()
        rvec, tvec = cv2.solvePnPRefineLM(obj[inl], img[inl], self.K, None, rvec, tvec)
        R_cw, _ = cv2.Rodrigues(rvec)
        R_wc = R_cw.T
        C = -R_wc @ tvec.ravel()
        uv, z = _project(self.K, R_wc, C, obj[inl])
        err = np.linalg.norm(uv - img[inl], axis=1)
        keep = (err < 3.0) & (z > 0)
        inl = inl[keep]
        if len(inl) < self.cfg["min_track_inliers"]:
            return None
        return R_wc, C, m[inl, 0], ids[m[inl, 1]], z[keep]

    def _translation_only(self, R_wc, iters=150, thr_px=3.0):
        """Camera centre from 2D-3D matches with known rotation (2-point RANSAC + least squares)."""
        if self._last_matches is None:
            return None
        obj, img, fidx, pids = self._last_matches
        if len(obj) < self.cfg["min_track_inliers"]:
            return None
        Ki = np.linalg.inv(self.K)
        d = np.hstack([img, np.ones((len(img), 1))]) @ Ki.T @ R_wc.T     # world ray directions
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        Sx = np.zeros((len(d), 3, 3))
        Sx[:, 0, 1], Sx[:, 0, 2], Sx[:, 1, 0] = -d[:, 2], d[:, 1], d[:, 2]
        Sx[:, 1, 2], Sx[:, 2, 0], Sx[:, 2, 1] = -d[:, 0], -d[:, 1], d[:, 0]
        b = np.einsum("nij,nj->ni", Sx, obj)                       # [d]x C = [d]x X

        def solve(sel):
            A = Sx[sel].reshape(-1, 3)
            return np.linalg.lstsq(A, b[sel].ravel(), rcond=None)[0]

        def inliers(C):
            uv, z = _project(self.K, R_wc, C, obj)
            return (np.linalg.norm(uv - img, axis=1) < thr_px) & (z > 0)

        rng = np.random.default_rng(self.frame_id)
        best, best_n = None, 0
        for _ in range(iters):
            sel = rng.choice(len(obj), 2, replace=False)
            C = solve(sel)
            inl = inliers(C)
            n = int(inl.sum())
            if n > best_n:
                best, best_n = inl, n
        if best is None or best_n < self.cfg["min_track_inliers"]:
            return None
        C = solve(best)
        inl = inliers(C)
        if inl.sum() < self.cfg["min_track_inliers"]:
            return None
        z = _to_cam(R_wc, C, obj[inl])[:, 2]
        return R_wc, C, fidx[inl], pids[inl], z

    def _track(self, gray, color, kps, des, R_tel, C_tel):
        prior = self._predict()
        self._last_matches = None
        res = self._pnp(kps, des, self._local_ids(), prior)
        gyro_ok = self._tel[0] is not None and self._last_tel_R is not None and prior is not None
        if gyro_ok and (res is None or rotation_angle_deg(res[0], prior[0]) > self.cfg["gyro_guard_deg"]):
            # visual rotation disagrees with the gyro (door frames, glass, motion blur...):
            # keep the gyro-predicted rotation and solve only the position
            alt = self._translation_only(prior[0])
            if alt is not None:
                res = alt
                self.gyro_guard_hits += 1
        if res is None and len(self.mp_xyz) > 0:            # relocalise on the whole map
            res = self._pnp(kps, des, np.arange(len(self.mp_xyz)), None)
        if res is None:
            self.lost += 1
            if self.lost >= self.cfg["reinit_after_lost"]:
                self.state = "init"
                self.ref = None
                self.anchor = self.last_pose if self.last_pose is not None else (np.eye(3), np.zeros(3))
                self._scale_from = len(self.kfs)
            return False
        R_wc, C, fidx, pids, depth = res
        self.lost = 0
        self.prev_pose, self.last_pose = self.last_pose, (R_wc, C)
        self.trajectory.append(C.copy())
        self.n_tracked = len(fidx)

        last = self.kfs[-1]
        baseline = np.linalg.norm(C - last.C)
        rot = rotation_angle_deg(last.R_wc, R_wc)
        need_kf = (len(fidx) < 0.55 * max(last.tracked, 1) or len(fidx) < 80
                   or baseline / max(last.median_depth, 1e-6) > self.cfg["kf_baseline_ratio"]
                   or rot > self.cfg["kf_rot_deg"])
        if need_kf and baseline / max(last.median_depth, 1e-6) > 0.01:
            kf = Keyframe(len(self.kfs), gray, color, kps, des, R_wc, C, self._tel)
            kf.pids[fidx] = pids
            kf.median_depth = float(np.median(depth))
            kf.tracked = len(fidx)
            self.kfs.append(kf)
            self._map_new_kf(kf)
            if C_tel is not None and len(self.kfs) > 1:
                self._telemetry_check(C_tel)
            self._scale_check()
            # free image memory of old keyframes
            if len(self.kfs) > 12:
                old = self.kfs[-13]
                old.gray = old.color = None
        return True

    def _telemetry_check(self, C_tel):
        self.telemetry_scale.append((self.kfs[-1].C.copy(), C_tel.copy()))
        self.telemetry_scale = self.telemetry_scale[-30:]

    def _scale_check(self):
        """Fit VO keyframe path to the telemetry path (GPS / velocity) and rescale the map if needed."""
        kfs = [k for k in self.kfs[self._scale_from:] if k.C_tel is not None]
        if len(kfs) < 6:
            return
        V = np.array([k.C for k in kfs])
        T = np.array([k.C_tel for k in kfs])
        v0, t0 = V - V.mean(0), T - T.mean(0)
        spread = np.sqrt((t0 ** 2).sum(1).mean())
        if spread < self.cfg["scale_min_spread_m"]:
            return
        s = float((v0 * t0).sum() / max((v0 * v0).sum(), 1e-12))
        if not 0.3 < s < 3.0:
            return
        n_since = len(self.kfs) - self._last_rescale_kf
        if abs(s - 1) > 0.03 and n_since >= 4:
            self._rescale(s)
            self._last_rescale_kf = len(self.kfs)
            self.metric = True

    def _rescale(self, s):
        a = self.kfs[0].C.copy()
        self.mp_xyz = a + s * (self.mp_xyz - a)
        for k in self.kfs:
            k.C = a + s * (k.C - a)
            k.median_depth *= s
        self.trajectory = [a + s * (c - a) for c in self.trajectory]
        if self.last_pose is not None:
            self.last_pose = (self.last_pose[0], a + s * (self.last_pose[1] - a))
        if self.prev_pose is not None:
            self.prev_pose = (self.prev_pose[0], a + s * (self.prev_pose[1] - a))
        if self.voxels is not None:
            xyz, rgb = self.voxels.points()
            old = self.voxels
            self.voxels = VoxelMap(base_size=old.sizes[0], levels=len(old.sizes), min_obs=old.min_obs)
            X = a + s * (xyz.astype(np.float64) - a)
            # depth proxy for voxel level: distance to the nearest recent keyframe centre
            Cs = np.array([k.C for k in self.kfs[-20:]])
            d = np.full(len(X), np.inf)
            for c in Cs:
                d = np.minimum(d, np.linalg.norm(X - c, axis=1))
            self.voxels.insert(X, rgb, d, float(old.min_obs))
            self.voxels.emitted[: self.voxels.n] = True
        self.rescaled = True
        self.scale_corrections.append(round(s, 4))

    # ---------------------------------------------------------------- mapping
    def _map_new_kf(self, kf):
        n_before = len(self.mp_xyz)
        for prev in self.kfs[-3:-1]:
            if np.linalg.norm(kf.C - prev.C) / max(prev.median_depth, 1e-6) < 0.015:
                continue  # (almost) pure rotation: nothing reliable to triangulate
            a = np.where(prev.pids < 0)[0]
            b = np.where(kf.pids < 0)[0]
            if len(a) < 10 or len(b) < 10:
                continue
            ms = self.bfx.match(prev.des[a], kf.des[b])
            if not ms:
                continue
            ia = a[[mm.queryIdx for mm in ms]]
            ib = b[[mm.trainIdx for mm in ms]]
            dist = np.array([mm.distance for mm in ms])
            ok = dist < 60
            ia, ib = ia[ok], ib[ok]
            p0, p1 = prev.kps[ia].astype(np.float64), kf.kps[ib].astype(np.float64)
            F = _fundamental(self.K, prev, kf.R_wc, kf.C)
            ok = _epi_dist(F, p0, p1) < 2.0
            ia, ib, p0, p1 = ia[ok], ib[ok], p0[ok], p1[ok]
            if len(ia) < 5:
                continue
            X = self._triangulate(prev, kf, p0, p1, self.cfg["sparse_min_parallax_deg"], self.cfg["sparse_max_reproj"])
            good = ~np.isnan(X[:, 0])
            if good.sum() == 0:
                continue
            ia, ib, X = ia[good], ib[good], X[good]
            # a feature might be used twice by different prev kfs
            free = kf.pids[ib] < 0
            ia, ib, X = ia[free], ib[free], X[free]
            pids = self._add_points(X, kf.des[ib])
            prev.pids[ia] = pids
            kf.pids[ib] = pids
        # local bundle adjustment (with telemetry priors) before densifying
        old_C, old_R = kf.C.copy(), kf.R_wc.copy()
        if self.cfg["ba_window"] and len(self.kfs) >= 3:
            t0 = time.time()
            info = local_ba(self.K, self.kfs, self.mp_xyz, self.cfg["ba_window"],
                            s_grav_deg=self.cfg["ba_sigma_gravity_deg"], s_rot_deg=self.cfg["ba_sigma_rel_rot_deg"],
                            s_pos=self.cfg["ba_sigma_pos_scale"])
            self.timing["ba_ms"] = round((time.time() - t0) * 1000, 1)
            if info:
                self.ba_info = info
                # keep frame-to-frame prediction consistent with the corrected keyframe
                dR = kf.R_wc @ old_R.T
                self.last_pose = (kf.R_wc, kf.C)
                if self.prev_pose is not None:
                    R0, C0 = self.prev_pose
                    self.prev_pose = (dR @ R0, kf.C + dR @ (C0 - old_C))
        self._new_pts = []
        self._emit_sparse(kf, n_before)
        partner = self._dense_partner(kf)
        if partner is not None:
            self._dense(partner, kf)

    def _emit_sparse(self, kf, n_before):
        # sparse points created for this keyframe (after BA refinement)
        sel = np.where(kf.pids >= n_before)[0]
        if len(sel) == 0:
            return
        X = self.mp_xyz[kf.pids[sel]]
        self._new_pts.append((X, self._colors(kf.color, kf.kps[sel]), _to_cam(kf.R_wc, kf.C, X)[:, 2], 1.0))  # sparse points also need confirmation from another view pair

    def _triangulate(self, ka, kb, p0, p1, min_par, max_err):
        Pa = _proj_mat(self.K, ka.R_wc, ka.C)
        Pb = _proj_mat(self.K, kb.R_wc, kb.C)
        Xh = cv2.triangulatePoints(Pa, Pb, p0.T, p1.T)
        X = (Xh[:3] / np.where(np.abs(Xh[3]) < 1e-12, 1e-12, Xh[3])).T
        uva, za = _project(self.K, ka.R_wc, ka.C, X)
        uvb, zb = _project(self.K, kb.R_wc, kb.C, X)
        ea = np.linalg.norm(uva - p0, axis=1)
        eb = np.linalg.norm(uvb - p1, axis=1)
        da = X - ka.C
        db = X - kb.C
        cosang = np.sum(da * db, 1) / np.maximum(np.linalg.norm(da, axis=1) * np.linalg.norm(db, axis=1), 1e-12)
        par = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
        good = (za > 0) & (zb > 0) & (ea < max_err) & (eb < max_err) & (par > min_par)
        X[~good] = np.nan
        return X

    def _dense_partner(self, kf):
        """Previous keyframe with the most useful baseline for dense depth (skip rotation-only pairs)."""
        best, best_r = None, 0.0
        for prev in self.kfs[-6:-1]:
            if prev.gray is None:
                continue
            ratio = np.linalg.norm(kf.C - prev.C) / max(min(prev.median_depth, kf.median_depth), 1e-6)
            rot = rotation_angle_deg(prev.R_wc, kf.R_wc)
            if rot > 30 or ratio > 0.35:
                continue
            score = ratio - 0.004 * rot
            if ratio >= self.cfg["dense_min_baseline_ratio"] and score > best_r:
                best, best_r = prev, score
        return best

    def _dense(self, ka, kb):
        if not self.cfg["dense"] or ka.gray is None:
            return
        t0 = time.time()
        w, h = self.size
        s = min(1.0, 640.0 / w)
        g0 = cv2.resize(ka.gray, None, fx=s, fy=s) if s < 1 else ka.gray
        g1 = cv2.resize(kb.gray, None, fx=s, fy=s) if s < 1 else kb.gray
        f01 = self.dis.calc(g0, g1, None)
        f10 = self.dis.calc(g1, g0, None)
        st = self.cfg["dense_stride"]
        hh, ww = g0.shape
        ys, xs = np.mgrid[st // 2:hh:st, st // 2:ww:st]
        xs, ys = xs.ravel(), ys.ravel()
        gx = cv2.Sobel(g0, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(g0, cv2.CV_32F, 0, 1, ksize=3)
        grad = np.hypot(gx, gy)[ys, xs]
        sel = grad > 40
        xs, ys = xs[sel], ys[sel]
        fl = f01[ys, xs]
        x1, y1 = xs + fl[:, 0], ys + fl[:, 1]
        inside = (x1 >= 0) & (x1 < ww - 1) & (y1 >= 0) & (y1 < hh - 1)
        xs, ys, x1, y1, fl = xs[inside], ys[inside], x1[inside], y1[inside], fl[inside]
        back = _sample(f10, x1, y1)
        fb = np.hypot(fl[:, 0] + back[:, 0], fl[:, 1] + back[:, 1])
        ok = fb < 0.5
        p0 = np.stack([xs[ok], ys[ok]], 1).astype(np.float64) / s
        p1 = np.stack([x1[ok], y1[ok]], 1).astype(np.float64) / s
        if len(p0) == 0:
            return
        F = _fundamental(self.K, ka, kb.R_wc, kb.C)
        ok = _epi_dist(F, p0, p1) < 1.0
        p0, p1 = p0[ok], p1[ok]
        X = self._triangulate(ka, kb, p0, p1, self.cfg["dense_min_parallax_deg"], 1.0)
        good = ~np.isnan(X[:, 0])
        X, p1 = X[good], p1[good]
        if len(X):
            self._new_pts.append((X, self._colors(kb.color, p1), _to_cam(kb.R_wc, kb.C, X)[:, 2], 1.0))
        self.timing["dense_ms"] = round((time.time() - t0) * 1000, 1)

    # ------------------------------------------------------------------ main
    def process(self, img, tm=None):
        """img: BGR uint8 frame. tm: telemetry dict (or None).

        Returns dict(state, pose, new_xyz, new_rgb, keyframe, stats)."""
        t0 = time.time()
        self.frame_id += 1
        self._new_pts = []
        self.rescaled = False
        color, gray = self._prepare(img, tm)
        R_tel, C_tel, src = self.tel.update(tm)
        self._tel = (R_tel, C_tel, src)
        kps, des = self._features(gray)
        n_kf = len(self.kfs)
        if self.state == "init":
            ok = self._bootstrap(gray, color, kps, des, R_tel, C_tel)
        else:
            ok = self._track(gray, color, kps, des, R_tel, C_tel)

        self._last_tel_R = R_tel
        new_xyz, new_rgb = [], []
        if self.voxels is not None:
            for X, rgb, depth, wgt in self._new_pts:
                a, b = self.voxels.insert(X, rgb, depth, wgt)
                if len(a):
                    new_xyz.append(a)
                    new_rgb.append(b)
        self.timing["frame_ms"] = round((time.time() - t0) * 1000, 1)
        pose = self.last_pose if ok else None
        return dict(
            state=self.state if ok or self.state == "init" else "lost",
            pose=None if pose is None else (pose[0].copy(), pose[1].copy()),
            telemetry_pose=None if R_tel is None or C_tel is None else (R_tel, C_tel),
            new_xyz=np.concatenate(new_xyz) if new_xyz else np.zeros((0, 3), np.float32),
            new_rgb=np.concatenate(new_rgb) if new_rgb else np.zeros((0, 3), np.uint8),
            keyframe=len(self.kfs) > n_kf,
            rescaled=self.rescaled,
            stats=self.stats(src),
        )

    def stats(self, src="none"):
        sc = None
        if len(self.telemetry_scale) >= 5:
            vo = np.array([a for a, _ in self.telemetry_scale])
            te = np.array([b for _, b in self.telemetry_scale])
            dvo = np.linalg.norm(vo[-1] - vo[0])
            dte = np.linalg.norm(te[-1] - te[0])
            if dvo > 1e-6 and dte > 0.5:
                sc = round(float(dte / dvo), 3)
        return dict(frame=self.frame_id, keyframes=len(self.kfs), map_points=int(len(self.mp_xyz)),
                    voxels=0 if self.voxels is None else len(self.voxels), metric=self.metric,
                    position_source=src, telemetry_vs_vo_scale=sc, scale_corrections=self.scale_corrections[-5:],
                    gyro_guard_hits=self.gyro_guard_hits,
                    **self.timing)
