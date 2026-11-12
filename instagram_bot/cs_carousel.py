"""קרוסלת חדשות בסגנון coinsauce (5 שקפים, 1080x1350).

שער: מפת חום אמיתית + נרות נופלים + פאנל אפור עם כותרת
מם · "השורה התחתונה" · מם · "הקריפטו היום:" (מפת חום בכרטיס)
"""
import io
import math
import os
import sys

import numpy as np
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1350
DARK = (18, 18, 20)
GRAY_TOP, GRAY_BOT = (206, 206, 208), (232, 232, 234)
FONT_DIR = os.environ.get("CS_FONTS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"))


def F(weight, size):
    """weight: 900 / 700 / 400 → Heebo"""
    path = os.path.join(FONT_DIR, f"Heebo-{weight}.ttf")
    if os.path.exists(path):
        return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)
    f = ImageFont.truetype(os.path.join(FONT_DIR, "Heebo-var.ttf"), size, layout_engine=ImageFont.Layout.BASIC)
    f.set_variation_by_name({900: "Black", 700: "Bold", 400: "Regular", 500: "Medium"}[weight])
    return f


_m = ImageDraw.Draw(Image.new("RGB", (4, 4)))


def tw(s, f):
    return _m.textlength(s, font=f)


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


def center_text(d, y, text, f, fill=DARK, maxw=W - 140, lh=None, bal=True):
    lines = balanced(text, f, maxw) if bal else wrap(text, f, maxw)
    lh = lh or int(f.size * 1.28)
    for line in lines:
        s = get_display(line)
        d.text(((W - tw(s, f)) / 2, y), s, font=f, fill=fill)
        y += lh
    return y


def gray_bg(seed=1):
    y = np.linspace(0, 1, H)[:, None]
    col = np.array(GRAY_TOP)[None, None, :] * (1 - y[..., None]) + np.array(GRAY_BOT)[None, None, :] * y[..., None]
    col = np.repeat(col, W, axis=1)
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((xx - W / 2) / 520) ** 2 + ((yy - H * 0.55) / 620) ** 2)) * 22
    col = col + glow[..., None]
    col += np.random.default_rng(seed).normal(0, 2.2, (H, W, 1))
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).convert("RGBA")


def pill(img, y=1255, text="CRYPTO ILS"):
    d = ImageDraw.Draw(img)
    f = F(900, 30)
    spacing = 2
    width = sum(tw(c, f) for c in text) + spacing * (len(text) - 1)
    pw, ph = width + 44, 52
    x0 = (W - pw) / 2
    d.rounded_rectangle([x0, y, x0 + pw, y + ph], radius=14, fill=(238, 238, 240))
    x = x0 + 22
    for c in text:
        d.text((x, y + 8), c, font=f, fill=(40, 40, 44))
        x += tw(c, f) + spacing


def label(img, y, text="CRYPTO ILS", size=30):
    d = ImageDraw.Draw(img)
    f = F(900, size)
    spacing = 2
    width = sum(tw(c, f) for c in text) + spacing * (len(text) - 1)
    x = (W - width) / 2
    for c in text:
        d.text((x, y), c, font=f, fill=(30, 30, 34))
        x += tw(c, f) + spacing


