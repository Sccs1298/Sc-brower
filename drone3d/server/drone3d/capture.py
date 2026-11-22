"""Live source for iPhone users: grab the computer screen where the iPhone is mirrored (AirPlay).

iPhone (DJI Fly, live view from the Avata goggles) --AirPlay screen mirroring--> AirPlay receiver on
the laptop (e.g. UxPlay) shows it in a window --> this module grabs that window/monitor a few times
per second, crops the black letterbox bars, reads the height 'H' that DJI Fly prints (Tesseract OCR,
optional) and feeds the frames to the mapper in screen mode (on-screen display masked automatically).
"""
import logging
import re
import shutil
import subprocess
import sys
import threading
import time

import cv2
import numpy as np

log = logging.getLogger("drone3d.capture")

STRICT_H = re.compile(r"(?:^|\s)(?:H|ALT)\s*[:=]?\s*(-?\d{1,4}[.,]\d)\s*(m|ft)\b", re.IGNORECASE)
H_PATTERN = re.compile(r"(?:^|\s)(?:H|ALT)\s*[:=]?\s*(-?\d{1,4}(?:[.,]\d)?)\s*(m|ft)?\b", re.IGNORECASE)


def parse_height(text):
    """'H 12.3m' / 'H 40 ft' / 'ALT 3,5 m' -> metres (first match), else None."""
    for line in text.splitlines():
        m = H_PATTERN.search(line)
        if m:
            v = float(m.group(1).replace(",", "."))
            return v * 0.3048 if (m.group(2) or "").lower() == "ft" else v
    return None


class LetterboxCropper:
    """Finds the mirrored phone picture inside the receiver window (drops black bars around it)."""

    def __init__(self, every_s=2.0, thr=12):
        self.every = every_s
        self.thr = thr
        self.acc = None
        self.box = None
        self.last = 0.0

    def __call__(self, img):
        small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA).max(axis=2)
        self.acc = small if self.acc is None or self.acc.shape != small.shape else np.maximum(self.acc * 0.98, small)
        now = time.time()
        if self.box is None or now - self.last > self.every:
            self.last = now
            rows = np.where((self.acc > self.thr).mean(axis=1) > 0.02)[0]
            cols = np.where((self.acc > self.thr).mean(axis=0) > 0.02)[0]
            if len(rows) > 10 and len(cols) > 10:
                h, w = img.shape[:2]
                y0, y1 = rows[0] * 4, min(h, (rows[-1] + 1) * 4)
                x0, x1 = cols[0] * 4, min(w, (cols[-1] + 1) * 4)
                if (y1 - y0) * (x1 - x0) > 0.1 * h * w:
                    self.box = (x0, y0, x1, y1)
        if self.box is None:
            return img
        x0, y0, x1, y1 = self.box
        return img[y0:y1, x0:x1]


class HeightOCR:
    """Reads DJI Fly's on-screen height in a background thread (needs the `tesseract` program)."""

    def __init__(self, period_s=1.5, max_age_s=3.0):
        self.period = period_s
        self.max_age = max_age_s
        self.value = None
        self.at = 0.0
        self.text = ""
        self._frame = None
        self.frame_t = None     # timestamp of the frame the current value was read from
        self._lock = threading.Lock()
        try:
            import pytesseract  # noqa: F401
            self.available = shutil.which("tesseract") is not None
        except ImportError:
            self.available = False
        if self.available:
            threading.Thread(target=self._run, daemon=True).start()
        else:
            log.warning("tesseract/pytesseract not found: height H will not be read automatically "
                        "(use the 'scale' panel in the viewer to type it)")

    def feed(self, img, t_ms):
        with self._lock:
            self._frame = (img, t_ms)

    def current(self):
        return self.value if self.value is not None and time.time() - self.at < self.max_age else None

    def _run(self):
        import pytesseract
        while True:
            time.sleep(self.period)
            with self._lock:
                item, self._frame = self._frame, None
            if item is None:
                continue
            img, t_ms = item
            try:
                v = self.read(img, pytesseract)
            except Exception as e:      # OCR must never break the capture
                log.debug("ocr failed: %s", e)
                continue
            if v is None:
                continue
            if self.value is not None and time.time() - self.at < 3 and abs(v - self.value) > 5:
                continue                # single-frame OCR glitch
            self.value, self.at, self.frame_t = v, time.time(), t_ms

    def read(self, img, pytesseract):
        """Height H from one frame, or None.

        Primary: DJI Fly's white text isolated by colour, accepted only in the strict form
        'H <number with decimal> m|ft'. Fallback: two binarisations agreeing on a looser match.
        (A misread height is worse than none; single-digit confusions average out in the scale fit.)"""
        s = 1600.0 / max(img.shape[:2])
        big = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
        hsv = cv2.cvtColor(big, cv2.COLOR_BGR2HSV)
        white = ((hsv[..., 2] > 170) & (hsv[..., 1] < 70)).astype(np.uint8) * 255
        white = cv2.dilate(white, np.ones((2, 2), np.uint8))
        cfg = "--psm 11 -c tessedit_char_whitelist=HALThalt0123456789.,:mft"
        t1 = pytesseract.image_to_string(255 - white, config=cfg)
        self.text = t1
        m = STRICT_H.search(t1)
        if m:
            v = float(m.group(1).replace(",", "."))
            return v * 0.3048 if m.group(2).lower() == "ft" else v
        gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
        otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        t2 = pytesseract.image_to_string(255 - otsu, config=cfg)
        self.text = t1 + " | " + t2
        a, b = parse_height(t1), parse_height(t2)
        if a is not None and b is not None and abs(a - b) < 0.051:
            return a
        return None


