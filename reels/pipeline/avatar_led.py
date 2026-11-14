"""Faceless hooded hacker avatar with an animated LED dot-matrix mask.

The face inside the hood is pure darkness; on it we draw a glowing LED mask:
  * eyes that blink and glance around
  * a mouth of equaliser bars driven by the voice track (per-frame band energies)
The hooded body is cut out (mask) and gently breathes / sways over an in-painted
background plate, with the Israeli flag on the wall behind and the red LED glow.
"""
import subprocess

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 30


def voice_bands(wav, n_bars=9):
    """per-frame (30fps) energy in n_bars bands of the speech range, normalised 0..1"""
    sr = 16000
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", wav, "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
    hop, win = sr // FPS, 1024
    edges = np.geomspace(120, 4500, n_bars + 1)
    freqs = np.fft.rfftfreq(win, 1 / sr)
    out = []
    for i in range(0, len(a) - win, hop):
        sp = np.abs(np.fft.rfft(a[i:i + win] * np.hanning(win)))
        out.append([sp[(freqs >= lo) & (freqs < hi)].mean() for lo, hi in zip(edges[:-1], edges[1:])])
    b = np.log1p(np.array(out) * 40)
    b = b / (np.percentile(b, 97, axis=0) + 1e-6)
    b = np.clip(b, 0, 1)
    # attack fast / release slow, like a real VU meter
    sm = np.zeros_like(b)
    for i in range(len(b)):
        prev = sm[i - 1] if i else 0
        sm[i] = np.where(b[i] > prev, prev + (b[i] - prev) * 0.75, prev * 0.72)
    return sm