def cover_fit(im, w, h, fy=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    x, y = (im.width - w) // 2, int((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))


def placeholder(w, h, text):
    im = Image.new("RGB", (w, h), (120, 120, 128))
    d = ImageDraw.Draw(im)
    d.line([(0, 0), (w, h)], fill=(150, 150, 158), width=3)
    d.line([(0, h), (w, 0)], fill=(150, 150, 158), width=3)
    f = F(700, 40)
    d.text((20, 20), text, font=f, fill=(255, 255, 255))
    return im


def load(images, key, w=800, h=600):
    p = images.get(key)
    if p and os.path.exists(p):
        return Image.open(p).convert("RGB")
    return placeholder(w, h, key)


# ---------------- מפת חום ----------------

def squarify(values, x, y, w, h):
    """אלגוריתם squarified treemap. values ממוינים יורד. מחזיר [(x,y,w,h)]"""
    rects = []
    vals = list(values)
    total = sum(vals)
    vals = [v * w * h / total for v in vals]

    def worst(row, side):
        s = sum(row)
        return max(max(side * side * r / (s * s), (s * s) / (side * side * r)) for r in row)

    def layout(row, x, y, w, h):
        s = sum(row)
        out = []
        if w >= h:
            cw = s / h
            yy = y
            for r in row:
                ch = r / cw
                out.append((x, yy, cw, ch))
                yy += ch
            return out, (x + cw, y, w - cw, h)
        ch = s / w
        xx = x
        for r in row:
            cw = r / ch
            out.append((xx, y, cw, ch))
            xx += cw
        return out, (x, y + ch, w, h - ch)

    row = []
    while vals:
        side = min(w, h)
        v = vals[0]
        if not row or worst(row + [v], side) <= worst(row, side):
            row.append(v)
            vals.pop(0)
        else:
            out, (x, y, w, h) = layout(row, x, y, w, h)
            rects += out
            row = []
    if row:
        out, _ = layout(row, x, y, w, h)
        rects += out
    return rects


def cell_color(ch):
    if ch < 0:
        t = min(1, -ch / 9)
        a, b = np.array((236, 128, 140)), np.array((150, 24, 36))
    else:
        t = min(1, ch / 6)
        a, b = np.array((120, 200, 140)), np.array((22, 128, 60))
    return tuple(int(v) for v in a + (b - a) * t)


def heatmap(coins, w, h, logos=None, gap=3, power=0.62, scale=1.0):
    """coins: [[sym, mcap, change], ...]"""
    logos = logos or {}
    coins = sorted(coins, key=lambda c: -c[1])
    vals = [c[1] ** power for c in coins]
    rects = squarify(vals, 0, 0, w, h)
    img = Image.new("RGB", (w, h), (250, 250, 250))
    d = ImageDraw.Draw(img)
    for (sym, mc, ch), (x, y, cw, chh) in zip(coins, rects):
        d.rectangle([x + gap / 2, y + gap / 2, x + cw - gap / 2, y + chh - gap / 2], fill=cell_color(ch))
        m = min(cw, chh)
        if m < 34 * scale:
            continue
        fs = max(14, min(int(m * 0.2), int(64 * scale)))
        f1, f2 = F(900, fs), F(700, max(12, int(fs * 0.78)))
        pct = f"{ch:+.2f}%".replace("+", "+" if ch > 0 else "")
        cx, cy = x + cw / 2, y + chh / 2
        lg = logos.get(sym)
        ls = int(min(m * 0.32, 120 * scale))
        has_logo = lg is not None and m > 90 * scale
        block = (ls + 10 if has_logo else 0) + fs * 1.15 + f2.size * 1.2
        ty = cy - block / 2
        if has_logo:
            L = lg.resize((ls, ls), Image.LANCZOS)
            mask = Image.new("L", (ls, ls), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, ls - 1, ls - 1], fill=255)
            img.paste(L, (int(cx - ls / 2), int(ty)), mask)
            ty += ls + 10
        d.text((cx - tw(sym, f1) / 2, ty), sym, font=f1, fill=(255, 255, 255))
        d.text((cx - tw(pct, f2) / 2, ty + fs * 1.15), pct, font=f2, fill=(255, 255, 255))
    return img


# ---------------- נרות נופלים ----------------

