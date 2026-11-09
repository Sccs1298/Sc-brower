"""Render a "remy-style" Hebrew tech reel: pixelated-face talking head, GitHub screen
segments with a cut-out presenter in the corner, word-by-word RTL captions.

Usage: python3 render.py <reel.json>
"""
import json
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

cfg = json.load(open(sys.argv[1]))
W, H, FPS = 1080, 1920, 30
A = cfg["assets"]
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- captions
stt = json.load(open(A["stt"]))
words = [w for w in stt["words"] if w["type"] == "word"]
repl = cfg["caption_replace"]
toks = []
i = 0
while i < len(words):
    w = words[i]
    raw = w["text"]
    key = raw.strip(",.?")
    merged = None
    for m in cfg["caption_merge"]:  # e.g. ["ב","Github"] -> "ב-GitHub"
        n = len(m["from"])
        if [x["text"].strip(",.?") for x in words[i:i + n]] == m["from"]:
            merged = (m["to"], n)
            break
    if merged:
        text, n = merged
        end_raw = words[i + n - 1]["text"]
        toks.append(dict(t=text, s=w["start"], e=words[i + n - 1]["end"], end=end_raw[-1:] in ".?"))
        i += n
        continue
    text = repl.get(key, key) + cfg["caption_suffix"].get(key, "")
    toks.append(dict(t=text, s=w["start"], e=w["end"], end=raw[-1:] in ".?" or key in cfg["caption_suffix"]))
    i += 1

section_starts = [s["start"] for s in cfg["sections"]]
chunks, cur = [], []
for k, tk in enumerate(toks):
    if cur:
        gap = tk["s"] - cur[-1]["e"]
        chars = sum(len(x["t"]) for x in cur) + len(tk["t"])
        new_section = any(abs(tk["s"] - s) < 0.25 for s in section_starts)
        if len(cur) >= 3 or chars > 17 or cur[-1]["end"] or gap > 0.45 or new_section:
            chunks.append(cur)
            cur = []
    cur.append(tk)
chunks.append(cur)

FONT = ImageFont.truetype(A["font"], 64)
cap_cache = {}


def caption_img(ci, nspoken):
    key = (ci, nspoken)
    if key in cap_cache:
        return cap_cache[key]
    ch = chunks[ci]
    space = 18
    vis = [x["t"] for x in ch]
    dirs = ["rtl" if any("\u0590" <= c <= "\u05ff" for c in v) else "ltr" for v in vis]
    bbs = [FONT.getbbox(v, direction=dr) for v, dr in zip(vis, dirs)]
    widths = [b[2] - b[0] for b in bbs]
    total = sum(widths) + space * (len(ch) - 1)
    padx, pady, h = 26, 14, 84
    im = Image.new("RGBA", (total + 2 * padx, h + 2 * pady), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=18, fill=(0, 0, 0, 140))
    x = im.width - padx  # RTL: first logical word on the right
    for v, wd, j, dr, bb in zip(vis, widths, range(len(ch)), dirs, bbs):
        x -= wd
        col = (255, 255, 255, 255) if j < nspoken else (165, 165, 165, 255)
        d.text((x - bb[0], pady + 4), v, font=FONT, fill=col, direction=dr)
        x -= space
    arr = np.array(im)
    cap_cache[key] = arr
    return arr


def caption_at(t):
    for ci, ch in enumerate(chunks):
        nxt = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else ch[-1]["e"] + 0.6
        if ch[0]["s"] - 0.05 <= t < nxt:
            n = sum(1 for x in ch if x["s"] <= t + 0.03)
            return caption_img(ci, max(1, n))
    return None


def paste_rgba(dst, rgba, cx, cy):
    h, w = rgba.shape[:2]
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    roi = dst[y0:y0 + h, x0:x0 + w]
    roi[:] = (roi * (1 - a) + rgba[:, :, 2::-1] * a).astype(np.uint8)


