"""רילס חדשות בסגנון coinsauce: רקע אפור, תיבת כותרת לבנה למעלה, וידאו/מם באמצע,
כתוביות מסונכרנות מילה-במילה מתחת, ולוגו קטן. קריינות ElevenLabs עם תזמון תווים.

    python newsreel.py spec.json out.mp4
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cs_carousel import F, heatmap, tw  # noqa: E402

W, H, FPS = 1080, 1920, 30
MX, MY, MW, MH = 0, 560, 1080, 960          # אזור המדיה
BOX_Y = 250                                  # תיבת הכותרת
CAP_Y = 1580                                 # כתוביות
PILL_Y = 1735
DARK = (16, 16, 18)
ORANGE = (247, 147, 26)
RED = (226, 40, 48)
GREEN = (30, 170, 80)


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def gray_bg():
    y = np.linspace(0, 1, H)[:, None, None]
    top, bot = np.array((204, 204, 206)), np.array((232, 232, 234))
    col = top * (1 - y) + bot * y
    col = np.repeat(col, W, axis=1)
    yy, xx = np.mgrid[0:H, 0:W]
    col = col + (np.exp(-(((xx - W / 2) / 560) ** 2 + ((yy - H * 0.45) / 800) ** 2)) * 20)[..., None]
    col += np.random.default_rng(1).normal(0, 2.0, (H, W, 1))
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).convert("RGBA")


def wrap(text, f, maxw):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if not cur or tw(get_display(t), f) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def balanced(text, f, maxw):
    n = len(wrap(text, f, maxw))
    if n == 1:
        return [text]
    lo, hi = 150, maxw
    while hi - lo > 3:
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if len(wrap(text, f, mid)) <= n else (mid, hi)
    return wrap(text, f, hi)


def title_box(text):
    f = F(700, 62)
    lines = balanced(text, f, 860)
    lh = 80
    bw = max(tw(get_display(l), f) for l in lines) + 90
    bh = len(lines) * lh + 46
    img = Image.new("RGBA", (int(bw) + 40, int(bh) + 40), (0, 0, 0, 0))
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([20, 26, bw + 20, bh + 26], radius=28, fill=(0, 0, 0, 40))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([20, 20, bw + 20, bh + 20], radius=28, fill=(255, 255, 255))
    y = 20 + 18
    for l in lines:
        s = get_display(l)
        d.text((20 + (bw - tw(s, f)) / 2, y), s, font=f, fill=DARK)
        y += lh
    return img


def pill(img):
    d = ImageDraw.Draw(img)
    f = F(900, 30)
    text, sp = "CRYPTO ILS", 2
    width = sum(tw(c, f) for c in text) + sp * (len(text) - 1)
    pw, ph = width + 44, 52
    x0 = (W - pw) / 2
    d.rounded_rectangle([x0, PILL_Y, x0 + pw, PILL_Y + ph], radius=14, fill=(240, 240, 242))
    x = x0 + 22
    for c in text:
        d.text((x, PILL_Y + 8), c, font=f, fill=(40, 40, 44))
        x += tw(c, f) + sp


class ClipReader:
    """קורא פריימים מקובץ וידאו, חתוך ל-MWxMH, בלופ אם צריך."""

    def __init__(self, path, start=0.0, zoom=1.0, anchor="center"):
        sh = int(MH * zoom) // 2 * 2
        y = {"center": f"(in_h-{MH})/2", "bottom": f"in_h-{MH}", "top": "0"}[anchor]
        self.p = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-stream_loop", "-1", "-ss", str(start), "-i", path,
             "-vf", f"scale=-2:{sh},crop={MW}:{MH}:(in_w-{MW})/2:{y},fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE)

    def frame(self):
        buf = self.p.stdout.read(MW * MH * 3)
        return Image.frombytes("RGB", (MW, MH), buf)

    def close(self):
        self.p.kill()


def still_media(path_or_img, bg=(18, 18, 20)):
    im = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img).convert("RGB")
    s = min(MW / im.width, MH / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    canvas = Image.new("RGB", (MW, MH), bg)
    canvas.paste(im, ((MW - im.width) // 2, (MH - im.height) // 2))
    return canvas


def ticker_cards(items, t):
    """[(sym, pct)] – כרטיסים שנכנסים אחד אחרי השני"""
    layer = Image.new("RGBA", (MW, MH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f1, f2 = F(900, 58), F(900, 58)
    y = MH - 120 - (len(items) - 1) * 110
    for i, (sym, pct) in enumerate(items):
        k = ease((t - 0.4 - i * 0.55) / 0.35)
        if k <= 0:
            continue
        col = RED if pct < 0 else GREEN
        txt = f"{pct:+.1f}%"
        w = 420
        x = MW - 60 - w + int(80 * (1 - k))
        a = int(255 * k)
        d.rounded_rectangle([x, y, x + w, y + 92], radius=24, fill=(255, 255, 255, a))
        d.text((x + w - 30 - tw(sym, f1), y + 10), sym, font=f1, fill=(*DARK, a))
        d.text((x + 30, y + 10), txt, font=f2, fill=(*col, a))
        y += 110
    return layer


def words_with_times(text, alignment, replacements):
    starts = alignment["character_start_times_seconds"]
    words, pos = [], 0
    for w in text.split(" "):
        i = text.index(w, pos)
        words.append([w, starts[i]])
        pos = i + len(w)
    # החלפות תצוגה (למשל "אקס אר פי" → "XRP")
    for src, dst in replacements.items():
        parts = src.split(" ")
        k = 0
        while k <= len(words) - len(parts):
            if [x[0].strip(",.?") for x in words[k:k + len(parts)]] == parts:
                tail = words[k + len(parts) - 1][0][len(parts[-1]):]
                words[k:k + len(parts)] = [[dst + tail, words[k][1]]]
            k += 1
    return words


def caption_groups(words, chunk=3):
    """קבוצות של עד 3 מילים, שלא חוצות סוף משפט/פסוקית"""
    groups, cur = [], []
    for idx, (w, _) in enumerate(words):
        cur.append(idx)
        if len(cur) == chunk or w[-1:] in ".?!:,":
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def draw_caption(img, words, t, chunk=3):
    if t < words[0][1] - 0.05:
        return
    i = max(k for k, (_, s) in enumerate(words) if s <= t + 0.03)
    g = next(g for g in caption_groups(words, chunk) if i in g)
    c0 = g[0]
    group = [words[j] for j in g]
    f = F(900, 74)
    disp = [get_display(w) for w, _ in group]
    widths = [tw(x, f) for x in disp]
    sp = tw(" ", f)
    total = sum(widths) + sp * (len(group) - 1)
    if total > W - 100:
        f = F(900, int(74 * (W - 100) / total))
        widths = [tw(x, f) for x in disp]
        sp = tw(" ", f)
        total = sum(widths) + sp * (len(group) - 1)
    d = ImageDraw.Draw(img)
    x = (W + total) / 2
    for k, (s, wd) in enumerate(zip(disp, widths)):
        x -= wd
        active = c0 + k == i
        if active:
            d.rounded_rectangle([x - 12, CAP_Y - 4, x + wd + 12, CAP_Y + f.size * 1.32], radius=14, fill=ORANGE)
        d.text((x, CAP_Y), s, font=f, fill=(255, 255, 255) if active else DARK)
        x -= sp


def make_sfx(path, cut_times, total, sr=48000):
    rng = np.random.default_rng(3)
    buf = np.zeros(int((total + 1) * sr))
    for c in cut_times:
        n = int(0.4 * sr)
        noise = rng.standard_normal(n)
        lp, out = 0.0, np.zeros(n)
        for k in range(n):
            a = 0.02 + 0.22 * (k / n)
            lp += a * (noise[k] - lp)
            out[k] = lp
        env = np.minimum(1, np.linspace(0, 1, n) / 0.75) * np.linspace(1, 0, n) ** 0.5
        i = int(max(0, c - 0.3) * sr)
        buf[i:i + n] += (out * env)[: len(buf) - i]
    buf = buf / (np.abs(buf).max() + 1e-9) * 0.35
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())


def render(spec, out):
    vo = json.load(open(spec["vo_json"], encoding="utf-8"))
    text, al = vo["text"], vo["alignment"]
    total = al["character_end_times_seconds"][-1] + 0.9
    sent_starts = []
    pos = 0
    for s in vo["sentences"]:
        i = text.index(s, pos)
        sent_starts.append(al["character_start_times_seconds"][i])
        pos = i + len(s)
    scene_starts = [0.0] + [max(0, st - 0.12) for st in sent_starts[1:]]
    ends = scene_starts[1:] + [total]
    words = words_with_times(text, al, spec.get("replace", {}))
    bg = gray_bg()
    boxes = [title_box(sc["title"]) for sc in spec["scenes"]]
    readers, stills = {}, {}
    for k, sc in enumerate(spec["scenes"]):
        if sc.get("video"):
            readers[k] = ClipReader(sc["video"], sc.get("start", 0), sc.get("zoom", 1.0), sc.get("anchor", "center"))
        elif sc.get("image"):
            stills[k] = still_media(sc["image"])
        elif sc.get("heatmap"):
            hm = heatmap(sc["heatmap"], MW - 80, MH - 80, None, gap=4, power=0.6, scale=1.2)
            stills[k] = still_media(hm, bg=(250, 250, 250))
    silent = out + ".silent.mp4"
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", silent],
        stdin=subprocess.PIPE)
    for fi in range(int(total * FPS)):
        t = fi / FPS
        k = max(i for i, s in enumerate(scene_starts) if s <= t)
        lt = t - scene_starts[k]
        dur = ends[k] - scene_starts[k]
        sc = spec["scenes"][k]
        frame = bg.copy()
        # מדיה עם זום איטי
        media = readers[k].frame() if k in readers else stills[k]
        z = 1.0 + 0.06 * (lt / max(dur, 0.1))
        if k == 0 and lt < 0.3:
            z += 0.12 * (1 - ease(lt / 0.3))
        mw, mh = int(MW * z), int(MH * z)
        m = media.resize((mw, mh), Image.BILINEAR).crop(((mw - MW) // 2, (mh - MH) // 2, (mw - MW) // 2 + MW, (mh - MH) // 2 + MH))
        if sc.get("tickers"):
            m = m.convert("RGBA")
            m.alpha_composite(ticker_cards(sc["tickers"], lt))
        frame.paste(m, (MX, MY))
        # פלאש קצר במעבר
        if k > 0 and lt < 0.12:
            fl = Image.new("RGBA", (W, H), (255, 255, 255, int(150 * (1 - lt / 0.12))))
            frame.alpha_composite(fl)
        box = boxes[k]
        kb = ease(lt / 0.25) if k > 0 else 1.0
        bx = (W - box.width) // 2
        frame.alpha_composite(box, (bx, int(BOX_Y - 20 + 30 * (1 - kb))))
        draw_caption(frame, words, t)
        pill(frame)
        proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    for r in readers.values():
        r.close()
    sfx = out + ".sfx.wav"
    make_sfx(sfx, scene_starts[1:], total)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", spec["vo_mp3"], "-i", sfx,
                    "-filter_complex", "[1:a]apad,volume=1.0[v];[2:a]volume=0.6[s];[v][s]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-shortest", "-movflags", "+faststart", out], check=True)
    os.remove(silent)
    return total


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    print(render(spec, sys.argv[2]))
