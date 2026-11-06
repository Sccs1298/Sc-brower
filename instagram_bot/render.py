"""ציור תמונות הפוסט (1080x1350, יחס 4:5) עם תמיכה מלאה בעברית מימין לשמאל."""
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

from config import FONTS_DIR, PAGE_HANDLE

W, H = 1080, 1350
PAD = 80

BG_TOP = (11, 15, 26)
BG_BOTTOM = (24, 30, 52)
CARD = (32, 40, 66)
TEXT = (240, 243, 250)
MUTED = (150, 160, 185)
ACCENT = (247, 147, 26)  # כתום ביטקוין
GREEN = (34, 197, 94)
RED = (239, 68, 68)

# אימוג'ים לא קיימים בפונט – מסירים אותם מהטקסט שעל התמונה
_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def _font(weight, size):
    return ImageFont.truetype(str(FONTS_DIR / f"Heebo-{weight}.ttf"), size,
                              layout_engine=ImageFont.Layout.BASIC)


def _clean(text):
    return _EMOJI.sub("", text).strip()


def _rtl(text):
    return get_display(_clean(text))


def _text_w(draw, text, font):
    return draw.textlength(text, font=font)


def _wrap(draw, text, font, max_w):
    """שבירת שורות לפי רוחב (על הטקסט הלוגי), ואז היפוך כל שורה לתצוגה RTL."""
    words, lines, cur = _clean(text).split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if _text_w(draw, get_display(trial), font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return [get_display(l) for l in lines]


def _draw_rtl(draw, y, text, font, fill, right=W - PAD):
    disp = _rtl(text)
    draw.text((right - _text_w(draw, disp, font), y), disp, font=font, fill=fill)


def _background():
    img = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        c = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)
    # עיגול זוהר עדין בפינה
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(420, 0, -6):
        a = int(28 * (1 - r / 420))
        gd.ellipse([W - 260 - r, 120 - r, W - 260 + r, 120 + r], fill=(*ACCENT, a))
    img.paste(glow, (0, 0), glow)
    return img, ImageDraw.Draw(img)


def _header(draw, label):
    now = datetime.now(ZoneInfo("Asia/Jerusalem"))
    f = _font(700, 34)
    # תווית נושא בצד ימין
    disp = _rtl(label)
    tw = _text_w(draw, disp, f)
    draw.rounded_rectangle([W - PAD - tw - 40, PAD - 10, W - PAD, PAD + 50], radius=30, fill=ACCENT)
    draw.text((W - PAD - tw - 20, PAD - 3), disp, font=f, fill=BG_TOP)
    # תאריך בצד שמאל
    draw.text((PAD, PAD), now.strftime("%d.%m.%Y"), font=_font(400, 34), fill=MUTED)


def _footer(draw):
    f = _font(700, 34)
    draw.line([(PAD, H - 130), (W - PAD, H - 130)], fill=CARD, width=3)
    tw = _text_w(draw, PAGE_HANDLE, f)
    draw.text(((W - tw) / 2, H - 105), PAGE_HANDLE, font=f, fill=ACCENT)


def _fmt_price(p):
    if p >= 1000:
        return f"${p:,.0f}"
    if p >= 1:
        return f"${p:,.2f}"
    return f"${p:.4f}"