# ---------------------------------------------------------------- avatar clips
class Clip:
    def __init__(self, path):
        cap = cv2.VideoCapture(path)
        self.fps = cap.get(cv2.CAP_PROP_FPS)
        self.frames = []
        while True:
            ok, f = cap.read()
            if not ok:
                break
            self.frames.append(f)
        tr = np.load(path + ".track.npz")
        self.boxes, self.masks = tr["boxes"], tr["masks"]
        self.n = len(self.frames)

    def idx(self, t, pingpong=False):
        i = int(t * self.fps)
        if pingpong:
            p = 2 * (self.n - 1)
            i %= p
            return i if i < self.n else p - i
        return min(i, self.n - 1)


def grade(f):
    x = f.astype(np.float32) / 255
    lum = x.mean(2, keepdims=True)
    x = x * 0.8 + lum * 0.2                     # slight desaturation
    x = np.power(x, 1.25) * 0.82                 # darker, moodier
    x[..., 0] += 0.05 * (1 - lum[..., 0]) * 0.6  # cool/teal shadows (B)
    x[..., 1] += 0.02 * (1 - lum[..., 0]) * 0.6
    return np.clip(x, 0, 1)


def glow_map(h, w, cx, cy, r, color):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - cx) / r) ** 2 + ((yy - cy) / r) ** 2)
    g = np.clip(1 - d, 0, 1) ** 2
    return g[..., None] * np.array(color, np.float32)


RED_GLOW = glow_map(H, W, 80, 1500, 1000, (0.05, 0.05, 0.75)) + glow_map(H, W, 1000, 1750, 700, (0.03, 0.02, 0.45))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGNETTE = (1 - 0.55 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.35, 1)[..., None]


VIGNETTE_SOFT = 1 - (1 - VIGNETTE) * 0.35


