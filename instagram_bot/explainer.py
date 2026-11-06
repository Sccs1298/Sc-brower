"""רילס "אקספליינר" פרימיום בהשראת @0x100x – סיפור, אייקון תלת-ממדי לכל משפט, מילה אחת למעלה, מספר ענק.

    python instagram_bot/explainer.py spec.json out.mp4

spec:
{
  "vo_json": "vo.json", "vo_mp3": "vo.mp3",            # vo.json: {text, sentences, alignment{character_start_times_seconds,...}}
  "replace": {"אקס אר פי": "XRP"},
  "scenes": [                                          # סצנה לכל משפט ב-sentences
    {"theme": "dark"|"light"|"black", "icon": "path.png", "head": "$6.3B", "sub": "נגנבו מבינאנס",
     "head_size": 190, "x_mark": false}
  ]
}
אייקונים: 3dicons.co (CC0) – premium לכהה, clay לבהיר.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ORANGE = (247, 147, 26)
_fonts = {}


def F(weight, size):
    k = (weight, size)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(os.path.join(HERE, "fonts", f"Heebo-{weight}.ttf"), size,
                                       layout_engine=ImageFont.Layout.BASIC)
    return _fonts[k]


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


THEMES = {
    "dark": dict(top=(20, 20, 22), bot=(5, 5, 6), text=(245, 245, 245), sub=(150, 150, 155), glow=ORANGE, glow_a=0.22),
    "black": dict(top=(8, 8, 9), bot=(0, 0, 0), text=(245, 245, 245), sub=(150, 150, 155), glow=None, glow_a=0),
    "light": dict(top=(236, 236, 237), bot=(214, 214, 216), text=(18, 18, 20), sub=(110, 110, 115), glow=(255, 255, 255), glow_a=0.9),
}


def background(theme):
    th = THEMES[theme]
    y = np.linspace(0, 1, H)[:, None, None]
    top, bot = np.array(th["top"], float), np.array(th["bot"], float)
    arr = np.broadcast_to(top * (1 - y) + bot * y, (H, W, 3)).copy()
    if th["glow"]:
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt(((xx - W / 2) / 520) ** 2 + ((yy - 860) / 520) ** 2)
        g = np.clip(1 - d, 0, 1) ** 2 * th["glow_a"]
        arr = arr * (1 - g[..., None]) + np.array(th["glow"], float) * g[..., None]
    return Image.fromarray(arr.astype(np.uint8)).convert("RGBA")


def text_img(text, font, fill):
    s = get_display(text)
    l, t, r, b = font.getbbox(s)
    im = Image.new("RGBA", (r - l + 8, b - t + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - l, 4 - t), s, font=font, fill=fill)
    return im


def fade(im, a):
    if a >= 1:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * max(0, a))))
    return im


def icon_layers(path, size, theme):
    ic = Image.open(path).convert("RGBA")
    ic = ic.resize((size, int(ic.height * size / ic.width)), Image.LANCZOS)
    # השתקפות
    ref = ic.transpose(Image.FLIP_TOP_BOTTOM)
    grad = Image.linear_gradient("L").resize(ref.size).point(lambda v: int(max(0, 255 - v * 2.6) * 0.28))
    ref.putalpha(Image.composite(ref.getchannel("A"), Image.new("L", ref.size, 0), grad))
    # צל רך
    sh = Image.new("RGBA", (size + 200, 160), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((100, 40, size + 100, 120), fill=(0, 0, 0, 150 if theme == "light" else 220))
    sh = sh.filter(ImageFilter.GaussianBlur(28))
    return ic, ref, sh


def x_mark(size, a):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    p = ease(a)
    w = 26
    d.line((40, 40, 40 + (size - 80) * p, 40 + (size - 80) * p), fill=(225, 40, 50, 235), width=w)
    if a > 0.5:
        q = ease((a - 0.5) * 2)
        d.line((size - 40, 40, size - 40 - (size - 80) * q, 40 + (size - 80) * q), fill=(225, 40, 50, 235), width=w)
    return im


def words_with_times(text, al, replacements):
    starts = al["character_start_times_seconds"]
    words, pos = [], 0
    for w in text.split(" "):
        i = text.index(w, pos)
        words.append([w, starts[i]])
        pos = i + len(w)
    for src, dst in replacements.items():
        parts = src.split(" ")
        k = 0
        while k <= len(words) - len(parts):
            if [x[0].strip(",.?!") for x in words[k:k + len(parts)]] == parts:
                tail = words[k + len(parts) - 1][0][len(parts[-1]):]
                words[k:k + len(parts)] = [[dst + tail, words[k][1]]]
            k += 1
    return words


def render(spec, out):
    vo = json.load(open(spec["vo_json"], encoding="utf-8"))
    text, al = vo["text"], vo["alignment"]
    total = al["character_end_times_seconds"][-1] + 1.0
    starts, pos = [], 0
    for s in vo["sentences"]:
        i = text.index(s, pos)
        starts.append(al["character_start_times_seconds"][i])
        pos = i + len(s)
    starts = [0.0] + [max(0, s - 0.1) for s in starts[1:]]
    ends = starts[1:] + [total]
    words = words_with_times(text, al, spec.get("replace", {}))

    pre = []
    for sc in spec["scenes"]:
        th = sc.get("theme", "dark")
        p = {"bg": background(th), "th": THEMES[th]}
        if sc.get("icon"):
            p["icon"] = icon_layers(sc["icon"], sc.get("icon_size", 560), th)
        if sc.get("head"):
            p["head"] = text_img(sc["head"], F(900, sc.get("head_size", 150)), p["th"]["text"])
        if sc.get("sub"):
            p["sub"] = text_img(sc["sub"], F(400, 52), p["th"]["sub"])
        pre.append(p)
    brand = {k: text_img("C R Y P T O   I L S", F(700, 26), c) for k, c in (("d", (120, 120, 125)), ("l", (120, 120, 125)))}

    silent = out + ".silent.mp4"
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", silent],
        stdin=subprocess.PIPE)
    for fi in range(int(total * FPS)):
        t = fi / FPS
        k = max(i for i, s in enumerate(starts) if s <= t)
        lt, dur = t - starts[k], ends[k] - starts[k]
        sc, p = spec["scenes"][k], pre[k]
        fr = p["bg"].copy()
        has_icon = "icon" in p
        if has_icon:
            ic, ref, sh = p["icon"]
            a = ease(lt / 0.55)
            sc_f = (0.86 + 0.14 * a) * (1 + 0.035 * lt / max(dur, 1))
            fy = math.sin(lt * 1.6) * 10
            iw, ih = int(ic.width * sc_f), int(ic.height * sc_f)
            cx, cy = W // 2, sc.get("icon_y", 840)
            top = int(cy - ih / 2 + fy + 40 * (1 - a))
            fr.alpha_composite(fade(sh.resize((int(sh.width * sc_f), sh.height)), a * 0.9),
                               (int(cx - sh.width * sc_f / 2), int(cy + ih / 2 - 30)))
            fr.alpha_composite(fade(ref.resize((iw, ih)), a), (cx - iw // 2, int(cy + ih / 2 + 6 - fy)))
            fr.alpha_composite(fade(ic.resize((iw, ih), Image.BILINEAR), a), (cx - iw // 2, top))
            if sc.get("x_mark") and lt > 0.9:
                xm = x_mark(int(iw * 0.9), (lt - 0.9) / 0.5)
                fr.alpha_composite(xm, (cx - xm.width // 2, top + (ih - xm.height) // 2))
        ty = sc.get("head_y", 1330 if has_icon else 860)
        if "head" in p:
            a = ease((lt - 0.15) / 0.5)
            hi = p["head"]
            fr.alpha_composite(fade(hi, a), ((W - hi.width) // 2, int(ty + 40 * (1 - a))))
            ty += hi.height + 26
        if "sub" in p:
            a = ease((lt - 0.35) / 0.5)
            si = p["sub"]
            fr.alpha_composite(fade(si, a), ((W - si.width) // 2, int(ty + 30 * (1 - a))))
        # מילה אחת למעלה (כמו ברפרנס)
        cur = [w for w, s in words if s <= t + 0.03]
        if cur and t < total - 0.8:
            wi = text_img(cur[-1].strip(",."), F(700, 46), p["th"]["text"])
            fr.alpha_composite(wi, ((W - wi.width) // 2, 230))
        b = brand["d"]
        fr.alpha_composite(b, ((W - b.width) // 2, 1790))
        # מעבר: הבזק קצר לשחור/לבן
        if k > 0 and lt < 0.12:
            c = (255, 255, 255) if sc.get("theme") == "light" else (0, 0, 0)
            fr.alpha_composite(Image.new("RGBA", (W, H), c + (int(200 * (1 - lt / 0.12)),)))
        proc.stdin.write(fr.convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", spec["vo_mp3"],
                    "-filter_complex", "[1:a]apad,loudnorm=I=-14:TP=-1.5:LRA=11[a]", "-map", "0:v", "-map", "[a]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out],
                   check=True)
    os.remove(silent)
    return total


if __name__ == "__main__":
    print(render(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2]))
