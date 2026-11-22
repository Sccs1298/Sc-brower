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
from .screen import FramePrep


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
    assume_level_horizon=True,
    osd_scale_window=25,          # keyframes used to fit the on-screen height H
    osd_min_height_span_m=1.2,   # no telemetry: estimate gravity from a level horizon
    gyro_guard_deg=1.5,           # max disagreement between visual and gyro rotation per frame
    ba_sigma_gravity_deg=1.0,    # gimbal IMU pitch/roll accuracy
    ba_sigma_rel_rot_deg=0.3,    # gyro relative rotation between keyframes
    ba_sigma_pos_scale=1.0,      # multiplier on GPS / velocity displacement sigmas
    sparse_max_reproj=2.0,
)


class Keyframe:
    __slots__ = ("id", "gray", "color", "kps", "des", "pids", "R_wc", "C", "median_depth", "tracked",
                 "R_tel", "C_tel", "tel_src", "mask", "alt")

    def __init__(self, kid, gray, color, kps, des, R_wc, C, tel=(None, None, "none")):
        self.R_tel, self.C_tel, self.tel_src = tel
        self.mask = None
        self.alt = None      # height read from the DJI Fly screen (OCR), metres
        self.id = kid
        self.gray, self.color = gray, color
        self.kps, self.des = kps, des
        self.pids = -np.ones(len(kps), np.int64)
        self.R_wc, self.C = R_wc, C
        self.median_depth = 1.0
        self.tracked = 0


