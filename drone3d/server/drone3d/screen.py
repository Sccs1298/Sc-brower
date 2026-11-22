"""Frames captured from the phone screen (DJI Fly live view, e.g. DJI Avata 1/2 via goggles).

Unlike the SDK video feed, a screen capture contains:
  * the DJI Fly on-screen display (altitude, speed, battery, icons...) - static pixels
    that would otherwise be tracked as if they were part of the world;
  * our own floating model window (its rectangle is sent with every frame);
  * a very wide-angle (fisheye-like) image that must be undistorted.

FramePrep handles all of that before the mapper sees the frame:
    crop -> mask (explicit rects + auto-detected static overlay) -> undistort
and returns the image, a feature mask (255 = usable) and the matching intrinsics.

Calibrator estimates the lens from views of a printed chessboard.
"""
import json
import math

import cv2
import numpy as np


def _rect_px(r, w, h):
    """[x, y, w, h] as fractions (<=1) or pixels -> integer pixel rect clipped to the image."""
    x, y, rw, rh = r
    if max(abs(x), abs(y), abs(rw), abs(rh)) <= 1.0:
        x, y, rw, rh = x * w, y * h, rw * w, rh * h
    x0, y0 = max(0, int(math.floor(x))), max(0, int(math.floor(y)))
    x1, y1 = min(w, int(math.ceil(x + rw))), min(h, int(math.ceil(y + rh)))
    return x0, y0, x1, y1


class StaticOverlayDetector:
    """Finds pixels that stay the same while the scene behind them moves (OSD text, icons, reticle).

    Averaged over many moving frames the world washes out to a blur, while overlay graphics stay
    sharp: overlay = sharp edges in the running mean AND rarely-changing pixels."""

    def __init__(self, scale=0.5, min_moving_frames=10, change_thr=10, static_ratio=0.35, edge_thr=40):
        self.scale = scale
        self.min_moving = min_moving_frames
        self.change_thr = change_thr
        self.static_ratio = static_ratio
        self.edge_thr = edge_thr
        self.reset()

    def reset(self):
        self.prev = None
        self.changed = None
        self.mean = None
        self.moving = 0
        self.mask = None   # 255 where overlay

    def update(self, gray):
        small = cv2.resize(gray, None, fx=self.scale, fy=self.scale, interpolation=cv2.INTER_AREA).astype(np.int16)
        if self.prev is None or self.prev.shape != small.shape:
            self.prev = small
            self.changed = np.zeros(small.shape, np.float32)
            self.mean = np.zeros(small.shape, np.float32)
            self.moving = 0
            return self.mask
        diff = np.abs(small - self.prev) > self.change_thr
        self.prev = small
        if diff.mean() < 0.06:          # scene not moving enough to tell overlay from world
            return self.mask
        self.moving += 1
        self.changed += diff
        self.mean += small
        if self.moving >= self.min_moving:
            ratio = self.changed / self.moving
            mean = self.mean / self.moving
            gx = cv2.Sobel(mean, cv2.CV_32F, 1, 0)
            gy = cv2.Sobel(mean, cv2.CV_32F, 0, 1)
            sharp = cv2.dilate((np.hypot(gx, gy) > self.edge_thr).astype(np.uint8), np.ones((3, 3), np.uint8))
            m = ((ratio < self.static_ratio) & (sharp > 0)).astype(np.uint8) * 255
            m = cv2.dilate(m, np.ones((5, 5), np.uint8))
            self.mask = m
            if self.moving > 200:       # slowly forget, so a vanished OSD element frees its pixels
                self.changed *= 0.5
                self.mean *= 0.5
                self.moving //= 2
        return self.mask