def candles(w, h, seed=4):
    """קריסה דרמטית: 2 נרות ירוקים קטנים ואז אדומים שהולכים ומתארכים."""
    rnd = np.random.default_rng(seed)
    steps = [s * 1.3 for s in (-0.035, 0.02, -0.03, 0.07, 0.09, 0.06, 0.11, 0.08, 0.13)]
    n = len(steps)
    cw = w / (n * 1.42)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    price, pts = 0.14, []
    for i, st in enumerate(steps):
        o, c = price, price + st
        price = c
        x = i * cw * 1.42
        top, bot = min(o, c) * h, max(o, c) * h
        if bot - top < 14:
            bot = top + 14
        col = (36, 186, 74) if c < o else (228, 34, 42)
        pts.append((x, top, bot, top - 14 - 30 * rnd.random(), bot + 14 + 40 * rnd.random(), col))
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for x, top, bot, wt, wb, col in pts:
        sd.rectangle([x + 8, top + 12, x + cw + 12, bot + 16], fill=(0, 0, 0, 110))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    for x, top, bot, wt, wb, col in pts:
        d.rectangle([x + cw / 2 - 3, wt, x + cw / 2 + 3, wb], fill=col)
        d.rounded_rectangle([x, top, x + cw, bot], radius=4, fill=col)
        d.rectangle([x + 4, top + 4, x + cw * 0.3, bot - 4], fill=tuple(min(255, int(v * 1.2)) for v in col))
    return img


# ---------------- שקפים ----------------

def slide_cover(data, images, logos):
    img = gray_bg(1)
    hm = heatmap(data["coins"], W + 40, 980, logos, power=0.55, scale=1.35)
    img.paste(hm, (-20, -10))
    cd = candles(780, 960)
    img.alpha_composite(cd, (190, -40))
    fade = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(fade)
    a0, a1 = 690, 960
    for y in range(a0, H):
        fd.line([(0, y), (W, y)], fill=int(255 * min(1, ((y - a0) / (a1 - a0))) ** 1.4))
    bg = gray_bg(2)
    img.paste(bg, (0, 0), fade)
    d = ImageDraw.Draw(img)
    label(img, 985)
    y = center_text(d, 1030, data["cover_head"], F(900, 96), lh=110)
    center_text(d, y + 6, data["cover_sub"], F(400, 54), lh=66, maxw=W - 200)
    return img


def slide_meme(caption, meme, seed=3):
    img = gray_bg(seed)
    d = ImageDraw.Draw(img)
    mw = 860
    m = meme.copy()
    m = m.resize((mw, int(m.height * mw / m.width)), Image.LANCZOS)
    if m.height > 760:
        m = cover_fit(m, mw, 760)
    f = F(700, 62)
    cap_lines = balanced(caption, f, W - 160)
    block = len(cap_lines) * 78 + 50 + m.height
    y = (H - 120 - block) / 2 + 30
    y = center_text(d, y, caption, f, lh=78)
    img.paste(m, (int((W - m.width) / 2), int(y + 50)))
    pill(img)
    return img


def slide_sauce(data, photo):
    img = gray_bg(4)
    ph = cover_fit(photo, W, 620, 0.45)
    fade = Image.new("L", (W, 620), 0)
    fd = ImageDraw.Draw(fade)
    for y in range(620):
        fd.line([(0, y), (W, y)], fill=int(255 * min(1, y / 300) ** 1.5))
    img.paste(ph, (0, H - 620), fade)
    d = ImageDraw.Draw(img)
    y = center_text(d, 120, data["sauce_title"], F(900, 100), lh=120)
    y += 18
    for p in data["sauce"]:
        y = center_text(d, y, p, F(400, 39), maxw=900, lh=56, bal=False) + 30
    center_text(d, y - 6, data["sources"], F(400, 28), fill=(90, 90, 96))
    pill(img)
    return img


