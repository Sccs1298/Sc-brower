"""מנוע רילסים: סקריפט JSON → MP4 אנכי (1080x1920, 30fps) בעברית.

כל סצנה מקבלת משך (בד"כ לפי אורך הקריינות) ומונפשת: כותרות קופצות, מספרים שסופרים,
גרפים שמצטיירים, רשימות שנחשפות. בחלק העליון פס התקדמות ומיתוג.

    python reel.py script.json out.mp4 [durations.json]
"""
import json
import math
import random
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
FONTS = Path(__file__).resolve().parent / "fonts"
EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"

BG = (7, 8, 13)
WHITE = (245, 246, 250)
MUTED = (160, 168, 184)
ORANGE = (247, 147, 26)
GREEN = (34, 197, 94)
RED = (239, 68, 68)
BLUE = (59, 130, 246)
CARD = (22, 26, 38)
HANDLE = "@crypto_ils"
SAFE_TOP, SAFE_BOTTOM = 330, 1560  # מחוץ לאזור של ממשק הרילס


@lru_cache(None)
def font(weight, size):
    return ImageFont.truetype(str(FONTS / f"Heebo-{weight}.ttf"), size, layout_engine=ImageFont.Layout.BASIC)


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = max(0.0, min(1.0, x))
    c = 1.70158
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


# ---------- טקסט RTL עם הדגשות (*מילה*) ----------

def tokens(text):
    out, hl = [], False
    for raw in text.replace("\n", " ").split(" "):
        if not raw:
            continue
        core = raw.rstrip("?!.,:")
        starts = raw.startswith("*")
        ends = core.endswith("*") and len(core) > 1
        if starts:
            hl = True
        word = raw.replace("*", "")
        if word in ("–", "-", "—") and out:  # מקף לא פותח שורה – נצמד למילה שלפניו
            out[-1] = (out[-1][0] + " " + word, out[-1][1])
        else:
            out.append((word, hl))
        if ends:
            hl = False
    return out


_measure = ImageDraw.Draw(Image.new("RGB", (10, 10)))


def tw(text, f):
    return _measure.textlength(text, font=f)


def wrap_tokens(toks, f, maxw):
    lines, cur = [], []
    for t in toks:
        trial = cur + [t]
        if not cur or tw(get_display(" ".join(w for w, _ in trial)), f) <= maxw:
            cur = trial
        else:
            lines.append(cur)
            cur = [t]
    if cur:
        lines.append(cur)
    return lines


def balanced(toks, f, maxw):
    n = len(wrap_tokens(toks, f, maxw))
    if n <= 1:
        return wrap_tokens(toks, f, maxw)
    lo, hi = 150, maxw
    while hi - lo > 4:
        mid = (lo + hi) / 2
        if len(wrap_tokens(toks, f, mid)) <= n:
            hi = mid
        else:
            lo = mid
    return wrap_tokens(toks, f, hi)


