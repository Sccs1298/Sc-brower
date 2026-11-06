"""כרטיס חדשות בסגנון coinsauce: תמונה למעלה שנמסה לפאנל בהיר, לוגו קטן, כותרת חזקה ושורת פרטים.

    from news_card import render_news_card
    render_news_card(Image.open("photo.jpg"), "כותרת", "פרטים...", "out.jpg")
"""
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from config import FONTS_DIR

W, H, PHOTO_H = 1080, 1350, 960
PANEL, DARK, GRAY, ORANGE = (244, 243, 240), (17, 17, 17), (70, 70, 72), (247, 147, 26)
LOGO = "CRYPTO ILS"


def _font(weight, size):
    # BASIC: אנחנו מסדרים RTL בעצמנו עם bidi; RAQM היה הופך שוב
    return ImageFont.truetype(str(FONTS_DIR / f"Heebo-{weight}.ttf"), size,
                              layout_engine=ImageFont.Layout.BASIC)


def _wrap(d, text, font, maxw):
    lines, cur = [], ""
    for w in text.split(" "):
        t = f"{cur} {w}".strip()
        if d.textlength(get_display(t), font=font) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def _balanced(d, text, font, maxw):
    """אותו מספר שורות, אבל רוחב מאוזן – בלי מילה יתומה בשורה האחרונה."""
    n = len(_wrap(d, text, font, maxw))
    if n == 1:
        return [text]
    lo, hi = 100, maxw
    while hi - lo > 4:
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if len(_wrap(d, text, font, mid)) <= n else (mid, hi)
    return _wrap(d, text, font, hi)


def _cover(im, w, h, fy=0.5):
    s = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    x, y = (im.width - w) // 2, int((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))


def render_news_card(photo, head, detail, out, fy=0.5, tint=None, blur=0):
    img = Image.new("RGB", (W, H), PANEL)
    ph = _cover(photo.convert("RGB"), W, PHOTO_H, fy)
    if blur:  # לטשטש טקסט קריא בתמונה (למשל גרפים ישנים)
        ph = ph.filter(ImageFilter.GaussianBlur(blur))
    if tint:
        ph = Image.blend(ph, Image.new("RGB", ph.size, tint), 0.18)
    img.paste(ph, (0, 0))
    fade = Image.new("L", (W, PHOTO_H), 0)
    fd, start = ImageDraw.Draw(fade), PHOTO_H - 300
    for y in range(start, PHOTO_H):
        fd.line([(0, y), (W, y)], fill=int(255 * ((y - start) / 300) ** 1.6))
    img.paste(Image.new("RGB", (W, PHOTO_H), PANEL), (0, 0), fade)

    d = ImageDraw.Draw(img)
    hf, df, lf = _font(900, 76), _font(400, 42), _font(700, 30)
    hl, dl = _balanced(d, head, hf, W - 120), _balanced(d, detail, df, W - 150)
    y = H - 70 - (48 + len(hl) * 92 + 18 + len(dl) * 58)

    x = (W - d.textlength(LOGO, font=lf) - (len(LOGO) - 1) * 4 - 26) / 2
    d.ellipse([x, y + 8, x + 18, y + 26], fill=ORANGE)
    x += 28
    for ch in LOGO:
        d.text((x, y), ch, font=lf, fill=DARK)
        x += d.textlength(ch, font=lf) + 4
    y += 56
    for lines, font, color, step, gap in ((hl, hf, DARK, 92, 18), (dl, df, GRAY, 58, 0)):
        for line in lines:
            s = get_display(line)
            d.text(((W - d.textlength(s, font=font)) / 2, y), s, font=font, fill=color)
            y += step
        y += gap
    img.save(out, "JPEG", quality=92, optimize=True, progressive=True)
    return out