def finish(x, screen=False):
    """x float BGR 0..1 full frame -> LED glow, vignette, grain -> uint8"""
    if not screen:
        x = 1 - (1 - x) * (1 - RED_GLOW)
    x = x * (VIGNETTE_SOFT if screen else VIGNETTE)
    x = x + rng.normal(0, 0.018, (H // 2, W // 2, 1)).astype(np.float32).repeat(2, 0).repeat(2, 1)
    return (np.clip(x, 0, 1) * 255).astype(np.uint8)


def pixelate(img, box, scale_xy=(1.0, 1.0), off=(0, 0), blocks=7):
    x, y, w, h = box
    sx, sy = scale_xy
    cx, cy = (x + w / 2) * sx + off[0], (y + h / 2) * sy + off[1]
    bw, bh = w * sx * 1.55, h * sy * 1.95
    x0, y0 = int(max(cx - bw / 2, 0)), int(max(cy - bh * 0.58, 0))
    x1, y1 = int(min(cx + bw / 2, img.shape[1])), int(min(cy + bh * 0.42, img.shape[0]))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return
    roi = img[y0:y1, x0:x1]
    bx = blocks
    by = max(1, round(blocks * (y1 - y0) / (x1 - x0)))
    small = cv2.resize(roi, (bx, by), interpolation=cv2.INTER_AREA)
    img[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)


def talking_head(clip, t, zoom=1.0, crop_center_face=False, pingpong=False):
    i = clip.idx(t, pingpong)
    f = clip.frames[i]
    sh, sw = f.shape[:2]
    box = clip.boxes[i]
    # crop to 9:16 (centered on face for landscape sources), then zoom
    cw = sh * 9 / 16 if sw / sh > 9 / 16 else sw
    ch = cw * 16 / 9
    cw, ch = cw / zoom, ch / zoom
    fx = box[0] + box[2] / 2 if crop_center_face else sw / 2
    fy = box[1] + box[3] / 2
    x0 = float(np.clip(fx - cw / 2, 0, sw - cw))
    y0 = float(np.clip(fy - ch * 0.38, 0, sh - ch)) if zoom > 1 or ch < sh else 0.0
    crop = f[int(y0):int(y0 + ch), int(x0):int(x0 + cw)]
    out = cv2.resize(crop, (W, H), interpolation=cv2.INTER_LANCZOS4)
    s = W / crop.shape[1]
    pixelate(out, box, (s, s), (-x0 * s, -y0 * s), blocks=7)
    return grade(out)


def corner_presenter(base, clip, t):
    i = clip.idx(t, pingpong=True)
    f = clip.frames[i].copy()
    sh, sw = f.shape[:2]
    ph = 1150
    pw = int(sw * ph / sh)
    s = ph / sh
    pixelate(f, clip.boxes[i], blocks=6)
    p = cv2.resize(f, (pw, ph), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    lum = p.mean(2, keepdims=True)
    p = np.clip((p * 0.85 + lum * 0.15) * 1.05, 0, 1)
    rim = np.linspace(0.32, 0, pw, dtype=np.float32)[None, :, None] * np.array([0.1, 0.1, 1.0], np.float32)
    p = 1 - (1 - p) * (1 - rim)
    m = cv2.resize(clip.masks[i], (pw, ph)).astype(np.float32) / 255
    m = cv2.GaussianBlur(np.clip((m - 0.35) * 2.2, 0, 1), (0, 0), 3)[..., None]
    x0, y0 = W - pw + 150, H - ph + 260
    xs0, ys0 = max(x0, 0), y0
    xe, ye = min(x0 + pw, W), min(y0 + ph, H)
    px0, py0 = xs0 - x0, ys0 - y0
    roi = base[ys0:ye, xs0:xe]
    pp = p[py0:py0 + (ye - ys0), px0:px0 + (xe - xs0)]
    mm = m[py0:py0 + (ye - ys0), px0:px0 + (xe - xs0)]
    # soft drop shadow so the cut-out sits on the screen recording
    sh_ = cv2.GaussianBlur(mm, (0, 0), 18)[..., None] if mm.ndim == 2 else cv2.GaussianBlur(mm[..., 0], (0, 0), 18)[..., None]
    roi[:] = roi * (1 - 0.5 * sh_)
    roi[:] = roi * (1 - mm) + pp * mm


# ---------------------------------------------------------------- screen recordings
screens = {}


def screen_img(name):
    if name not in screens:
        im = cv2.imread(A["screens"][name])
        s = W / im.shape[1]
        im = cv2.resize(im, (W, int(im.shape[0] * s)), interpolation=cv2.INTER_LANCZOS4)
        blur = cv2.GaussianBlur(im, (0, 0), 1.2)
        im = cv2.addWeighted(im, 1.5, blur, -0.5, 0)  # unsharp after upscale
        screens[name] = im.astype(np.float32) / 255
    return screens[name]


def ease(u):
    u = min(max(u, 0), 1)
    return u * u * (3 - 2 * u)


def screen_frame(sec, t):
    im = screen_img(sec["screen"])
    dur = sec["end"] - sec["start"]
    lt = t - sec["start"]
    max_y = min(im.shape[0] - H, int(sec.get("scroll_px", 2200)))
    y = int(max_y * ease((lt - 1.4) / max(dur - 1.6, 0.5)))
    fr = im[y:y + H].copy()
    if fr.shape[0] < H:
        fr = np.vstack([fr, np.zeros((H - fr.shape[0], W, 3), np.float32)])
    return fr


def star_sticker(text):
    f = ImageFont.truetype(A["font"], 58)
    tw = f.getbbox(text)[2]
    im = Image.new("RGBA", (tw + 150, 104), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, 103], radius=52, fill=(13, 17, 23, 235), outline=(255, 60, 60, 255), width=5)
    cx, cy, R, r = 58, 52, 30, 13
    pts = []
    for k in range(10):
        ang = -np.pi / 2 + k * np.pi / 5
        rad = R if k % 2 == 0 else r
        pts.append((cx + rad * np.cos(ang), cy + rad * np.sin(ang)))
    d.polygon(pts, fill=(255, 200, 40, 255))
    d.text((100, 14), text, font=f, fill=(255, 255, 255, 255))
    return np.array(im)


def counter_chip(text):
    f = ImageFont.truetype(A["font"], 44)
    tw = f.getbbox(text)[2]
    im = Image.new("RGBA", (tw + 48, 76), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, 75], radius=20, fill=(225, 29, 42, 245))
    d.text((24, 8), text, font=f, fill=(255, 255, 255, 255))
    return np.array(im)


def paste_scaled(dst8, rgba, cx, cy, sc):
    if sc <= 0.02:
        return
    r = cv2.resize(rgba, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    paste_rgba(dst8, r, cx, cy)


def pop(u):  # 0..1 -> overshoot scale
    if u <= 0:
        return 0
    if u >= 1:
        return 1
    return 1.12 * np.sin(u * np.pi / 2) if u < 0.7 else 1.12 - 0.12 * (u - 0.7) / 0.3


# ---------------------------------------------------------------- main loop
clips = {k: Clip(v) for k, v in A["clips"].items()}
dur = cfg["duration"]
nframes = int(dur * FPS)
stickers = {s["screen"]: star_sticker(s["stars"]) for s in cfg["sections"] if s.get("stars")}
chips = {s["screen"]: counter_chip(s["chip"]) for s in cfg["sections"] if s.get("chip")}
import os
preview = [float(v) for v in os.environ.get("PREVIEW", "").split(",") if v]
ff = None if preview else subprocess.Popen(
    ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
     "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
     "-pix_fmt", "yuv420p", cfg["out_video"]], stdin=subprocess.PIPE)
for fi in ([int(v * FPS) for v in preview] or range(nframes)):
    t = fi / FPS
    sec = next(s for s in cfg["sections"] if s["start"] <= t < s["end"] or s is cfg["sections"][-1])
    lt = t - sec["start"]
    if sec["kind"] == "head":
        z = sec.get("zoom_from", 1.0) + (sec.get("zoom_to", 1.0) - sec.get("zoom_from", 1.0)) * (lt / (sec["end"] - sec["start"]))
        for p in sec.get("punch", []):  # snap zoom on a key line
            if p[0] <= t < p[1]:
                z *= p[2]
        x = talking_head(clips[sec["clip"]], lt + sec.get("clip_offset", 0), zoom=z, crop_center_face=sec.get("center_face", False))
    else:
        x = screen_frame(sec, t)
        corner_presenter(x, clips[sec["clip"]], t + sec.get("clip_offset", 0))
    # punch-in transition at every section start
    if 0 <= lt < 0.22 and sec is not cfg["sections"][0]:
        sc = 1.08 - 0.08 * ease(lt / 0.22)
        h2, w2 = int(H / sc), int(W / sc)
        y0, x0 = (H - h2) // 2, (W - w2) // 2
        x = cv2.resize(x[y0:y0 + h2, x0:x0 + w2], (W, H))
    out = finish(x, screen=sec["kind"] == "screen")
    # glitch on the very first frames (RGB split)
    if t < 0.35:
        sh = int(24 * (1 - t / 0.35))
        out[:, :, 2] = np.roll(out[:, :, 2], sh, 1)
        out[:, :, 0] = np.roll(out[:, :, 0], -sh, 1)
    if sec["kind"] == "screen":
        if sec["screen"] in chips:
            paste_scaled(out, chips[sec["screen"]], 112, 290, pop((lt - 0.1) / 0.3))
        if sec["screen"] in stickers:
            stk = stickers[sec["screen"]]
            paste_scaled(out, stk, W - stk.shape[1] / 2 - 40, 290, pop((lt - 0.5) / 0.3))
    cap = caption_at(t)
    if cap is not None:
        paste_rgba(out, cap, W / 2, cfg.get("caption_y", 1330))
    if preview:
        cv2.imwrite(os.path.join(os.path.dirname(cfg["out_video"]), f"prev_{fi:05d}.jpg"), out)
        continue
    ff.stdin.write(out.tobytes())
    if fi % 150 == 0:
        print(f"frame {fi}/{nframes}", flush=True)
if ff:
    ff.stdin.close()
    ff.wait()
    print("video done:", cfg["out_video"])