def line_image(words, f, color=WHITE, hl_fg=BG, hl_bg=ORANGE, pad=14):
    """שורה אחת כתמונה שקופה, מימין לשמאל, עם רקע כתום למילים מודגשות."""
    runs = []
    for w, hl in words:
        if runs and runs[-1][1] == hl:
            runs[-1][0].append(w)
        else:
            runs.append(([w], hl))
    space = tw(" ", f)
    parts = [(get_display(" ".join(ws)), hl) for ws, hl in runs]
    total = sum(tw(s, f) for s, _ in parts) + space * (len(parts) - 1) + 2 * pad
    asc, desc = f.getmetrics()
    h = asc + desc + 2 * pad
    img = Image.new("RGBA", (int(total) + 4, int(h)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = total - pad
    for s, hl in parts:
        wdt = tw(s, f)
        x -= wdt
        if hl:
            d.rounded_rectangle([x - pad, pad * 0.6, x + wdt + pad, h - pad * 0.4], radius=int(f.size * 0.18), fill=hl_bg)
            d.text((x, pad), s, font=f, fill=hl_fg)
        else:
            d.text((x, pad), s, font=f, fill=color)
        x -= space
    return img


def text_block(text, f, maxw=W - 180, color=WHITE, line_gap=1.08):
    lines = [line_image(l, f, color) for l in balanced(tokens(text), f, maxw)]
    return lines, int(f.size * line_gap * 1.25)


@lru_cache(None)
def emoji_img(ch, size):
    try:
        ef = ImageFont.truetype(EMOJI_FONT, 109)
        im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((10, 10), ch, font=ef, embedded_color=True)
        bbox = im.getbbox()
        if not bbox:
            return None
        im = im.crop(bbox)
        return im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)
    except Exception:  # noqa: BLE001
        return None


# ---------- רקע ----------

def make_background(seed, accent):
    rnd = random.Random(seed)
    bw, bh = W + 240, H + 360
    base = Image.new("RGB", (bw, bh), BG)
    glow = Image.new("RGB", (bw, bh), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    for col, r, a in ((accent, 520, 0.42), (BLUE, 440, 0.28), (accent, 300, 0.22)):
        cx, cy = rnd.randint(0, bw), rnd.randint(0, bh)
        g.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(int(c * a) for c in col))
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    base = Image.fromarray(np.clip(np.asarray(base, dtype=np.int16) + np.asarray(glow, dtype=np.int16), 0, 255).astype(np.uint8))
    grid = Image.new("L", (bw, bh), 0)
    gd = ImageDraw.Draw(grid)
    for x in range(0, bw, 90):
        gd.line([(x, 0), (x, bh)], fill=7)
    for y in range(0, bh, 90):
        gd.line([(0, y), (bw, y)], fill=7)
    base.paste((255, 255, 255), (0, 0), grid)
    noise = np.random.default_rng(seed).integers(-6, 7, (bh, bw, 1), dtype=np.int16)
    base = Image.fromarray(np.clip(np.asarray(base, dtype=np.int16) + noise, 0, 255).astype(np.uint8))
    return base


# ---------- סצנות ----------

class Scene:
    def __init__(self, spec, dur):
        self.s, self.dur = spec, dur

    def draw(self, frame, t):
        raise NotImplementedError


def paste_center(frame, img, cy, alpha=1.0, dy=0, scale=1.0, cx=W // 2):
    if alpha <= 0:
        return
    if scale != 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.BICUBIC)
    if alpha < 1:
        a = img.getchannel("A").point(lambda v: int(v * alpha))
        img = img.copy()
        img.putalpha(a)
    frame.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2 + dy)))


def paste_right(frame, img, x_right, y, alpha=1.0, dx=0):
    if alpha <= 0:
        return
    if alpha < 1:
        img = img.copy()
        img.putalpha(img.getchannel("A").point(lambda v: int(v * alpha)))
    frame.alpha_composite(img, (int(x_right - img.width + dx), int(y)))


def pill(text, f, bg=ORANGE, fg=BG):
    disp = get_display(text)
    w_, h_ = int(tw(disp, f) + 56), int(f.size * 1.7)
    im = Image.new("RGBA", (w_, h_), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w_ - 1, h_ - 1], radius=h_ // 2, fill=bg)
    d.text((28, (h_ - f.size * 1.45) / 2), disp, font=f, fill=fg)
    return im