def find_window(title):
    """Screen rectangle (left, top, width, height) of a window whose title contains `title`."""
    if sys.platform.startswith(("win", "darwin")):
        try:
            import pygetwindow as gw
            for w in gw.getWindowsWithTitle(title):
                if w.width > 100 and w.height > 100:
                    return (w.left, w.top, w.width, w.height)
        except Exception as e:
            log.debug("pygetwindow: %s", e)
        return None
    if shutil.which("xdotool"):
        try:
            wid = subprocess.run(["xdotool", "search", "--name", title], capture_output=True, text=True,
                                 timeout=2).stdout.split()
            if wid:
                out = subprocess.run(["xdotool", "getwindowgeometry", "--shell", wid[-1]], capture_output=True,
                                     text=True, timeout=2).stdout
                g = dict(line.split("=") for line in out.split())
                return (int(g["X"]), int(g["Y"]), int(g["WIDTH"]), int(g["HEIGHT"]))
        except Exception as e:
            log.debug("xdotool: %s", e)
    return None


class ScreenGrabber:
    def __init__(self, monitor=1, region=None, window=None):
        import mss
        self.sct = mss.mss()
        self.monitor = monitor
        self.region = region
        self.window = window
        self._win_box = None
        self._win_at = 0.0

    def bbox(self):
        if self.region:
            x, y, w, h = self.region
            return dict(left=x, top=y, width=w, height=h)
        if self.window:
            if time.time() - self._win_at > 2.0:
                self._win_box = find_window(self.window) or self._win_box
                self._win_at = time.time()
            if self._win_box:
                x, y, w, h = self._win_box
                return dict(left=x, top=y, width=w, height=h)
        mons = self.sct.monitors
        return mons[min(self.monitor, len(mons) - 1)]

    def grab(self):
        shot = self.sct.grab(self.bbox())
        return np.asarray(shot)[:, :, :3].copy()   # BGRA -> BGR


def screen_source_thread(submit, fps=3.0, monitor=1, region=None, window=None, ocr=True, max_width=1280,
                         stop=None):
    """Grab -> crop -> (OCR) -> JPEG -> submit(tm, jpeg). `submit` must be thread-safe."""
    grabber = ScreenGrabber(monitor, region, window)
    crop = LetterboxCropper()
    reader = HeightOCR() if ocr else None
    period = 1.0 / fps
    log.info("grabbing the screen (%s) at %.1f fps", window or region or f"monitor {monitor}", fps)
    while stop is None or not stop.is_set():
        t0 = time.time()
        try:
            img = crop(grabber.grab())
        except Exception as e:
            log.warning("screen grab failed: %s", e)
            time.sleep(1)
            continue
        if img.shape[1] > max_width:
            s = max_width / img.shape[1]
            img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        tm = dict(t=int(t0 * 1000), source="airplay")
        if reader is not None:
            reader.feed(img, tm["t"])
            h = reader.current()
            if h is not None:
                tm["alt_osd"] = h
                tm["alt_osd_t"] = reader.frame_t
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if ok:
            submit(tm, jpg.tobytes())
        time.sleep(max(0.0, period - (time.time() - t0)))