class FramePrep:
    def __init__(self, cfg):
        self.crop = cfg.get("crop")                     # [left, top, right, bottom] fractions trimmed
        self.auto_mask = cfg.get("auto_overlay_mask", False)
        self.calib = cfg.get("calib")
        self.border = cfg.get("mask_border_px", 6)
        self.overlay = StaticOverlayDetector()
        self._maps_key = None
        self._maps = None
        self.K = None
        self.black_frames = 0
        self.default_margins = cfg.get("osd_margins", (0.08, 0.12, 0.08, 0.16))

    @property
    def ready(self):
        """False while the on-screen-display mask is still being learned."""
        return not self.auto_mask or self.overlay.mask is not None

    def reset(self):
        self.overlay.reset()
        self.black_frames = 0

    def set_calibration(self, calib):
        self.calib = calib
        self._maps_key = None

    @property
    def active(self):
        return bool(self.crop or self.auto_mask or self.calib)

    def __call__(self, img, tm):
        """Returns (img, mask or None, K or None)."""
        tm = tm or {}
        h, w = img.shape[:2]
        crop = tm.get("crop", self.crop)
        if crop:
            l, t, r, b = crop
            x0, y0 = int(round(l * w)), int(round(t * h))
            x1, y1 = int(round(w - r * w)), int(round(h - b * h))
            img = img[y0:y1, x0:x1]
        else:
            x0 = y0 = 0
        h2, w2 = img.shape[:2]
        mask = None
        rects = tm.get("mask") or []
        if rects or self.auto_mask:
            mask = np.full((h2, w2), 255, np.uint8)
            for r in rects:                      # rects are given in full-frame coordinates
                a0, b0, a1, b1 = _rect_px(r, w, h)
                mask[max(0, b0 - y0):max(0, b1 - y0), max(0, a0 - x0):max(0, a1 - x0)] = 0
            if self.auto_mask:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                self.black_frames = self.black_frames + 1 if gray.mean() < 4 else 0
                om = self.overlay.update(gray)
                if om is not None:
                    om = cv2.resize(om, (w2, h2), interpolation=cv2.INTER_NEAREST)
                    mask[om > 0] = 0
                else:
                    # not learned yet: the DJI Fly readouts live along the screen edges
                    l, t, r, b = self.default_margins
                    mask[: int(t * h2)] = 0
                    mask[h2 - int(b * h2):] = 0
                    mask[:, : int(l * w2)] = 0
                    mask[:, w2 - int(r * w2):] = 0
        K = None
        if self.calib:
            img, mask, K = self._undistort(img, mask)
        if mask is not None and self.border:
            b = self.border
            mask[:b], mask[-b:], mask[:, :b], mask[:, -b:] = 0, 0, 0, 0
        return img, mask, K

    def _undistort(self, img, mask):
        h, w = img.shape[:2]
        key = (w, h)
        if self._maps_key != key:
            self._maps = undistort_maps(self.calib, w, h)
            self._maps_key = key
        m1, m2, K = self._maps
        img = cv2.remap(img, m1, m2, cv2.INTER_LINEAR)
        valid = cv2.remap(np.full((h, w), 255, np.uint8), m1, m2, cv2.INTER_NEAREST, borderValue=0)
        if mask is not None:
            mask = cv2.remap(mask, m1, m2, cv2.INTER_NEAREST, borderValue=0)
            mask = cv2.bitwise_and(mask, valid)
        else:
            mask = valid
        return img, mask, K


def _scaled_K(calib, w, h):
    cw, ch = calib["size"]
    K = np.array(calib["K"], float).copy()
    K[0] *= w / cw
    K[1] *= h / ch
    return K


def undistort_maps(calib, w, h, max_hfov=110.0):
    """Remap tables to a pinhole image of the same size. Very wide lenses are cropped to max_hfov."""
    K = _scaled_K(calib, w, h)
    D = np.array(calib["dist"], float)
    if calib.get("model") == "fisheye":
        newK = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(K, D.reshape(4, 1), (w, h), np.eye(3),
                                                                       balance=0.0)
    else:
        newK = K.copy()      # keep the lens' own scale at the centre; the stretched rim is cropped
    # cap the field of view: a pinhole image of a 150 deg lens is mostly stretched edges
    hfov = math.degrees(2 * math.atan(w / 2 / newK[0, 0]))
    if hfov > max_hfov:
        f = (w / 2) / math.tan(math.radians(max_hfov) / 2)
        newK[0, 0] = newK[1, 1] = f
    newK[0, 2], newK[1, 2] = w / 2.0, h / 2.0
    if calib.get("model") == "fisheye":
        m1, m2 = cv2.fisheye.initUndistortRectifyMap(K, D.reshape(4, 1), np.eye(3), newK, (w, h), cv2.CV_16SC2)
    else:
        m1, m2 = cv2.initUndistortRectifyMap(K, D, np.eye(3), newK, (w, h), cv2.CV_16SC2)
    return m1, m2, newK