def render_market(snapshot, content, out_path):
    img, draw = _background()
    _header(draw, "עדכון שוק")

    y = 200
    for line in _wrap(draw, content["headline"], _font(900, 72), W - 2 * PAD)[:2]:
        f = _font(900, 72)
        draw.text((W - PAD - _text_w(draw, line, f), y), line, font=f, fill=TEXT)
        y += 90
    y += 40

    # טבלת מטבעות
    row_h = 104
    name_f, sym_f, price_f, chg_f = _font(700, 40), _font(400, 28), _font(700, 40), _font(700, 32)
    for c in snapshot["coins"][:6]:
        draw.rounded_rectangle([PAD, y, W - PAD, y + row_h - 16], radius=22, fill=CARD)
        cy = y + (row_h - 16) / 2
        # שם (ימין)
        name = _rtl(c["name"])
        draw.text((W - PAD - 30 - _text_w(draw, name, name_f), cy - 34), name, font=name_f, fill=TEXT)
        sym = c["symbol"]
        draw.text((W - PAD - 30 - _text_w(draw, sym, sym_f), cy + 10), sym, font=sym_f, fill=MUTED)
        # מחיר (מרכז)
        price = _fmt_price(c["price"])
        draw.text((W / 2 - _text_w(draw, price, price_f) / 2 - 30, cy - 26), price, font=price_f, fill=TEXT)
        # שינוי 24 שעות (שמאל)
        ch = c["change_24h"]
        col = GREEN if ch >= 0 else RED
        txt = f"{abs(ch):.2f}%"
        tw = _text_w(draw, txt, chg_f)
        x0 = PAD + 24
        draw.rounded_rectangle([x0, cy - 28, x0 + tw + 76, cy + 28], radius=18,
                               fill=tuple(int(v * 0.25) for v in col))
        tx, s = x0 + 22, 12  # משולש למעלה/למטה
        tri = [(tx, cy + s / 2), (tx + 2 * s, cy + s / 2), (tx + s, cy - s)] if ch >= 0 else \
              [(tx, cy - s / 2), (tx + 2 * s, cy - s / 2), (tx + s, cy + s)]
        draw.polygon(tri, fill=col)
        draw.text((tx + 2 * s + 12, cy - 22), txt, font=chg_f, fill=col)
        y += row_h

    # מדד פחד ותאוותנות
    fg = snapshot.get("fear_greed")
    if fg:
        y += 20
        _draw_rtl(draw, y, f"מדד פחד ותאוותנות: {fg['value']}", _font(700, 36), TEXT)
        y += 62
        bar_l, bar_r = PAD, W - PAD
        steps = 60
        for i in range(steps):
            t = i / (steps - 1)
            col = tuple(int(GREEN[k] + (RED[k] - GREEN[k]) * t) for k in range(3))  # ירוק משמאל, אדום מימין
            x0 = bar_l + (bar_r - bar_l) * i / steps
            draw.rectangle([x0, y, x0 + (bar_r - bar_l) / steps + 1, y + 18], fill=col)
        # בעברית: פחד בימין, תאוותנות בשמאל → מציירים מראה
        mx = bar_r - (bar_r - bar_l) * fg["value"] / 100
        draw.ellipse([mx - 18, y - 9, mx + 18, y + 27], fill=TEXT, outline=BG_TOP, width=4)
        lab = _font(400, 26)
        _draw_rtl(draw, y + 34, "פחד קיצוני", lab, MUTED)
        t = _rtl("תאוותנות קיצונית")
        draw.text((bar_l, y + 34), t, font=lab, fill=MUTED)
        y += 90

    # תובנה אחת מהטקסט של Claude (אם יש מקום)
    points = [p for p in content.get("points", []) if p.strip()]
    if points:
        pf = _font(400, 34)
        lines = _wrap(draw, points[0], pf, W - 2 * PAD)[:2]
        if y + 48 * len(lines) < H - 150:
            for line in lines:
                draw.text((W - PAD - _text_w(draw, line, pf), y), line, font=pf, fill=MUTED)
                y += 48

    _footer(draw)
    img.save(out_path, "PNG")
    return out_path


def render_education(content, out_path):
    img, draw = _background()
    _header(draw, "לומדים קריפטו")

    y = 220
    hf = _font(900, 80)
    for line in _wrap(draw, content["headline"], hf, W - 2 * PAD)[:3]:
        draw.text((W - PAD - _text_w(draw, line, hf), y), line, font=hf, fill=TEXT)
        y += 100
    y += 40

    pf = _font(400, 40)
    nf = _font(900, 40)
    points = [p for p in content.get("points", []) if p.strip()][:4]
    avail = H - 170 - y
    for i, p in enumerate(points, 1):
        lines = _wrap(draw, p, pf, W - 2 * PAD - 140)[:3]
        card_h = 40 + 54 * len(lines)
        if card_h > avail:
            break
        draw.rounded_rectangle([PAD, y, W - PAD, y + card_h], radius=24, fill=CARD)
        # עיגול מספר
        cx, cy = W - PAD - 55, y + card_h / 2
        draw.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], fill=ACCENT)
        n = str(i)
        draw.text((cx - _text_w(draw, n, nf) / 2, cy - 30), n, font=nf, fill=BG_TOP)
        ty = y + 20
        for line in lines:
            draw.text((W - PAD - 120 - _text_w(draw, line, pf), ty), line, font=pf, fill=TEXT)
            ty += 54
        y += card_h + 24
        avail = H - 170 - y

    _footer(draw)
    img.save(out_path, "PNG")
    return out_path
