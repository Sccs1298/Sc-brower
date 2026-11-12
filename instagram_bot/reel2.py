"""מנוע רילסים v2: כל מה שיש ב-reel.py + כתוביות מסונכרנות מילה-במילה, חלקיקים,
כניסה חזקה (ה-hook גלוי כבר בפריים הראשון) ופס אפקטים קוליים (whoosh / boom / pop).

    render(spec, out_mp4, durs, words, sfx_wav)
    words[i] = רשימת זמני התחלה (שניות, יחסית לתחילת הסצנה) לכל מילה בקריינות של סצנה i
"""
import math
import random
import subprocess
import wave

import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw

import reel
from reel import ORANGE, W, H, FPS, font, tw

reel.SAFE_TOP, reel.SAFE_BOTTOM = 290, 1140   # הוויזואל מעל, הכתוביות מתחת
CAP_Y = 1300
SR = 48000


# ---------- כתוביות ----------

def caption_words(say):
    return [w for w in say.replace("\n", " ").split(" ") if w.strip()]


def fit_timings(words, starts, speech_len):
    """אם מספר הגבולות לא תואם למספר המילים – מחלקים לפי אורך המילים."""
    if starts and len(starts) == len(words):
        return list(starts)
    total = sum(len(w) + 1 for w in words)
    t, out = 0.15, []
    for w in words:
        out.append(t)
        t += speech_len * (len(w) + 1) / total
    return out


def draw_caption(frame, words, starts, lt, chunk=3):
    if not words or lt < starts[0] - 0.05:
        return
    i = max(k for k, s in enumerate(starts) if s <= lt + 0.02) if lt >= starts[0] else 0
    c0 = (i // chunk) * chunk
    group = words[c0:c0 + chunk]
    f = font(900, 76)
    space = tw(" ", f)
    disp = [get_display(w) for w in group]
    widths = [tw(d, f) for d in disp]
    total = sum(widths) + space * (len(group) - 1)
    if total > W - 120:  # מילים ארוכות – מקטינים
        f = font(900, int(76 * (W - 120) / total))
        space = tw(" ", f)
        widths = [tw(d, f) for d in disp]
        total = sum(widths) + space * (len(group) - 1)
    img = Image.new("RGBA", (W, 170), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = (W + total) / 2
    since = lt - starts[i]
    for k, (dsp, wdt) in enumerate(zip(disp, widths)):
        x -= wdt
        active = c0 + k == i
        col = ORANGE if active else (255, 255, 255)
        dy = -8 * math.sin(min(1, since / 0.12) * math.pi / 2) if active else 0
        d.text((x, 40 + dy), dsp, font=f, fill=col, stroke_width=7, stroke_fill=(0, 0, 0))
        x -= space
    frame.alpha_composite(img, (0, CAP_Y - 85))


# ---------- חלקיקים ----------

class Particles:
    def __init__(self, seed, color, n=28):
        rnd = random.Random(seed)
        self.p = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(2, 5), rnd.uniform(14, 40), rnd.uniform(0, 6.28)) for _ in range(n)]
        self.color = color

    def draw(self, frame, t):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x, y, r, v, ph in self.p:
            yy = (y - v * t) % H
            xx = x + 18 * math.sin(t * 0.6 + ph)
            a = int(70 + 50 * math.sin(t * 1.3 + ph))
            d.ellipse([xx - r, yy - r, xx + r, yy + r], fill=(*self.color, a))
        frame.alpha_composite(layer)


# ---------- אפקטים קוליים ----------

def _env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


def whoosh(rng):
    n = int(0.45 * SR)
    noise = rng.standard_normal(n)
    out, lp = np.zeros(n), 0.0
    for k in range(n):  # פילטר low-pass שנפתח – תחושת "שיוף" עולה
        a = 0.02 + 0.25 * (k / n)
        lp += a * (noise[k] - lp)
        out[k] = lp
    return out * _env(n, 0.32, 0.12) * 0.55