def slide_today(data, photo, logos):
    img = gray_bg(5)
    ph = cover_fit(photo, W, 760, 0.5).convert("L").convert("RGB")
    ph = Image.blend(ph, Image.new("RGB", ph.size, (225, 225, 227)), 0.62)
    fade = Image.new("L", (W, 760), 0)
    fd = ImageDraw.Draw(fade)
    for y in range(760):
        fd.line([(0, y), (W, y)], fill=int(255 * min(1, y / 260)))
    img.paste(ph, (0, H - 760), fade)
    d = ImageDraw.Draw(img)
    center_text(d, 205, data["today_title"], F(900, 84))
    cw, ch = 940, 640
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=38, fill=(255, 255, 255))
    hm = heatmap(data["coins"], cw - 56, ch - 76, logos, gap=3, power=0.62, scale=0.85)
    card.paste(hm, (28, 28))
    d2 = ImageDraw.Draw(card)
    note = get_display(data["today_note"])
    d2.text((cw - 28 - tw(note, F(400, 22)), ch - 40), note, font=F(400, 22), fill=(120, 120, 126))
    sh = Image.new("RGBA", (cw + 80, ch + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([40, 50, cw + 40, ch + 40], radius=38, fill=(0, 0, 0, 60))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(sh, (int((W - cw) / 2) - 40, 330 - 40))
    img.alpha_composite(card, (int((W - cw) / 2), 330))
    pill(img)
    return img


def build(data, images, logos, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    slides = [
        slide_cover(data, images, logos),
        slide_meme(data["meme1_caption"], load(images, "meme1")),
        slide_sauce(data, load(images, "photo_sauce", 1200, 800)),
        slide_meme(data["meme2_caption"], load(images, "meme2"), seed=6),
        slide_today(data, load(images, "photo_today", 1200, 800), logos),
    ]
    paths = []
    for i, s in enumerate(slides, 1):
        p = os.path.join(out_dir, f"{i}.jpg")
        s.convert("RGB").save(p, "JPEG", quality=93, optimize=True, progressive=True)
        paths.append(p)
    return paths


DATA = {
    "coins": [["BTC", 1518.5, -6.0], ["ETH", 271.9, -7.91], ["BNB", 90.6, -3.21], ["XRP", 75.2, -9.77], ["SOL", 52.9, -6.49],
              ["TRX", 30.2, -0.07], ["ZEC", 21.5, -3.96], ["HYPE", 18.5, -6.95], ["XMR", 11.6, -2.85], ["DOGE", 11.2, -6.07],
              ["LEO", 8.6, -0.01], ["LINK", 8.2, -6.83], ["ADA", 6.9, -6.97], ["XLM", 5.4, -7.89], ["BCH", 5.3, -7.07],
              ["NEAR", 4.8, -7.81], ["UNI", 4.3, -6.87], ["LTC", 4.1, -6.37], ["AVAX", 3.7, -5.51], ["SUI", 3.6, -6.71],
              ["HBAR", 3.0, -6.18], ["QNT", 2.8, -8.2], ["SHIB", 2.7, -2.88], ["TAO", 2.6, -6.01], ["CRO", 2.5, -5.08],
              ["ENA", 2.2, -8.52], ["OKB", 2.2, -5.96], ["PEPE", 2.1, 0.62], ["AAVE", 2.0, -1.59], ["ONDO", 1.8, -7.96]],
    "cover_head": "שוק הקריפטו",
    "cover_sub": "איבד כ-215 מיליארד דולר ביממה האחרונה",
    "meme1_caption": "\"זה רק תיקון בריא\"",
    "sauce_title": "השורה התחתונה",
    "sauce": [
        "שוק הקריפטו איבד כ-7.7% מהשווי שלו ביממה האחרונה, כ-215 מיליארד דולר, וביטקוין צנח מתחת ל-76 אלף דולר.",
        "הירידה התחילה בוול סטריט: הנאסד\"ק רשם את הירידה היומית החדה ביותר מזה 19 חודשים, על רקע מכירות כבדות במניות ה-AI והשבבים. בקריפטו חוסלו יותר ממיליארד דולר בפוזיציות ממונפות.",
    ],
    "sources": "מקורות: CoinGecko, Reuters, The Block",
    "meme2_caption": "משקיעי קריפטו מחכים שהשוק יחזור לעלות",
    "today_title": "הקריפטו היום:",
    "today_note": "שינוי ב-24 שעות · CoinGecko",
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "cs_out"
    imgs = {k: v for k, v in (a.split("=", 1) for a in sys.argv[2:])}
    print(build(DATA, imgs, {}, out))