def _c(a):
    """Contiguous float64 copy - OpenCV 4.5 (the version on Android) rejects strided views."""
    return np.ascontiguousarray(a, np.float64)


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
        self.prep = FramePrep(self.cfg)
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self):
        self.tel = TelemetryPose()
        self.prep.reset()
        self.mask = None
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
        self._last_gravity_kf = 0
        self.gravity_aligned = False
        self.gravity_quality = None
        self.scale_source = None
        self.height_marks = []
        self.height_scale_result = None
        self.boot_reason = None
        self._alt = None

    # ---------------------------------------------------------------- helpers
    def _prepare(self, img, tm):
        mask, Kc = None, None
        if self.prep.active or (tm or {}).get("mask") or (tm or {}).get("crop"):
            img, mask, Kc = self.prep(img, tm)
        h, w = img.shape[:2]
        s = 1.0
        if w > self.cfg["max_width"]:
            s = self.cfg["max_width"] / w
            img = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
            if mask is not None:
                mask = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
            h, w = img.shape[:2]
        if Kc is not None:
            K = Kc.copy()
            K[:2] *= s
            if self.K is None or self.size != (w, h) or not np.allclose(K, self.K):
                self.K, self.size = K, (w, h)
        else:
            hfov = (tm or {}).get("hfov") or self.cfg["hfov"]
            if self.K is None or self.size != (w, h):
                self.K = intrinsics(w, h, hfov)
                self.size = (w, h)
        self.mask = mask
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return img, gray

    def _features(self, gray):
        kp, des = self.orb.detectAndCompute(gray, self.mask)
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
        if not self.prep.ready:          # screen capture: learn the DJI Fly overlay first
            self.ref = None
            self.boot_reason = "learning_overlay"
            return False
        if self.ref is None or len(self.ref["kps"]) < 100:
            if self.anchor is not None:
                R0, C0 = self.anchor
                if R_tel is not None and C_tel is not None and self.metric:
                    R0, C0 = R_tel, C_tel
            else:
                R0 = R_tel if R_tel is not None else np.eye(3)
                C0 = C_tel if C_tel is not None else np.zeros(3)
            self.ref = dict(gray=gray, color=color, kps=kps, des=des, R_wc=R0, C=C0,
                            C_tel=C_tel, tel=self._tel, frames=0, mask=self.mask, alt=self._alt)
            return False
        ref = self.ref
        ref["frames"] += 1
        m = self._ratio_match(ref["des"], des, 0.75)
        min_matches = 50 if self.size[0] < 600 else 70
        if len(m) < min_matches:
            self.boot_reason = "few_matches"
            if ref["frames"] >= 3:      # reference too old: start again from this frame
                self.ref = None
            return False
        p0, p1 = ref["kps"][m[:, 0]].astype(np.float64), kps[m[:, 1]].astype(np.float64)
        if np.median(np.linalg.norm(p1 - p0, axis=1)) < 0.014 * self.size[0]:
            self.boot_reason = "move_more"
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
            self.boot_reason = "no_geometry"
            return False
        R, t, inl = sol
        if inl.sum() < 60:
            self.boot_reason = "few_inliers"
            return False
        P0 = self.K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        P1 = self.K @ np.hstack([R, t[:, None]])
        Xh = cv2.triangulatePoints(P0, P1, _c(p0[inl].T), _c(p1[inl].T))
        X0 = (Xh[:3] / Xh[3]).T
        # parallax check
        c1 = -R.T @ t
        a = X0 / np.linalg.norm(X0, axis=1, keepdims=True)
        b = (X0 - c1) / np.linalg.norm(X0 - c1, axis=1, keepdims=True)
        par = np.degrees(np.arccos(np.clip(np.sum(a * b, 1), -1, 1)))
        X1 = X0 @ R.T + t
        good = (X0[:, 2] > 0) & (X1[:, 2] > 0) & (par > self.cfg["sparse_min_parallax_deg"])
        if good.sum() < 50 or np.median(par[good]) < 1.5:
            self.boot_reason = f"low_parallax {good.sum()} {np.median(par[good]) if good.any() else 0:.2f}"
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
        kf0.mask = ref.get("mask")
        kf0.alt = ref.get("alt")
        self.kfs.append(kf0)
        kf1 = Keyframe(len(self.kfs), gray, color, kps, des, R_wc1, C1, self._tel)
        kf1.mask = self.mask
        kf1.alt = self._alt
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
            Xh = cv2.triangulatePoints(P0, P1, _c(p0[best].T), _c(p1[best].T))
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
            kf.mask = self.mask
            kf.alt = self._alt
            kf.pids[fidx] = pids
            kf.median_depth = float(np.median(depth))
            kf.tracked = len(fidx)
            self.kfs.append(kf)
            self._map_new_kf(kf)
            if C_tel is not None and len(self.kfs) > 1:
                self._telemetry_check(C_tel)
            self._scale_check()
            self._gravity_check()
            self._osd_height_scale()
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
        self._transform(s, np.eye(3))
        self.scale_corrections.append(round(s, 4))

    def _transform(self, s, R, keep_voxel_size=False):
        """Similarity transform of the whole map about the first keyframe: X' = a + s R (X - a)."""
        a = self.kfs[0].C.copy() if self.kfs else np.zeros(3)
        T = lambda X: a + s * (np.asarray(X) - a) @ R.T  # noqa: E731
        self.mp_xyz = T(self.mp_xyz)
        for k in self.kfs:
            k.C = T(k.C)
            k.R_wc = R @ k.R_wc
            k.median_depth *= s
        self.trajectory = [T(c) for c in self.trajectory]
        if self.last_pose is not None:
            self.last_pose = (R @ self.last_pose[0], T(self.last_pose[1]))
        if self.prev_pose is not None:
            self.prev_pose = (R @ self.prev_pose[0], T(self.prev_pose[1]))
        if self.anchor is not None:
            self.anchor = (R @ self.anchor[0], T(self.anchor[1]))
        if self.voxels is not None:
            xyz, rgb = self.voxels.points()
            old = self.voxels
            base = old.sizes[0] * (1.0 if keep_voxel_size else s)
            self.voxels = VoxelMap(base_size=base, levels=len(old.sizes), min_obs=old.min_obs)
            X = T(xyz.astype(np.float64))
            # depth proxy for voxel level: distance to the nearest recent keyframe centre
            Cs = np.array([k.C for k in self.kfs[-20:]])
            d = np.full(len(X), np.inf)
            for c in Cs:
                d = np.minimum(d, np.linalg.norm(X - c, axis=1))
            self.voxels.insert(X, rgb, d, float(old.min_obs))
            self.voxels.emitted[: self.voxels.n] = True
        self.rescaled = True

    # ------------------------------------------- no telemetry (screen capture, e.g. DJI Avata)
    def _gravity_check(self):
        """Estimate "up" assuming the horizon is kept level (DJI Avata Normal/Sport mode):
        every keyframe's camera x-axis is then horizontal, so up is orthogonal to all of them."""
        if not self.cfg["assume_level_horizon"] or any(k.R_tel is not None for k in self.kfs):
            return
        n = len(self.kfs)
        if n < 6 or n - self._last_gravity_kf < 4:
            return
        X = np.array([k.R_wc[:, 0] for k in self.kfs[-60:]])
        Y = -np.array([k.R_wc[:, 1] for k in self.kfs[-60:]]).mean(0)
        _, S, Vt = np.linalg.svd(X, full_matrices=False)
        if S[1] / max(S[0], 1e-9) > 0.2:        # enough heading change to pin it down
            up = Vt[2] * np.sign(Vt[2] @ Y)
            self.gravity_quality = "good"
        else:                                    # flew in one direction only: camera up as proxy
            up = Y / np.linalg.norm(Y)
            self.gravity_quality = "rough"
        up = self._refine_up_with_floor(up)
        z = np.array([0, 0, 1.0])
        ang = math.degrees(math.acos(np.clip(up @ z, -1, 1)))
        self._last_gravity_kf = n
        if ang < 1.0 and self.gravity_aligned:
            return
        axis = np.cross(up, z)
        if np.linalg.norm(axis) < 1e-9:
            R = np.eye(3)
        else:
            axis /= np.linalg.norm(axis)
            R = cv2.Rodrigues(axis * math.radians(ang))[0]
        self._transform(1.0, R)
        self.gravity_aligned = True
        if len(self.height_marks) == 2:
            self.height_scale_result = self._try_height_scale()

    def _refine_up_with_floor(self, up, max_dev_deg=15.0):
        """The ground / floor is the largest level surface: snap 'up' to its normal if it is close."""
        if self.voxels is None or len(self.voxels) < 3000:
            return up
        xyz, _ = self.voxels.points()
        rng = np.random.default_rng(len(self.kfs))
        P = xyz[rng.choice(len(xyz), min(len(xyz), 20000), replace=False)].astype(np.float64)
        diag = float(np.linalg.norm(np.percentile(P, 95, 0) - np.percentile(P, 5, 0)))
        thr = 0.004 * diag
        best_n, best_cnt = None, 0
        cos_lim = math.cos(math.radians(max_dev_deg))
        for _ in range(300):
            a, b, c = P[rng.choice(len(P), 3, replace=False)]
            nrm = np.cross(b - a, c - a)
            nn = np.linalg.norm(nrm)
            if nn < 1e-12:
                continue
            nrm /= nn
            if abs(nrm @ up) < cos_lim:
                continue
            cnt = int((np.abs((P - a) @ nrm) < thr).sum())
            if cnt > best_cnt:
                best_n, best_cnt, best_a = nrm, cnt, a
        if best_n is None or best_cnt < 0.08 * len(P):
            return up
        inl = P[np.abs((P - best_a) @ best_n) < thr]
        _, _, Vt = np.linalg.svd(inl - inl.mean(0), full_matrices=False)
        nrm = Vt[2] * np.sign(Vt[2] @ up)
        self.gravity_quality = "floor"
        return nrm

    def _osd_height_scale(self):
        """Continuous metric scale from the height H that DJI Fly prints on screen (read by OCR).

        Uses pairs of keyframes between which the drone moved mostly vertically (climbs/descents):
        there the map's height change is barely affected by a small error in 'up', unlike level
        flight where a 2 deg tilt would leak horizontal distance into the heights."""
        if not self.gravity_aligned or any(k.R_tel is not None for k in self.kfs):
            return
        ks = [k for k in self.kfs[-self.cfg["osd_scale_window"]:] if k.alt is not None]
        if len(ks) < 4:
            return
        X = np.array([k.C for k in ks])
        h = np.array([k.alt for k in ks])
        num = den = 0.0
        used_dh = 0.0
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                dh = h[j] - h[i]
                d = X[j] - X[i]
                if abs(dh) < 0.6 or abs(d[2]) < 1e-9:
                    continue
                vert = abs(d[2]) / (np.linalg.norm(d) + 1e-12)
                if vert < 0.8:                       # mostly vertical pairs only
                    continue
                w = vert ** 4
                num += w * d[2] * dh
                den += w * d[2] * d[2]
                used_dh = max(used_dh, abs(dh))
        if den <= 0 or used_dh < self.cfg["osd_min_height_span_m"]:
            return
        f = num / den
        if f <= 0:
            return
        n_since = len(self.kfs) - self._last_rescale_kf
        if n_since < 3 or (self.metric and abs(f - 1) < 0.04):
            return
        self.apply_scale(f, "osd_height")
        self._last_rescale_kf = len(self.kfs)

    def apply_scale(self, factor, source="manual"):
        if not self.kfs or not 0.01 < factor < 100:
            return False
        self._transform(float(factor), np.eye(3))
        self.metric = True
        self.scale_source = source
        self.scale_corrections.append(round(float(factor), 4))
        return True

    def _anchor_current(self):
        """Current drone position expressed relative to the latest keyframe, so it follows
        every later map correction (BA, gravity levelling, rescaling)."""
        kf = self.kfs[-1]
        return kf, kf.R_wc.T @ (self.last_pose[1] - kf.C) / max(kf.median_depth, 1e-9)

    @staticmethod
    def _anchored_pos(anchor):
        kf, v = anchor
        return kf.C + kf.R_wc @ (v * kf.median_depth)

    def mark_height(self, meters):
        """Pair the drone's displayed height (DJI Fly 'H') with the current map position.
        Two marks >= 1 m apart, taken while climbing/descending straight up, fix the metric scale.
        If the map is not levelled yet the pair is kept and applied automatically later."""
        if self.last_pose is None or not self.kfs or self.state != "tracking":
            return dict(ok=False, reason="not tracking yet")
        mark = (self._anchor_current(), float(meters))
        if not self.height_marks:
            self.height_marks = [mark]
            return dict(ok=True, marks=1)
        if abs(mark[1] - self.height_marks[0][1]) < 1.0:
            return dict(ok=False, marks=1, reason="change height by at least 1 m between the two marks")
        self.height_marks = [self.height_marks[0], mark]
        return self._try_height_scale()

    def _try_height_scale(self):
        if len(self.height_marks) < 2:
            return dict(ok=True, marks=len(self.height_marks))
        if not (self.gravity_aligned or any(k.R_tel is not None for k in self.kfs)):
            return dict(ok=True, marks=2, pending=True,
                        reason="saved - scale is applied automatically once the map is levelled")
        (a0, h0), (a1, h1) = self.height_marks
        d = self._anchored_pos(a1) - self._anchored_pos(a0)
        dz = d[2]
        if np.hypot(d[0], d[1]) > 0.5 * abs(dz):
            self.height_marks = []
            return dict(ok=False, marks=0, reason="climb or descend straight up/down between the marks, "
                        "without flying sideways (e.g. right after take-off)")
        f = (h1 - h0) / dz if abs(dz) > 1e-9 else -1
        if f <= 0:
            self.height_marks = []
            return dict(ok=False, marks=0, reason="height change not visible in the map - try again")
        self.apply_scale(f, "height")
        self.height_marks = []
        return dict(ok=True, factor=round(float(f), 4))

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
        if len(p0) == 0:                 # OpenCV 4.5 raises on empty input
            return np.zeros((0, 3))
        Pa = _proj_mat(self.K, ka.R_wc, ka.C)
        Pb = _proj_mat(self.K, kb.R_wc, kb.C)
        Xh = cv2.triangulatePoints(Pa, Pb, _c(p0.T), _c(p1.T))
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
        if ka.mask is not None:   # no depth from OSD / overlay pixels
            sel &= cv2.resize(ka.mask, (ww, hh), interpolation=cv2.INTER_NEAREST)[ys, xs] > 0
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
        alt = (tm or {}).get("alt_osd")
        self._alt = float(alt) if alt is not None else None
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
                    gyro_guard_hits=self.gyro_guard_hits, gravity_aligned=self.gravity_aligned,
                    gravity_quality=self.gravity_quality,
                    scale_source=self.scale_source or ("telemetry" if self.metric else None),
                    overlay_masked=None if self.mask is None else round(float((self.mask == 0).mean()), 3),
                    black_screen=self.prep.black_frames > 10, init_reason=self.boot_reason if self.state == "init" else None,
                    **self.timing)