def boom():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    f = 70 * np.exp(-t * 3) + 38
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.5)
    s[: int(0.004 * SR)] += np.linspace(0.9, 0, int(0.004 * SR))
    return s * 0.9


def pop():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 18) + 380
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35) * 0.5


def make_sfx(path, durs, types, total):
    rng = np.random.default_rng(3)
    buf = np.zeros(int((total + 1) * SR))

    def add(sig, at):
        i = int(max(0, at) * SR)
        j = min(len(buf), i + len(sig))
        buf[i:j] += sig[: j - i]

    add(boom(), 0.0)
    t = 0.0
    for k, (d, ty) in enumerate(zip(durs, types)):
        if k > 0:
            add(whoosh(rng), t - 0.32)
        if ty == "number":
            add(pop(), t + min(1.6, d * 0.45) + 0.1)
        t += d
    buf = np.clip(buf / max(1e-6, np.abs(buf).max()) * 0.8, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())


# ---------- הרכבה ----------

def render(script, out, durations, words_timing, sfx_path=None):
    scenes = script["scenes"]
    durations = list(durations)
    durations[-1] += 0.6
    objs = [reel.SCENES[sc["type"]](sc, d) for sc, d in zip(scenes, durations)]
    total = sum(durations)
    accent = {"red": reel.RED, "green": reel.GREEN, "blue": reel.BLUE}.get(script.get("accent"), ORANGE)
    bg = reel.make_background(script.get("seed", 1), accent)
    parts = Particles(script.get("seed", 1), accent)
    brand = reel.line_image([("CRYPTO ILS", False)], font(700, 34), color=reel.WHITE)
    caps = []
    for sc, wt, d in zip(scenes, words_timing, durations):
        ws = caption_words(sc["say"])
        caps.append((ws, fit_timings(ws, wt, max(0.5, d - 0.6))))
    starts = np.cumsum([0] + durations[:-1])
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE)
    for fi in range(int(total * FPS)):
        t = fi / FPS
        si = int(np.searchsorted(starts, t, side="right") - 1)
        lt = t - starts[si]
        ox = int(120 + 100 * math.sin(t * 0.25))
        oy = int(180 + 160 * math.sin(t * 0.17 + 1))
        frame = bg.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
        parts.draw(frame, t)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        # ה-hook מופיע מלא כבר בפריים הראשון (חשוב לגלילה ולתמונת השער)
        objs[si].draw(layer, lt + (0.9 if si == 0 else 0))
        if si == 0 and lt < 0.28:  # "פאנץ'" – זום-אאוט מהיר
            s = 1.14 - 0.14 * reel.ease_out(lt / 0.28)
            big = layer.resize((int(W * s), int(H * s)), Image.BICUBIC)
            layer = big.crop(((big.width - W) // 2, (big.height - H) // 2, (big.width - W) // 2 + W, (big.height - H) // 2 + H))
        dy = 0
        if si > 0 and lt < 0.25:
            dy = int(70 * (1 - reel.ease_out(lt / 0.25)))
        a = 1.0 if si == 0 else min(1.0, lt / 0.2)
        if si < len(objs) - 1:
            a = min(a, (durations[si] - lt) / 0.15)
        if a < 1:
            layer.putalpha(layer.getchannel("A").point(lambda v, a=a: int(v * max(0, a))))
        frame.alpha_composite(layer, (0, dy))
        ws, st = caps[si]
        draw_caption(frame, ws, st, lt)
        d = ImageDraw.Draw(frame)
        d.rounded_rectangle([60, 70, W - 60, 80], radius=5, fill=(45, 50, 66))
        d.rounded_rectangle([60, 70, 60 + (W - 120) * (t / total), 80], radius=5, fill=accent)
        d.ellipse([W / 2 - brand.width / 2 - 26, 122, W / 2 - brand.width / 2 - 8, 140], fill=accent)
        frame.alpha_composite(brand, (int(W / 2 - brand.width / 2 + 4), 104))
        proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    if sfx_path:
        make_sfx(sfx_path, durations, [sc["type"] for sc in scenes], total)
    return total
