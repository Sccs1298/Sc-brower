"""Reel engine v2: shot-based editing grammar learned from @remy.engineering.

Shots (one per script line, see reels/<NN>/reel.json):
  head        full talking head (alternating clips/zoom per cut = jump-cut feel)
  card        floating screenshot card (top) over dimmed head + presenter cut-out
  full        full-screen screenshot scroll + presenter cut-out in the corner
  term        terminal window card, typed command then output
  strip       zoomed command/text strip across the width over the head
  sms         phone SMS bubble card
  disclaimer  full-screen black "educational only" card
Usage: python3 render2.py <reel.json> <voice_prefix> <out.mp4>    (PREVIEW="t1,t2" for stills)
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(sys.argv[1]))
voice = json.load(open(sys.argv[2] + ".words.json"))
OUT = sys.argv[3]
A = cfg["assets"]
rng = np.random.default_rng(3)
F_HE = A["font"]
F_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
F_MONO_R = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def font(p, s):
    return ImageFont.truetype(p, s)


def is_he(s):
    return any("֐" <= c <= "׿" for c in s)


def draw_text(d, xy, txt, f, fill):
    d.text(xy, txt, font=f, fill=fill, direction="rtl" if is_he(txt) else "ltr")


def tw(f, txt):
    b = f.getbbox(txt, direction="rtl" if is_he(txt) else "ltr")
    return b[2] - b[0], b[0]


# ------------------------------------------------------------------ captions
PUN = ".,!:;\"'״"


def nk(x):
    return x.strip(PUN) if x not in ("'",) else x


rep = {nk(k): v for k, v in cfg.get("caption_replace", {}).items()}
merges = [dict(m, **{"from": [nk(f) for f in m["from"]]}) for m in cfg.get("caption_merge", [])]
words = [dict(w, t=(w["t"].rstrip(".,!:;") if not w["t"].endswith("'") else w["t"])) for w in voice["words"]]
toks, i = [], 0
while i < len(words):
    m = next((m for m in merges if [nk(w["t"]) for w in words[i:i + len(m["from"])]] == m["from"]), None)
    if m:
        n = len(m["from"])
        toks.append(dict(t=m["to"], s=words[i]["s"], e=words[i + n - 1]["e"], line=words[i]["line"]))
        i += n
        continue
    w = words[i]
    toks.append(dict(t=rep.get(nk(w["t"]), w["t"]), s=w["s"], e=w["e"], line=w["line"]))
    i += 1
chunks, cur = [], []
for tk in toks:
    if cur and (len(cur) >= 3 or sum(len(x["t"]) for x in cur) + len(tk["t"]) > 16 or tk["line"] != cur[-1]["line"]
                or tk["s"] - cur[-1]["e"] > 0.4):
        chunks.append(cur)
        cur = []
    cur.append(tk)
chunks.append(cur)
CAP_F = font(F_HE, 62)
_cap = {}


def caption(ci, n, boxed):
    k = (ci, n, boxed)
    if k in _cap:
        return _cap[k]
    ch = chunks[ci]
    ws = [tw(CAP_F, x["t"]) for x in ch]
    sp, px, py = 17, 24, 12
    total = sum(w for w, _ in ws) + sp * (len(ch) - 1)
    im = Image.new("RGBA", (total + 2 * px, 86 + 2 * py), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if boxed:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], 16, fill=(0, 0, 0, 165))
    x = im.width - px
    for j, (x_, (w_, off)) in enumerate(zip(ch, ws)):
        x -= w_
        col = (255, 255, 255, 255) if j < n else (150, 150, 150, 255)
        if not boxed:  # soft shadow for readability on the head shot
            draw_text(d, (x - off + 2, py + 6), x_["t"], CAP_F, (0, 0, 0, 200))
        draw_text(d, (x - off, py + 4), x_["t"], CAP_F, col)
        x -= sp
    _cap[k] = np.array(im)
    return _cap[k]


def caption_at(t, boxed):
    for ci, ch in enumerate(chunks):
        nxt = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else ch[-1]["e"] + 0.5
        if ch[0]["s"] - 0.04 <= t < nxt:
            return caption(ci, max(1, sum(1 for x in ch if x["s"] <= t + 0.03)), boxed)
    return None


# ------------------------------------------------------------------ compositing helpers
def paste(dst, rgba, x0, y0, alpha=1.0):
    h, w = rgba.shape[:2]
    xs, ys, xe, ye = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
    if xe <= xs or ye <= ys:
        return
    src = rgba[ys - y0:ye - y0, xs - x0:xe - x0]
    a = src[:, :, 3:4].astype(np.float32) / 255 * alpha
    roi = dst[ys:ye, xs:xe]
    roi[:] = roi * (1 - a) + src[:, :, 2::-1].astype(np.float32) / 255 * a


def paste_c(dst, rgba, cx, cy, sc=1.0, alpha=1.0):
    if sc <= 0.02:
        return
    if sc != 1.0:
        rgba = cv2.resize(rgba, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    paste(dst, rgba, int(cx - rgba.shape[1] / 2), int(cy - rgba.shape[0] / 2), alpha)


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def pop(u):
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    return 1.1 * np.sin(u * np.pi / 2 / 0.7) if u < 0.7 else 1.1 - 0.1 * (u - 0.7) / 0.3


def glow(cx, cy, r, col):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g = np.clip(1 - np.sqrt(((xx - cx) / r) ** 2 + ((yy - cy) / r) ** 2), 0, 1) ** 2
    return g[..., None] * np.array(col, np.float32)


LED = glow(60, 1350, 900, (0.04, 0.03, 0.85)) + glow(1050, 1250, 650, (0.02, 0.02, 0.5))
CEIL = glow(540, -200, 1300, (0.32, 0.22, 0.05))  # cold teal from above (BGR)
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIG = (1 - 0.6 * (((_xx - W / 2) / (W * 0.72)) ** 2 + ((_yy - H / 2) / (H * 0.68)) ** 2)).clip(0.3, 1)[..., None]


def grain(x, amt=0.02):
    n = rng.normal(0, amt, (H // 2, W // 2, 1)).astype(np.float32)
    return x + cv2.resize(n, (W, H), interpolation=cv2.INTER_NEAREST)[..., None]


# ------------------------------------------------------------------ presenter clips
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


def mosaic(img, box, blocks=8):
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2
    bw, bh = w * 1.28, h * 1.6
    x0, y0 = int(max(cx - bw / 2, 0)), int(max(cy - bh * 0.58, 0))
    x1, y1 = int(min(cx + bw / 2, img.shape[1])), int(min(cy + bh * 0.42, img.shape[0]))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return
    by = max(1, round(blocks * (y1 - y0) / (x1 - x0)))
    s = cv2.resize(img[y0:y1, x0:x1], (blocks, by), interpolation=cv2.INTER_AREA)
    img[y0:y1, x0:x1] = cv2.resize(s, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)


def presenter_frame(clip, t):
    """graded source frame with mosaic face + person mask, both at source resolution"""
    i = clip.idx(t)
    f = clip.fr[i].copy()
    mosaic(f, clip.box[i])
    m = cv2.resize(clip.mask[i], (f.shape[1], f.shape[0])).astype(np.float32) / 255
    m = cv2.GaussianBlur(np.clip((m - 0.3) * 2.5, 0, 1), (0, 0), 2)
    return f, m, clip.box[i]


SET = None
if A.get("set"):
    _s = cv2.imread(A["set"]).astype(np.float32) / 255
    _s = np.clip(cv2.resize(_s, (W, H), interpolation=cv2.INTER_CUBIC), 0, 1)
    _l = _s.mean(2, keepdims=True)
    _s = np.power(_s * 0.6 + _l * 0.4, 1.9) * 0.42          # night: crush to darkness, desaturate
    _s[..., 0] *= 1.25                                         # cold teal ceiling
    _s[..., 2] *= 0.7
    SET = cv2.GaussianBlur(_s, (0, 0), 7)                      # shallow depth of field


def head_shot(clip, t, zoom):
    f, m, box = presenter_frame(clip, t)
    sh, sw = f.shape[:2]
    cw = sh * 9 / 16 if sw / sh > 9 / 16 else sw
    ch = cw * 16 / 9
    cw, ch = cw / zoom, ch / zoom
    fx, fy = box[0] + box[2] / 2, box[1] + box[3] / 2
    x0 = float(np.clip(fx - cw / 2, 0, sw - cw))
    y0 = float(np.clip(fy - ch * 0.42, 0, max(sh - ch, 0)))
    sl = (slice(int(y0), int(y0 + ch)), slice(int(x0), int(x0 + cw)))
    img = cv2.resize(f[sl], (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32) / 255
    mm = cv2.resize(m[sl], (W, H))[..., None]
    lum = img.mean(2, keepdims=True)
    img = np.power(img * 0.82 + lum * 0.18, 1.2)
    # subject stays lit; background = our own generated "attic" set (or the darkened source room)
    bg = SET if SET is not None else cv2.GaussianBlur(img, (0, 0), 6) * 0.22
    bg = 1 - (1 - bg) * (1 - LED * 0.9) * (1 - CEIL)
    subj = 1 - (1 - img * 0.92) * (1 - LED * 0.35)
    return subj * mm + bg * (1 - mm)


def cutout(base, clip, t, height=1150, right=170, drop=330):
    f, m, _ = presenter_frame(clip, t)
    sh, sw = f.shape[:2]
    s = height / sh
    pw = int(sw * s)
    p = cv2.resize(f, (pw, height), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    p = np.power(p, 1.1)
    p = 1 - (1 - p) * (1 - np.linspace(0.3, 0, pw, dtype=np.float32)[None, :, None] * np.array([0.1, 0.1, 1.0], np.float32))
    mm = cv2.resize(m, (pw, height))[..., None]
    rgba = np.dstack([p[..., ::-1] * 255, mm * 255]).astype(np.uint8)
    shadow = rgba.copy()
    shadow[..., :3] = 0
    shadow[..., 3] = cv2.GaussianBlur(shadow[..., 3], (0, 0), 16)
    x0, y0 = W - pw + right, H - height + drop
    paste(base, shadow, x0 - 10, y0, 0.6)
    paste(base, rgba, x0, y0)


# ------------------------------------------------------------------ graphic builders
_img = {}


def load_shot_img(name, crop=None, width=900):
    k = (name, tuple(crop or []), width)
    if k not in _img:
        im = cv2.imread(A["shots"][name])
        if crop:
            im = im[int(crop[0]):int(crop[1])]
        s = width / im.shape[1]
        im = cv2.resize(im, (width, int(im.shape[0] * s)), interpolation=cv2.INTER_LANCZOS4)
        im = cv2.addWeighted(im, 1.45, cv2.GaussianBlur(im, (0, 0), 1.1), -0.45, 0)
        _img[k] = im
    return _img[k]


def rounded_rgba(bgr, r=26):
    h, w = bgr.shape[:2]
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    return np.dstack([bgr, np.array(m)])


def card_frame(sh, lt, dur):
    im = load_shot_img(sh["img"], sh.get("crop"), sh.get("width", 900))
    vh = sh.get("view_h", 980)
    max_y = max(0, min(im.shape[0] - vh, sh.get("scroll", 0)))
    y = int(max_y * ease((lt - 0.8) / max(dur - 1.0, 0.4)))
    view = im[y:y + vh]
    return rounded_rgba(view)


def term_img(sh, lt, dur):
    lines = sh["lines"]
    title = sh.get("title", "Terminal")
    fsz = sh.get("font", 34)
    f, fr = font(F_MONO, fsz), font(F_MONO_R, fsz)
    wpx, lh = 940, int(fsz * 1.38)
    hpx = 70 + 30 + lh * (len(lines) + 1)
    im = Image.new("RGBA", (wpx, hpx), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, wpx - 1, hpx - 1], 22, fill=(13, 15, 20, 245), outline=(60, 64, 72, 255), width=2)
    d.rounded_rectangle([0, 0, wpx - 1, 62], 22, fill=(32, 35, 42, 255))
    d.rectangle([0, 40, wpx - 1, 62], fill=(32, 35, 42, 255))
    for k, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([22 + k * 34, 20, 44 + k * 34, 42], fill=c)
    d.text((wpx / 2 - f.getlength(title) / 2 * 0.8, 14), title, font=font(F_MONO_R, 28), fill=(170, 175, 185))
    cmd = lines[0]
    type_t = sh.get("type_time", 1.2)
    n = int(len(cmd) * ease(lt / type_t)) if lt < type_t else len(cmd)
    y = 92
    prompt = sh.get("prompt", "$ ")
    d.text((26, y), prompt, font=f, fill=(80, 250, 123))
    d.text((26 + f.getlength(prompt), y), cmd[:n] + ("█" if (lt * 2.5) % 1 < 0.6 and n < len(cmd) + 1 else ""),
           font=f, fill=(240, 240, 240))
    if lt > type_t + 0.25:
        shown = int((lt - type_t - 0.25) / 0.07) + 1
        hl = sh.get("highlight", [])
        for j, ln in enumerate(lines[1:shown + 1]):
            yy = y + lh * (j + 1)
            col = (255, 85, 85) if j + 1 in hl else (200, 205, 212)
            if j + 1 in hl:
                d.rounded_rectangle([14, yy - 4, wpx - 14, yy + lh - 6], 8, fill=(120, 20, 30, 150))
            d.text((26, yy), ln, font=fr, fill=col)
    return np.array(im)


def strip_img(text, sub=None):
    he = is_he(text)
    f = font(F_HE if he else F_MONO, 66 if he else 54)
    w, off = tw(f, text)
    pad = 40
    wpx = min(max(w + 2 * pad, 600), 1040)
    im = Image.new("RGBA", (wpx, 150 if sub else 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, wpx - 1, im.height - 1], 18, fill=(245, 246, 248, 255))
    if not he:  # selection highlight, like a zoomed terminal line
        d.rounded_rectangle([14, 16, min(wpx - 14, 14 + w + 2 * pad - 28), 104], 10, fill=(197, 219, 255, 255))
    draw_text(d, (wpx / 2 - w / 2 - off, 18), text, f, (12, 14, 18))
    if sub:
        fs = font(F_HE, 34)
        sw_, so = tw(fs, sub)
        draw_text(d, (wpx / 2 - sw_ / 2 - so, 104), sub, fs, (90, 95, 105))
    return np.array(im)


def sms_img(sender, text, link):
    W2 = 900
    fh, fs, fl = font(F_HE, 44), font(F_HE, 40), font(F_MONO_R, 34)
    im = Image.new("RGBA", (W2, 760), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, W2 - 1, 759], 40, fill=(250, 250, 252, 252))
    d.ellipse([W2 / 2 - 45, 30, W2 / 2 + 45, 120], fill=(160, 166, 178))
    sw_, so = tw(fh, sender)
    d.text((W2 / 2 - sw_ / 2, 135), sender, font=fh, fill=(20, 20, 24))
    d.text((W2 / 2 - fs.getlength("Text Message") * 0.35, 195), "Text Message", font=font(F_HE, 28), fill=(140, 140, 150))
    d.rounded_rectangle([40, 260, W2 - 120, 700], 34, fill=(232, 233, 237))
    # wrap hebrew text into lines (right aligned inside bubble)
    words_, lines_, cur_ = text.split(), [], ""
    for w_ in words_:
        tst = (cur_ + " " + w_).strip()
        if tw(fs, tst)[0] > W2 - 240:
            lines_.append(cur_)
            cur_ = w_
        else:
            cur_ = tst
    lines_.append(cur_)
    y = 290
    for ln in lines_:
        lw, lo = tw(fs, ln)
        draw_text(d, (W2 - 160 - lw - lo, y), ln, fs, (20, 20, 24))
        y += 58
    d.text((80, y + 10), link, font=fl, fill=(10, 100, 230))
    return np.array(im)


def disclaimer_img():
    im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    cx, cy = W / 2, 700
    d.polygon([(cx, cy - 170), (cx - 195, cy + 150), (cx + 195, cy + 150)], fill=(250, 204, 21))
    d.polygon([(cx, cy - 120), (cx - 150, cy + 122), (cx + 150, cy + 122)], fill=(0, 0, 0))
    d.polygon([(cx, cy - 95), (cx - 128, cy + 108), (cx + 128, cy + 108)], fill=(250, 204, 21))
    d.rounded_rectangle([cx - 14, cy - 40, cx + 14, cy + 45], 8, fill=(0, 0, 0))
    d.ellipse([cx - 16, cy + 62, cx + 16, cy + 94], fill=(0, 0, 0))
    for txt, fsz, y, col in [("אזהרה", 110, 900, (255, 255, 255)),
                             ("למטרות לימוד והגנה בלבד.", 52, 1070, (220, 220, 220)),
                             ("אל תבדקו מערכות שאינן שלכם.", 52, 1140, (220, 220, 220))]:
        f = font(F_HE, fsz)
        w_, o = tw(f, txt)
        draw_text(d, (W / 2 - w_ / 2 - o, y), txt, f, col)
    d.line([(W / 2 - 230, 1040), (W / 2 + 230, 1040)], fill=(255, 255, 255), width=4)
    return np.array(im)


def chip_img(text):
    f = font(F_HE, 46)
    w_, o = tw(f, text)
    im = Image.new("RGBA", (w_ + 50, 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, 79], 22, fill=(225, 29, 42, 245))
    draw_text(d, (25 - o, 8), text, f, (255, 255, 255))
    return np.array(im)


# ------------------------------------------------------------------ timeline
clips = {k: Clip(v) for k, v in A["clips"].items()}
clip_keys = list(clips)
lines = cfg["lines"]
LT = voice["lines"]
dur = voice["duration"] + cfg.get("tail", 0.35)
heads_seen = 0
plan = []
for li, (ln, tm) in enumerate(zip(lines, LT)):
    sh = dict(ln.get("shot", {"type": "head"}))
    start = 0.0 if li == 0 else tm["start"] - 0.08
    end = LT[li + 1]["start"] - 0.08 if li + 1 < len(lines) else dur
    if sh["type"] in ("head", "strip"):
        sh.setdefault("clip", clip_keys[0])
        sh.setdefault("zoom", [1.0, 1.13][heads_seen % 2])
        sh.setdefault("offset", heads_seen * 3.1)
        heads_seen += 1
    else:
        sh.setdefault("clip", clip_keys[li % len(clip_keys)])
        sh.setdefault("offset", li * 2.3)
    plan.append((start, end, sh))
DISC = disclaimer_img()
_static = {}


def static(key, fn):
    if key not in _static:
        _static[key] = fn()
    return _static[key]


def frame(t):
    start, end, sh = next(p for p in plan if p[0] <= t < p[1]) if t < plan[-1][1] else plan[-1]
    lt, d = t - start, end - start
    typ = sh["type"]
    clip = clips[sh["clip"]]
    ct = sh["offset"] + lt
    boxed = typ not in ("head", "disclaimer")
    if typ == "disclaimer":
        x = DISC[..., 2::-1].astype(np.float32) / 255
        out = x
    elif typ in ("head", "strip"):
        z = sh["zoom"] * (1 + 0.025 * lt / max(d, 1))
        out = head_shot(clip, ct, z)
        if typ == "strip":
            st = static(("strip", sh["text"], sh.get("sub")), lambda: strip_img(sh["text"], sh.get("sub")))
            paste_c(out, st, W / 2, sh.get("y", 760), pop(lt / 0.28))
            boxed = False
    else:
        bgimg = head_shot(clip, ct, 1.0)
        out = cv2.GaussianBlur(bgimg, (0, 0), 8) * 0.45
        if typ == "full":
            im = load_shot_img(sh["img"], sh.get("crop"), W)
            max_y = max(0, min(im.shape[0] - H, sh.get("scroll", 1800)))
            y = int(max_y * ease((lt - 1.2) / max(d - 1.4, 0.4)))
            v = im[y:y + H]
            out[:v.shape[0]] = v.astype(np.float32) / 255
        elif typ == "card":
            c = card_frame(sh, lt, d)
            paste_c(out, c, W / 2, sh.get("cy", 640), 0.94 + 0.06 * ease(lt / 0.25))
        elif typ == "term":
            c = term_img(sh, lt, d)
            paste_c(out, c, W / 2, sh.get("cy", 600), 0.94 + 0.06 * ease(lt / 0.25))
        elif typ == "sms":
            c = static(("sms", sh["sender"]), lambda: sms_img(sh["sender"], sh["text"], sh["link"]))
            paste_c(out, c, W / 2, 620, pop(lt / 0.3) * 0.98)
        if sh.get("presenter", True):
            cutout(out, clip, ct)
    if "chip" in sh:
        ch = static(("chip", sh["chip"]), lambda: chip_img(sh["chip"]))
        paste_c(out, ch, 120, 150, pop((lt - 0.05) / 0.3))
    # cut punch (every shot starts with a small zoom-in)
    if lt < 0.18 and start > 0:
        sc = 1.06 - 0.06 * ease(lt / 0.18)
        h2, w2 = int(H / sc), int(W / sc)
        out = cv2.resize(out[(H - h2) // 2:(H - h2) // 2 + h2, (W - w2) // 2:(W - w2) // 2 + w2], (W, H))
    out = out * (VIG if typ in ("head", "strip") else (1 - (1 - VIG) * 0.4))
    out = grain(out, 0.012)
    o8 = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    if t < 0.3:
        s = int(26 * (1 - t / 0.3))
        o8[:, :, 2] = np.roll(o8[:, :, 2], s, 1)
        o8[:, :, 0] = np.roll(o8[:, :, 0], -s, 1)
    cap = caption_at(t, boxed)
    if cap is not None and typ != "disclaimer":
        f = o8.astype(np.float32) / 255
        paste_c(f, cap, W / 2, cfg.get("caption_y", 1420))
        o8 = (f * 255).astype(np.uint8)
    return o8


preview = [float(v) for v in os.environ.get("PREVIEW", "").split(",") if v]
if preview:
    for t in preview:
        cv2.imwrite(OUT.replace(".mp4", f"_p{t:05.1f}.jpg"), frame(t))
    sys.exit(0)
ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
                       "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p", OUT + ".v.mp4"],
                      stdin=subprocess.PIPE)
N = int(dur * FPS)
for fi in range(N):
    ff.stdin.write(frame(fi / FPS).tobytes())
ff.stdin.close()
ff.wait()
# ---- audio: free voice + sfx library (no paid calls)
sfx = A["sfx"]
inp = ["-i", sys.argv[2] + ".wav", "-i", sfx["glitch"]]
flt = ["[0]highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=1.0[v]", "[1]volume=0.3[g]"]
lab = ["[v]", "[g]"]
for k, (s, e, sh) in enumerate(plan[1:]):
    inp += ["-i", sfx["whoosh"] if sh["type"] != "head" else sfx["tick"]]
    dl = int(max(s - 0.12, 0) * 1000)
    vol = 0.22 if sh["type"] != "head" else 0.0
    if vol:
        flt.append(f"[{k + 2}]adelay={dl}|{dl},volume={vol}[s{k}]")
        lab.append(f"[s{k}]")
    else:
        flt.append(f"[{k + 2}]anullsink")
flt.append("".join(lab) + f"amix=inputs={len(lab)}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5[a]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, "-filter_complex", ";".join(flt), "-map", "[a]", "-ar", "48000",
                "-c:a", "aac", "-b:a", "160k", OUT + ".a.m4a"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", OUT + ".v.mp4", "-i", OUT + ".a.m4a", "-map", "0:v", "-map", "1:a",
                "-c", "copy", "-shortest", "-movflags", "+faststart", OUT], check=True)
os.remove(OUT + ".v.mp4")
os.remove(OUT + ".a.m4a")
print("done", OUT, round(dur, 1), "s")