class Calibrator:
    """Lens calibration from views of a chessboard (inner corners pattern, e.g. 9x6)."""

    def __init__(self, pattern=(9, 6), min_views=12, max_views=40):
        self.pattern = tuple(pattern)
        self.min_views = min_views
        self.max_views = max_views
        self.views = []          # corner arrays
        self.size = None
        self._last = None

    def add(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        h, w = gray.shape
        if self.size is not None and self.size != (w, h):
            self.views, self._last = [], None
        self.size = (w, h)
        s = min(1.0, 640.0 / w)
        small = cv2.resize(gray, None, fx=s, fy=s) if s < 1 else gray
        found, corners = cv2.findChessboardCorners(
            small, self.pattern, flags=cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE | cv2.CALIB_CB_FAST_CHECK)
        info = dict(found=bool(found), views=len(self.views), needed=self.min_views)
        if not found:
            return info
        corners = (corners.reshape(-1, 1, 2) / s).astype(np.float32)
        cv2.cornerSubPix(gray, corners, (7, 7), (-1, -1),
                         (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.01))
        # keep only views that differ from the previous one (moved the board / drone)
        if self._last is not None and np.median(np.linalg.norm((corners - self._last).reshape(-1, 2), axis=1)) < 0.04 * w:
            return info
        if len(self.views) < self.max_views:
            self.views.append(corners)
            self._last = corners
        info["views"] = len(self.views)
        return info

    def solve(self):
        if len(self.views) < self.min_views:
            raise ValueError(f"need {self.min_views} chessboard views, have {len(self.views)}")
        cols, rows = self.pattern
        obj = np.zeros((rows * cols, 3), np.float32)
        obj[:, :2] = np.mgrid[0:cols, 0:rows].T.reshape(-1, 2)
        w, h = self.size
        objs = [obj] * len(self.views)
        out = []
        rms, K, D, _, _ = cv2.calibrateCamera(objs, self.views, (w, h), None, None)
        out.append(dict(model="pinhole", K=K.tolist(), dist=D.ravel().tolist(), rms=float(rms)))
        # the rational model fits very wide lenses better, but extrapolates wildly - only if clearly better
        rms_r, K_r, D_r, _, _ = cv2.calibrateCamera(objs, self.views, (w, h), None, None,
                                                    flags=cv2.CALIB_RATIONAL_MODEL)
        if rms_r < 0.7 * rms:
            out[0] = dict(model="pinhole", K=K_r.tolist(), dist=D_r.ravel().tolist(), rms=float(rms_r))
        try:
            K0 = np.eye(3)
            K0[0, 0] = K0[1, 1] = w / 2.0
            K0[0, 2], K0[1, 2] = w / 2.0, h / 2.0
            rmsf, Kf, Df, _, _ = cv2.fisheye.calibrate(
                [o.reshape(-1, 1, 3).astype(np.float64) for o in objs],
                [v.reshape(-1, 1, 2).astype(np.float64) for v in self.views], (w, h), K0, np.zeros((4, 1)),
                flags=cv2.fisheye.CALIB_RECOMPUTE_EXTRINSIC | cv2.fisheye.CALIB_FIX_SKEW,
                criteria=(cv2.TERM_CRITERIA_COUNT + cv2.TERM_CRITERIA_EPS, 100, 1e-7))
            out.append(dict(model="fisheye", K=Kf.tolist(), dist=Df.ravel().tolist(), rms=float(rmsf)))
        except cv2.error:
            pass
        # prefer the plain model unless fisheye is clearly better (it is for >120 deg raw lenses)
        best = out[0] if len(out) == 1 or out[1]["rms"] > 0.8 * out[0]["rms"] else out[1]
        best["size"] = [w, h]
        best["views"] = len(self.views)
        best["hfov_raw"] = round(math.degrees(2 * math.atan(w / 2 / best["K"][0][0])), 1)
        return best


def save_calibration(path, calib):
    with open(path, "w") as f:
        json.dump(calib, f, indent=1)


def load_calibration(path):
    with open(path) as f:
        return json.load(f)