class Hook(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        self.lines, self.lh = text_block(spec["text"], font(900, spec.get("size", 126)), W - 150)
        self.emoji = emoji_img(spec["emoji"], 190) if spec.get("emoji") else None
        self.tag = pill(spec["tag"], font(700, 46)) if spec.get("tag") else None

    def draw(self, f, t):
        n = len(self.lines)
        block = n * self.lh + (230 if self.emoji else 0) + (110 if self.tag else 0)
        y = (SAFE_TOP + SAFE_BOTTOM) / 2 - block / 2
        zoom = 1 + 0.03 * (t / self.dur)
        if self.tag:
            paste_center(f, self.tag, y + 30, ease_out(t / 0.25), dy=20 * (1 - ease_out(t / 0.25)))
            y += 110
        if self.emoji:
            k = ease_back((t - 0.05) / 0.45)
            paste_center(f, self.emoji, y + 100, min(1, k * 1.5), scale=max(0.01, k))
            y += 230
        for i, im in enumerate(self.lines):
            k = ease_out((t - 0.12 - i * 0.14) / 0.35)
            paste_center(f, im, y + self.lh / 2, k, dy=60 * (1 - k), scale=zoom)
            y += self.lh


class Text(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        self.kicker = pill(spec["kicker"], font(700, 44)) if spec.get("kicker") else None
        self.title, self.tlh = text_block(spec.get("title", ""), font(900, int(spec.get("tsize", 86) * 1.12)), W - 160) if spec.get("title") else ([], 0)
        self.body, self.blh = text_block(spec.get("body", ""), font(400, 62), W - 160, color=(225, 229, 238)) if spec.get("body") else ([], 0)
        self.emoji = emoji_img(spec["emoji"], 150) if spec.get("emoji") else None

    def draw(self, f, t):
        block = (100 if self.kicker else 0) + (190 if self.emoji else 0) + len(self.title) * self.tlh + (50 if self.body else 0) + len(self.body) * self.blh
        y = (SAFE_TOP + SAFE_BOTTOM) / 2 - block / 2
        step = 0
        if self.kicker:
            k = ease_out(t / 0.3)
            paste_center(f, self.kicker, y + 35, k, dy=25 * (1 - k))
            y += 100
        if self.emoji:
            k = ease_back((t - 0.05) / 0.45)
            paste_center(f, self.emoji, y + 80, min(1, k * 1.5), scale=max(0.01, k))
            y += 190
        for im in self.title:
            k = ease_out((t - 0.1 - step * 0.12) / 0.35)
            paste_center(f, im, y + self.tlh / 2, k, dy=50 * (1 - k))
            y += self.tlh
            step += 1
        if self.body:
            y += 50
            for im in self.body:
                k = ease_out((t - 0.35 - step * 0.1) / 0.4)
                paste_center(f, im, y + self.blh / 2, k, dy=40 * (1 - k))
                y += self.blh
                step += 1


class Number(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        self.color = {"green": GREEN, "red": RED, "white": WHITE}.get(spec.get("color"), ORANGE)
        self.label, self.llh = text_block(spec.get("label", ""), font(700, 66), W - 170) if spec.get("label") else ([], 0)
        self.sub, self.slh = text_block(spec.get("sub", ""), font(400, 52), W - 190, color=MUTED) if spec.get("sub") else ([], 0)
        self.kicker = pill(spec["kicker"], font(700, 44)) if spec.get("kicker") else None
        self.nf = font(900, spec.get("nsize", 200))

    def fmt(self, v):
        d = self.s.get("decimals", 0)
        s = f"{v:,.{d}f}"
        return f"{self.s.get('prefix', '')}{s}{self.s.get('suffix', '')}"

    def draw(self, f, t):
        final = self.fmt(self.s["value"])
        nh = self.nf.size * 1.3
        block = (100 if self.kicker else 0) + nh + 40 + len(self.label) * self.llh + (len(self.sub) * self.slh + 20 if self.sub else 0)
        y = (SAFE_TOP + SAFE_BOTTOM) / 2 - block / 2
        if self.kicker:
            paste_center(f, self.kicker, y + 35, ease_out(t / 0.3))
            y += 100
        start = self.s.get("start", 0)
        k = ease_out((t - 0.1) / max(0.6, min(1.6, self.dur * 0.45)))
        v = start + (self.s["value"] - start) * k
        txt = get_display(self.fmt(v) if k < 1 else final)
        final = get_display(final)
        nf = self.nf
        while tw(final, nf) > W - 120 and nf.size > 60:
            nf = font(900, nf.size - 8)
        im = Image.new("RGBA", (W, int(nf.size * 1.45)), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # הילה
        glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).text(((W - tw(txt, nf)) / 2, 0), txt, font=nf, fill=(*self.color, 140))
        glow = glow.filter(ImageFilter.GaussianBlur(22))
        im.alpha_composite(glow)
        d.text(((W - tw(txt, nf)) / 2, 0), txt, font=nf, fill=self.color)
        pop = 1 + 0.06 * math.sin(min(1, max(0, (t - 0.1 - 1.2) / 0.3)) * math.pi) if k >= 1 else 1
        paste_center(f, im, y + nh / 2, ease_out(t / 0.2), scale=pop)
        y += nh + 40
        for im2 in self.label:
            kk = ease_out((t - 0.3) / 0.4)
            paste_center(f, im2, y + self.llh / 2, kk, dy=30 * (1 - kk))
            y += self.llh
        if self.sub:
            y += 20
            for im2 in self.sub:
                kk = ease_out((t - 0.55) / 0.4)
                paste_center(f, im2, y + self.slh / 2, kk)
                y += self.slh


class Chart(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        rnd = random.Random(spec.get("seed", 7))
        pts = spec.get("points")
        if not pts:
            trend = spec.get("trend", "up")
            v, pts = 50.0, []
            for i in range(60):
                drift = 0.9 if trend == "up" else -0.9
                if trend == "crash" and i > 38:
                    drift = -4.5
                v += drift + rnd.uniform(-3.2, 3.2)
                pts.append(v)
        self.pts = pts
        self.up = pts[-1] >= pts[0]
        self.color = GREEN if self.up else RED
        self.title, self.tlh = text_block(spec.get("title", ""), font(900, 76), W - 160) if spec.get("title") else ([], 0)
        self.vlabel = spec.get("value_label")
        self.caption, self.clh = text_block(spec.get("caption", ""), font(400, 50), W - 180, color=MUTED) if spec.get("caption") else ([], 0)

    def draw(self, f, t):
        y = SAFE_TOP + 30
        for im in self.title:
            k = ease_out(t / 0.35)
            paste_center(f, im, y + self.tlh / 2, k, dy=40 * (1 - k))
            y += self.tlh
        x0, x1, y0, y1 = 110, W - 110, y + 60, y + 640
        d = ImageDraw.Draw(f)
        card = Image.new("RGBA", (x1 - x0 + 60, y1 - y0 + 60), (0, 0, 0, 0))
        ImageDraw.Draw(card).rounded_rectangle([0, 0, card.width - 1, card.height - 1], radius=36, fill=(*CARD, 210))
        f.alpha_composite(card, (x0 - 30, int(y0 - 30)))
        for i in range(1, 4):
            yy = y0 + (y1 - y0) * i / 4
            d.line([(x0, yy), (x1, yy)], fill=(40, 46, 62), width=2)
        lo, hi = min(self.pts), max(self.pts)
        k = ease_out((t - 0.2) / max(0.8, self.dur * 0.6))
        n = max(2, int(len(self.pts) * k))
        xy = [(x0 + (x1 - x0) * i / (len(self.pts) - 1), y1 - (y1 - y0) * (p - lo) / (hi - lo or 1)) for i, p in enumerate(self.pts[:n])]
        # מילוי מתחת לקו
        fill = Image.new("RGBA", f.size, (0, 0, 0, 0))
        ImageDraw.Draw(fill).polygon(xy + [(xy[-1][0], y1), (xy[0][0], y1)], fill=(*self.color, 45))
        f.alpha_composite(fill)
        d.line(xy, fill=self.color, width=9, joint="curve")
        ex, ey = xy[-1]
        r = 16 + 5 * math.sin(t * 8)
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=self.color)
        if self.vlabel and k > 0.95:
            lab = pill(self.vlabel, font(900, 46), bg=self.color, fg=BG)
            lx = min(max(ex - lab.width / 2, 40), W - lab.width - 40)
            ly = ey - 110 if ey - 110 > y0 - 20 else ey + 40
            f.alpha_composite(lab, (int(lx), int(ly)))
        y = y1 + 70
        for im in self.caption:
            kk = ease_out((t - 0.6) / 0.4)
            paste_center(f, im, y + self.clh / 2, kk)
            y += self.clh


class ListScene(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        self.title, self.tlh = text_block(spec.get("title", ""), font(900, 92), W - 160) if spec.get("title") else ([], 0)
        self.items = [text_block(it, font(700, 60), W - 330)[0] for it in spec["items"]]
        self.nf = font(900, 52)

    def draw(self, f, t):
        ih = [max(1, len(lines)) * 78 + 56 for lines in self.items]
        block = len(self.title) * self.tlh + 50 + sum(ih) + 26 * len(ih)
        y = (SAFE_TOP + SAFE_BOTTOM) / 2 - block / 2
        for im in self.title:
            k = ease_out(t / 0.35)
            paste_center(f, im, y + self.tlh / 2, k, dy=40 * (1 - k))
            y += self.tlh
        y += 50
        n = len(self.items)
        span = max(0.5, self.dur - 0.9)
        for i, lines in enumerate(self.items):
            t0 = 0.4 + span * i / n
            k = ease_out((t - t0) / 0.35)
            if k <= 0:
                y += ih[i] + 26
                continue
            card = Image.new("RGBA", (W - 160, ih[i]), (0, 0, 0, 0))
            cd = ImageDraw.Draw(card)
            cd.rounded_rectangle([0, 0, card.width - 1, card.height - 1], radius=30, fill=(*CARD, 235))
            cx, cy = card.width - 70, card.height / 2
            cd.ellipse([cx - 38, cy - 38, cx + 38, cy + 38], fill=ORANGE)
            num = str(i + 1)
            cd.text((cx - tw(num, self.nf) / 2, cy - 38), num, font=self.nf, fill=BG)
            ly = (card.height - len(lines) * 78) / 2 - 8
            for im in lines:
                card.alpha_composite(im, (int(card.width - 130 - im.width), int(ly)))
                ly += 78
            paste_right(f, card, W - 80, y, k, dx=80 * (1 - k))
            y += ih[i] + 26


class CTA(Scene):
    def __init__(self, spec, dur):
        super().__init__(spec, dur)
        self.top, self.tlh = text_block(spec.get("text", "רוצים עוד עדכונים כאלה?"), font(900, 92), W - 160)
        self.handle = pill(HANDLE, font(900, 72))
        self.sub, self.slh = text_block(spec.get("sub", "עקבו · שמרו · שלחו לחבר"), font(700, 52), W - 200, color=MUTED)

    def draw(self, f, t):
        block = len(self.top) * self.tlh + 60 + self.handle.height + 60 + len(self.sub) * self.slh
        y = (SAFE_TOP + SAFE_BOTTOM) / 2 - block / 2
        for im in self.top:
            k = ease_out(t / 0.35)
            paste_center(f, im, y + self.tlh / 2, k, dy=40 * (1 - k))
            y += self.tlh
        y += 60
        k = ease_back((t - 0.25) / 0.5)
        paste_center(f, self.handle, y + self.handle.height / 2, min(1, max(0, k)), scale=max(0.01, k))
        y += self.handle.height + 60
        for im in self.sub:
            paste_center(f, im, y + self.slh / 2, ease_out((t - 0.6) / 0.4))
            y += self.slh


SCENES = {"hook": Hook, "text": Text, "number": Number, "chart": Chart, "list": ListScene, "cta": CTA}


# ---------- הרכבה ----------

def render(script, out, durations=None, preview_dir=None):
    scenes = script["scenes"]
    if durations is None:
        durations = [sc.get("dur", 3.0) for sc in scenes]
    tail = 0.6  # שקט קטן בסוף
    durations = list(durations)
    durations[-1] += tail
    objs = [SCENES[sc["type"]](sc, d) for sc, d in zip(scenes, durations)]
    total = sum(durations)
    accent = {"red": RED, "green": GREEN, "blue": BLUE}.get(script.get("accent"), ORANGE)
    bg = make_background(script.get("seed", 1), accent)
    brand = line_image([("CRYPTO ILS", False)], font(700, 34), color=WHITE)
    nframes = int(total * FPS)
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE)
    starts = np.cumsum([0] + durations[:-1])
    for fi in range(nframes):
        t = fi / FPS
        si = int(np.searchsorted(starts, t, side="right") - 1)
        lt = t - starts[si]
        # רקע נע לאט
        ox = int(120 + 100 * math.sin(t * 0.25))
        oy = int(180 + 160 * math.sin(t * 0.17 + 1))
        frame = bg.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        objs[si].draw(layer, lt)
        # מעבר: fade in / fade out
        a = min(1.0, lt / 0.18, (durations[si] - lt) / 0.15 if si < len(objs) - 1 else 1.0)
        if a < 1:
            layer.putalpha(layer.getchannel("A").point(lambda v, a=a: int(v * max(0, a))))
        frame.alpha_composite(layer)
        d = ImageDraw.Draw(frame)
        d.rounded_rectangle([60, 70, W - 60, 80], radius=5, fill=(45, 50, 66))
        d.rounded_rectangle([60, 70, 60 + (W - 120) * (t / total), 80], radius=5, fill=accent)
        d.ellipse([W / 2 - brand.width / 2 - 26, 122, W / 2 - brand.width / 2 - 8, 140], fill=accent)
        frame.alpha_composite(brand, (int(W / 2 - brand.width / 2 + 4), 104))
        rgb = frame.convert("RGB")
        if preview_dir is not None and fi in script.get("_preview_frames", []):
            rgb.save(Path(preview_dir) / f"f{fi:04d}.png")
        proc.stdin.write(rgb.tobytes())
    proc.stdin.close()
    proc.wait()
    return total


if __name__ == "__main__":
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    durs = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else None
    print(render(spec, sys.argv[2], durs))
