"""Reel engine v3 - closer to @remy.engineering's look.

* presenter is cut out and placed INTO a generated attic room plate, framed like remy:
  low phone angle, head at ~45% height, lots of ceiling, red LED on the left, teal light above
* big-block face mosaic, handheld micro-drift, jump-cut zooms per line
* screen segments are pre-rendered motion graphics (HTML -> frames, see capture_scenes.js)
  with the presenter cut-out in the bottom-right corner
Usage: python3 render3.py <reel.json> <voice_prefix> <scene_frames_dir> <out.mp4>   (PREVIEW="t1,t2")
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
cfg = json.load(open(sys.argv[1]))
voice = json.load(open(sys.argv[2] + ".words.json"))
SCN = sys.argv[3]
OUT = sys.argv[4]
A = cfg["assets"]
rng = np.random.default_rng(5)

# ------------------------------------------------------------------ captions (remy style)
PUN = ".,!?:;\"'"


def nk(x):
    return x.strip(PUN)


words = voice["words"]
merges = [[nk(f) for f in m["from"]] + [m["to"]] for m in cfg.get("caption_merge", [])]
rep = {nk(k): v for k, v in cfg.get("caption_replace", {}).items()}
toks, i = [], 0
while i < len(words):
    hit = next((m for m in merges if [nk(w["t"]) for w in words[i:i + len(m) - 1]] == m[:-1]), None)
    if hit:
        n = len(hit) - 1
        toks.append(dict(t=hit[-1], s=words[i]["s"], e=words[i + n - 1]["e"], line=words[i]["line"]))
        i += n
        continue
    w = words[i]
    t = rep.get(nk(w["t"]), nk(w["t"]))
    if t:
        toks.append(dict(t=t, s=w["s"], e=w["e"], line=w["line"]))
    i += 1
chunks, cur = [], []
for tk in toks:
    if cur and (len(cur) >= 3 or sum(len(x["t"]) for x in cur) + len(tk["t"]) > 15 or tk["line"] != cur[-1]["line"]
                or tk["s"] - cur[-1]["e"] > 0.35):
        chunks.append(cur)
        cur = []
    cur.append(tk)
chunks.append(cur)
CF = ImageFont.truetype(A["font"], 58)
_cc = {}


def is_he(s):
    return any("֐" <= c <= "׿" for c in s)


def cap_img(ci, n, boxed):
    k = (ci, n, boxed)
    if k in _cc:
        return _cc[k]
    ch = chunks[ci]
    bb = [CF.getbbox(x["t"], direction="rtl" if is_he(x["t"]) else "ltr") for x in ch]
    ws = [b[2] - b[0] for b in bb]
    sp, px, py = 16, 22, 10
    im = Image.new("RGBA", (sum(ws) + sp * (len(ch) - 1) + 2 * px, 82 + 2 * py), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if boxed:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], 14, fill=(0, 0, 0, 175))
    x = im.width - px
    for j, (tk, w_, b) in enumerate(zip(ch, ws, bb)):
        x -= w_
        col = (255, 255, 255, 255) if j < n else (140, 140, 140, 255)
        dr = "rtl" if is_he(tk["t"]) else "ltr"
        if not boxed:
            d.text((x - b[0] + 2, py + 5), tk["t"], font=CF, fill=(0, 0, 0, 170), direction=dr)
        d.text((x - b[0], py + 3), tk["t"], font=CF, fill=col, direction=dr)
        x -= sp
    _cc[k] = np.array(im)
    return _cc[k]


def caption_at(t, boxed):
    for ci, ch in enumerate(chunks):
        nxt = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else ch[-1]["e"] + 0.5
        if ch[0]["s"] - 0.03 <= t < nxt:
            return cap_img(ci, max(1, sum(1 for x in ch if x["s"] <= t + 0.02)), boxed)
    return None


def paste(dst, rgba, x0, y0, alpha=1.0):
    h, w = rgba.shape[:2]
    xs, ys, xe, ye = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
    if xe <= xs or ye <= ys:
        return
    s = rgba[ys - y0:ye - y0, xs - x0:xe - x0]
    a = s[:, :, 3:4].astype(np.float32) / 255 * alpha
    dst[ys:ye, xs:xe] = dst[ys:ye, xs:xe] * (1 - a) + s[:, :, 2::-1].astype(np.float32) / 255 * a


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


# ------------------------------------------------------------------ room plate
plate = cv2.imread(A["plate"]).astype(np.float32) / 255
ph, pw = plate.shape[:2]
s = max(W / pw, H / ph) * 1.08
plate = cv2.resize(plate, (int(pw * s), int(ph * s)), interpolation=cv2.INTER_CUBIC).clip(0, 1)
oy, ox = (plate.shape[0] - H) // 2, (plate.shape[1] - W) // 2
plate = plate[oy:oy + H, ox:ox + W]
lum = plate.mean(2, keepdims=True)
plate = np.power(plate * 0.75 + lum * 0.25, 1.35) * 0.8
plate = cv2.GaussianBlur(plate, (0, 0), 2.2)          # phone depth of field
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def glow(cx, cy, r, col):
    g = np.clip(1 - np.sqrt(((xx - cx) / r) ** 2 + ((yy - cy) / r) ** 2), 0, 1) ** 2
    return g[..., None] * np.array(col, np.float32)


plate = 1 - (1 - plate) * (1 - glow(80, 1250, 700, (0.0, 0.0, 0.55)))    # red LED pool, left
plate = 1 - (1 - plate) * (1 - glow(540, -150, 1100, (0.22, 0.17, 0.02)))  # teal ceiling wash (BGR)


def israel_flag(Wf=1100, Hf=800):
    """Israeli flag (official 160:220 proportions) with soft cloth folds"""
    k = Hf / 160
    f = np.full((Hf, Wf, 3), 1.0, np.float32)
    blue = (184 / 255, 56 / 255, 0.0)
    for y0 in (15, 120):
        f[int(y0 * k):int((y0 + 25) * k)] = blue
    cx, cy, R = Wf / 2, Hf / 2, 27.5 * k
    for rot in (np.pi / 2, -np.pi / 2):
        pts = np.array([[cx + R * np.cos(rot + j * 2 * np.pi / 3), cy - R * np.sin(rot + j * 2 * np.pi / 3)] for j in range(3)], np.int32)
        cv2.polylines(f, [pts], True, blue, int(5.5 * k), cv2.LINE_AA)
    fy, fx = np.mgrid[0:Hf, 0:Wf].astype(np.float32)
    wv = np.sin(fx / Wf * np.pi * 3.2 + 0.6) * 0.5 + np.sin(fx / Wf * np.pi * 7.3) * 0.2
    f = f * (0.8 + 0.2 * wv)[..., None]
    my = fy + 10 * np.sin(fx / Wf * np.pi * 3.2 + 0.6)
    return cv2.remap(f, fx, my, cv2.INTER_LINEAR, borderValue=0), cv2.remap(np.ones((Hf, Wf), np.float32), fx, my, cv2.INTER_LINEAR, borderValue=0)


if A.get("flag"):
    fl, fm = israel_flag()
    q = np.float32(A["flag"]["quad"])
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [fl.shape[1], 0], [fl.shape[1], fl.shape[0]], [0, fl.shape[0]]]), q)
    fw = cv2.warpPerspective(fl, M, (W, H))
    mw = cv2.warpPerspective(fm, M, (W, H))[..., None]
    lit = A["flag"].get("brightness", 0.6) * (1.0 - 0.35 * (yy / H))[..., None] * np.array([1.08, 1.0, 0.9], np.float32)
    fw = fw * lit + glow(80, 1250, 900, (0.0, 0.0, 0.18))            # red spill from the LED
    fw = cv2.GaussianBlur(fw, (0, 0), 2.0)
    mw = cv2.GaussianBlur(mw, (0, 0), 2.0)[..., None]
    plate = plate * (1 - mw) + fw * mw
VIG = (1 - 0.55 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)).clip(0.35, 1)[..., None]
DESK = (1 - 0.94 * np.clip((yy - H * 0.70) / (H * 0.22), 0, 1) ** 1.1)[..., None]  # dark desk edge in the foreground
RED_RIM = glow(-200, 1100, 900, (0.05, 0.05, 0.9))
TEAL_TOP = glow(540, -300, 1400, (0.25, 0.18, 0.03))


# ------------------------------------------------------------------ presenter
class Clip:
    def __init__(self, path):
        cap = cv2.VideoCapture(path)
        self.fps = cap.get(cv2.CAP_PROP_FPS)
        self.fr = []
        while True:
            ok, f = cap.read()
            if not ok:
                break
            self.fr.append(f)
        tr = np.load(path + ".track.npz")
        self.box, self.mask, self.n = tr["boxes"], tr["masks"], len(self.fr)

    def idx(self, t):
        p = 2 * (self.n - 1)
        i = int(t * self.fps) % p
        return i if i < self.n else p - i


def mosaic(img, box, blocks):
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2
    bw, bh = w * MOS[0], h * MOS[1]
    x0, y0 = int(max(cx - bw / 2, 0)), int(max(cy - bh * 0.55, 0))
    x1, y1 = int(min(cx + bw / 2, img.shape[1])), int(min(cy + bh * 0.4, img.shape[0]))
    by = max(1, round(blocks * (y1 - y0) / (x1 - x0)))
    sm = cv2.resize(img[y0:y1, x0:x1], (blocks, by), interpolation=cv2.INTER_AREA)
    img[y0:y1, x0:x1] = cv2.resize(sm, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)


clip = Clip(A["clip"])
MOS = cfg.get("presenter", {}).get("mosaic", [1.3, 1.62])
FB = np.nanmedian(clip.box, 0)  # typical face box in source px


def presenter_rgba(t, face_w, blocks=7):
    """person cut-out scaled so the face is face_w px wide; returns rgba (float) and face centre in it"""
    i = clip.idx(t)
    f = clip.fr[i].copy()
    mosaic(f, clip.box[i], blocks)
    sc = face_w / FB[2]
    f = cv2.resize(f, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    m = cv2.resize(clip.mask[i], (f.shape[1], f.shape[0])).astype(np.float32) / 255
    m = np.clip((m - 0.55) * 5.0, 0, 1); m[m < 0.04] = 0; m = cv2.GaussianBlur(m, (0, 0), 1.4)
    fe = max(int(m.shape[1] * 0.16), 1)   # the source frame cuts the body: fade the side edges into the dark room
    ramp = np.ones(m.shape[1], np.float32); ramp[:fe] = np.linspace(0, 1, fe) ** 1.5; ramp[-fe:] = np.linspace(1, 0, fe) ** 1.5
    m = (m * ramp[None, :])[..., None]
    ext = int(f.shape[0] * 0.6)  # source frame cuts the chest: extend the body down (hidden by the dark desk)
    oh = f.shape[0]
    f = cv2.copyMakeBorder(f, 0, ext, 0, 0, cv2.BORDER_REPLICATE)
    f[oh - 40:] = cv2.GaussianBlur(f[oh - 40:], (0, 0), sigmaX=18, sigmaY=4)       # kill replicate streaks
    f[oh - 60:] *= np.clip(np.linspace(1.0, -0.4, ext + 60), 0.04, 1)[:, None, None].astype(np.float32)  # body falls into shadow
    m = cv2.copyMakeBorder(m, 0, ext, 0, 0, cv2.BORDER_REPLICATE)
    if m.ndim == 2:
        m = m[..., None]
    # relight to match the room: darker, cool top, red rim from the LED side
    l_ = f.mean(2, keepdims=True)
    f = np.power(f * 0.85 + l_ * 0.15, 1.25) * 0.78
    hh, ww = f.shape[:2]
    rim = np.clip(1 - np.linspace(0, 1.6, ww, dtype=np.float32), 0, 1)[None, :, None] ** 2 * np.array([0.03, 0.03, 0.5], np.float32)
    top = np.clip(1 - np.linspace(0, 1.4, hh, dtype=np.float32), 0, 1)[:, None, None] * np.array([0.12, 0.08, 0.0], np.float32)
    f = 1 - (1 - f) * (1 - rim) * (1 - top)
    b = clip.box[i]
    return f, m, ((b[0] + b[2] / 2) * sc, (b[1] + b[3] / 2) * sc)


def comp(dst, f, m, x0, y0, shadow=False):
    h, w = f.shape[:2]
    xs, ys, xe, ye = max(int(x0), 0), max(int(y0), 0), min(int(x0) + w, W), min(int(y0) + h, H)
    if xe <= xs or ye <= ys:
        return
    ff = f[ys - int(y0):ye - int(y0), xs - int(x0):xe - int(x0)]
    mm = m[ys - int(y0):ye - int(y0), xs - int(x0):xe - int(x0)]
    roi = dst[ys:ye, xs:xe]
    if shadow:
        sh = cv2.GaussianBlur(mm[..., 0], (0, 0), 14)[..., None]
        roi[:] = roi * (1 - 0.55 * sh)
    roi[:] = roi * (1 - mm) + ff * mm


def head_frame(t, zoom, lt):
    P = cfg.get("presenter", {})
    face_w = P.get("face_w", 470)
    f, m, (fx, fy) = presenter_rgba(t, face_w)
    out = plate.copy()
    # handheld micro drift
    dx = 7 * np.sin(t * 1.3) + 4 * np.sin(t * 2.9 + 1)
    dy = 6 * np.sin(t * 1.1 + 2) + 3 * np.sin(t * 3.3)
    comp(out, f, m, W / 2 - fx + dx, P.get("face_y", 860) - fy + dy)
    out = out * DESK
    if zoom != 1.0:  # zoom on the face (jump cut)
        z = zoom * (1 + 0.02 * lt)
        h2, w2 = int(H / z), int(W / z)
        cy = int(np.clip(860 - h2 * 0.45, 0, H - h2))
        x0 = (W - w2) // 2
        out = cv2.resize(out[cy:cy + h2, x0:x0 + w2], (W, H), interpolation=cv2.INTER_LINEAR)
    return out * VIG


def corner_presenter(base, t):
    f, m, (fx, fy) = presenter_rgba(t, 230, blocks=6)
    comp(base, f, m, W - fx - 150, 1560 - fy, shadow=True)


# ------------------------------------------------------------------ timeline
LT = voice["lines"]
dur = voice["duration"] + 0.4
plan = []
for li, (ln, tm) in enumerate(zip(cfg["lines"], LT)):
    st = 0.0 if li == 0 else tm["start"] - 0.06
    en = LT[li + 1]["start"] - 0.06 if li + 1 < len(LT) else dur
    sst = plan[-1][4] if (ln["shot"].get("cont") and plan) else st
    plan.append((st, en, ln["shot"], li, sst))
_frames = {}


def scene_frame(name, lt):
    d = os.path.join(SCN, name)
    if name not in _frames:
        _frames[name] = sorted(os.listdir(d))
    fl = _frames[name]
    return cv2.imread(os.path.join(d, fl[min(int(lt * FPS), len(fl) - 1)])).astype(np.float32) / 255


def frame(t):
    st, en, sh, li, sst = next((p for p in plan if p[0] <= t < p[1]), plan[-1])
    lt = t - st
    ct = li * 2.7 + lt   # different moment of the source clip on every cut
    if sh["type"] == "head":
        out = head_frame(ct, sh.get("zoom", 1.0), lt)
        boxed, cy = False, 1330
    else:
        out = scene_frame(sh["scene"], t - sst)
        if sh.get("presenter", True):
            corner_presenter(out, ct)
        boxed, cy = True, 1500
    if lt < 0.13 and st > 0 and not sh.get("cont"):  # punch-in on every cut
        z = 1.05 - 0.05 * ease(lt / 0.13)
        h2, w2 = int(H / z), int(W / z)
        out = cv2.resize(out[(H - h2) // 2:(H - h2) // 2 + h2, (W - w2) // 2:(W - w2) // 2 + w2], (W, H))
    n = rng.normal(0, 0.012, (H // 2, W // 2, 1)).astype(np.float32)
    out = out + cv2.resize(n, (W, H), interpolation=cv2.INTER_NEAREST)[..., None]
    out = np.clip(out, 0, 1)
    cap = caption_at(t, boxed)
    if cap is not None:
        paste(out, cap, int(W / 2 - cap.shape[1] / 2), int(cy - cap.shape[0] / 2))
    return (out * 255).astype(np.uint8)


preview = [float(v) for v in os.environ.get("PREVIEW", "").split(",") if v]
if preview:
    for t in preview:
        cv2.imwrite(OUT.replace(".mp4", f"_p{t:05.1f}.jpg"), frame(t))
    sys.exit(0)
ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
                       "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "10M", "-bufsize", "20M",
                       "-pix_fmt", "yuv420p", OUT + ".v.mp4"], stdin=subprocess.PIPE)
for fi in range(int(dur * FPS)):
    ff.stdin.write(frame(fi / FPS).tobytes())
ff.stdin.close()
ff.wait()
sfx = A["sfx"]
inp = ["-i", sys.argv[2] + ".wav"]
flt = ["[0]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=4:release=60,equalizer=f=3500:t=q:w=1:g=2[v]"]
lab = ["[v]"]
k = 1
prev = "head"
for st, en, sh, li, _ in plan[1:]:
    if sh["type"] != prev:
        inp += ["-i", sfx["whoosh"]]
        d = int(max(st - 0.1, 0) * 1000)
        flt.append(f"[{k}]adelay={d}|{d},volume=0.16[s{k}]")
        lab.append(f"[s{k}]")
        k += 1
    prev = sh["type"]
flt.append("".join(lab) + f"amix=inputs={len(lab)}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5[a]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, "-filter_complex", ";".join(flt), "-map", "[a]", "-ar", "48000",
                "-c:a", "aac", "-b:a", "160k", OUT + ".a.m4a"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", OUT + ".v.mp4", "-i", OUT + ".a.m4a", "-map", "0:v", "-map", "1:a",
                "-c", "copy", "-shortest", "-movflags", "+faststart", OUT], check=True)
os.remove(OUT + ".v.mp4")
os.remove(OUT + ".a.m4a")
print("done", OUT, round(dur, 1))