class LedAvatar:
    def __init__(self, img_path, mask_path, face_xy, face_w, wav, flag=None, glow=None, color=(255, 246, 127)):
        im = cv2.imread(img_path).astype(np.float32) / 255
        m = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
        s = max(W / im.shape[1], H / im.shape[0])
        im = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
        m = cv2.resize(m, (im.shape[1], im.shape[0]))
        ox, oy = (im.shape[1] - W) // 2, (im.shape[0] - H) // 2
        im, m = im[oy:oy + H, ox:ox + W].clip(0, 1), m[oy:oy + H, ox:ox + W]
        self.face = (face_xy[0] * s - ox, face_xy[1] * s - oy)
        self.face_w = face_w * s
        m = np.clip((m - 0.35) * 3, 0, 1)
        # clean plate: remove the person, fill from the surroundings
        hole = (cv2.dilate((m > 0.05).astype(np.uint8), np.ones((25, 25), np.uint8)) * 255)
        bg = cv2.inpaint((im * 255).astype(np.uint8), hole, 9, cv2.INPAINT_TELEA).astype(np.float32) / 255
        bg = cv2.GaussianBlur(bg, (0, 0), 3)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        if flag is not None:
            fw, fm = flag
            bg = bg * (1 - fm) + fw * fm
        if glow is not None:
            bg = 1 - (1 - bg) * (1 - glow)
            # red LED rim on the hoodie (left side)
            rim = np.clip(1 - xx / (W * 0.55), 0, 1)[..., None] ** 2 * np.array([0.02, 0.02, 0.35], np.float32)
            im = 1 - (1 - im) * (1 - rim * m[..., None])
        self.bg, self.fg, self.m = bg, im, cv2.GaussianBlur(m, (0, 0), 1.2)
        self.bands = voice_bands(wav)
        self.col = np.array(color, np.float32) / 255
        rng = np.random.default_rng(11)
        t, self.blinks = 1.2, []
        while t < 600:
            self.blinks.append(t)
            t += rng.uniform(2.2, 4.8)
        self.glances = [(rng.uniform(0, 600), rng.choice([-1, 1])) for _ in range(140)]

    # ------------------------------------------------------------- LED face
    def led_layer(self, t):
        """RGBA-ish float layer (H, W, 3) with the glowing LED mask, in body space"""
        cx, cy = self.face
        pitch = self.face_w / 15.5
        r = pitch * 0.34
        lay = np.zeros((H, W, 3), np.float32)
        dots = []
        # eyes: 4x3 dot blocks, blink = collapse to 1 row
        b = min((abs(t - bt) for bt in self.blinks), default=9)
        open_rows = 3 if b > 0.09 else 1
        gx = 0
        for gt, d in self.glances:
            if gt <= t < gt + 0.9:
                gx = d
        for ex in (-4.5, 1.5):
            for i in range(4):
                for j in range(3):
                    if open_rows == 1 and j != 1:
                        continue
                    dots.append((cx + (ex + i + gx * 0.8) * pitch, cy + (-2.0 + j) * pitch, 1.0))
        # mouth: 9 equaliser columns
        fi = min(int(t * FPS), len(self.bands) - 1)
        bands = self.bands[fi]
        prof = np.array([0.55, 0.75, 0.9, 1.0, 1.0, 1.0, 0.9, 0.75, 0.55])
        for k in range(9):
            h = 1 + int(round(bands[k] * prof[k] * 4))   # 1..5 dots, symmetric around the mouth line
            x = cx + (k - 4) * pitch
            for j in range(h):
                dots.append((x, cy + (2.6 + j * 0.85) * pitch, 0.85 + 0.15 * (h > 1)))
        for x, y, a in dots:
            cv2.circle(lay, (int(x), int(y)), int(r), (a, a, a), -1, cv2.LINE_AA)
        core = lay * self.col
        glow = cv2.GaussianBlur(core, (0, 0), pitch * 0.9) * 2.2 + cv2.GaussianBlur(core, (0, 0), pitch * 2.6) * 1.4
        return core + glow * 0.9 + lay * 0.35  # hot white centres

    def body_xform(self, t):
        br = 1 + 0.006 * np.sin(2 * np.pi * t / 3.8)
        sway = 5 * np.sin(2 * np.pi * t / 6.3) + 2 * np.sin(2 * np.pi * t / 2.1)
        tilt = 0.6 * np.sin(2 * np.pi * t / 7.7)
        cx, cy = self.face[0], H
        M = cv2.getRotationMatrix2D((cx, cy), tilt, 1.0)
        M[1, 1] *= br
        M[1, 2] += cy * (1 - br)
        M[0, 2] += sway
        return M

    def frame(self, t, zoom=1.0):
        M = self.body_xform(t)
        fg = cv2.warpAffine(self.fg, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        m = cv2.warpAffine(self.m, M, (W, H), flags=cv2.INTER_LINEAR)[..., None]
        led = cv2.warpAffine(self.led_layer(t), M, (W, H), flags=cv2.INTER_LINEAR)
        # LED light spills onto the inside of the hood
        spill = cv2.GaussianBlur(led, (0, 0), 40) * 0.6
        out = self.bg * (1 - m) + fg * m
        out = 1 - (1 - out) * (1 - np.clip(spill * m, 0, 1))
        out = 1 - (1 - out) * (1 - np.clip(led, 0, 1))
        if zoom != 1.0:
            h2, w2 = int(H / zoom), int(W / zoom)
            cy0 = int(np.clip(self.face[1] - h2 * 0.42, 0, H - h2))
            cx0 = int(np.clip(self.face[0] - w2 / 2, 0, W - w2))
            out = cv2.resize(out[cy0:cy0 + h2, cx0:cx0 + w2], (W, H), interpolation=cv2.INTER_LINEAR)
        return out, m

    def corner(self, base, t, width=440, right=-30, bottom=0):
        out, m = self.frame(t)
        # crop hood + shoulders
        cx, cy = self.face
        x0, x1 = int(cx - self.face_w * 1.9), int(cx + self.face_w * 1.9)
        y0, y1 = int(cy - self.face_w * 1.35), int(cy + self.face_w * 3.3)
        x0, y0 = max(x0, 0), max(y0, 0)
        crop, cm = out[y0:y1, x0:x1], m[y0:y1, x0:x1, 0]
        s = width / crop.shape[1]
        crop = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        cm = cv2.resize(cm, (crop.shape[1], crop.shape[0]))
        # fade the bottom so the cut-off body melts into the screen
        fade = np.clip(np.linspace(1.6, 0, cm.shape[0]), 0, 1)[:, None]
        cm = (cm * fade)[..., None]
        hh, ww = crop.shape[:2]
        X0, Y0 = W - ww - right, H - hh - bottom
        xs, ys = max(X0, 0), max(Y0, 0)
        xe, ye = min(X0 + ww, W), min(Y0 + hh, H)
        roi = base[ys:ye, xs:xe]
        c = crop[ys - Y0:ye - Y0, xs - X0:xe - X0]
        a = cm[ys - Y0:ye - Y0, xs - X0:xe - X0]
        sh = cv2.GaussianBlur(a[..., 0], (0, 0), 16)[..., None]
        roi[:] = roi * (1 - 0.6 * sh)
        roi[:] = roi * (1 - a) + c * a
