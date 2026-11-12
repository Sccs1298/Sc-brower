"""קרוסלות (כמה שקפים בפוסט) – הפורמט עם המעורבות הגבוהה ביותר באינסטגרם.

מבנה: שער (כותרת חזקה + "החליקו") → שקפי תוכן ממוספרים → שקף סיום עם קריאה לפעולה.
מילה בין *כוכביות* בכותרת מודגשת בצבע המותג.
"""
from PIL import Image, ImageDraw

from config import PAGE_HANDLE
from render import (ACCENT, BG_TOP, CARD, H, MUTED, PAD, TEXT, W, _background, _clean,
                    _font, _text_w)
from bidi.algorithm import get_display


def _wrap_tokens(draw, text, font, max_w):
    """שבירת שורות ששומרת סימון *הדגשה*. מחזיר שורות לוגיות (רשימת (מילה, מודגש))."""
    tokens, hl = [], False
    for raw in _clean(text).replace("\n", " ").split(" "):
        if not raw:
            continue
        core = raw.rstrip("?!.,:")
        starts, ends = raw.startswith("*"), core.endswith("*") and len(core) > 1
        word = raw.replace("*", "")
        if starts:
            hl = True
        tokens.append((word, hl))
        if ends:
            hl = False
    lines, cur = [], []
    for tok in tokens:
        trial = cur + [tok]
        if not cur or _text_w(draw, get_display(" ".join(w for w, _ in trial)), font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = [tok]
    if cur:
        lines.append(cur)
    return lines


def _draw_line(draw, y, words, font, color=TEXT, hl_color=ACCENT, right=W - PAD):
    """מצייר שורה RTL: מילים רצופות באותו סגנון מקובצות ל"ריצה" אחת,
    כך ש-bidi מסדר נכון גם ביטויים באנגלית ומספרים."""
    runs = []
    for word, hl in words:
        if runs and runs[-1][1] == hl:
            runs[-1][0].append(word)
        else:
            runs.append(([word], hl))
    space = _text_w(draw, " ", font)
    x = right
    for ws, hl in runs:
        disp = get_display(" ".join(ws).replace("\u00a0", " "))
        w = _text_w(draw, disp, font)
        x -= w
        if hl:
            draw.rounded_rectangle([x - 10, y + 8, x + w + 10, y + font.size * 1.2], radius=10, fill=hl_color)
            draw.text((x, y), disp, font=font, fill=BG_TOP)
        else:
            draw.text((x, y), disp, font=font, fill=color)
        x -= space


def _block(draw, y, text, font, max_w=W - 2 * PAD, line_h=None, color=TEXT, max_lines=8):
    line_h = line_h or int(font.size * 1.35)
    for words in _wrap_tokens(draw, text, font, max_w)[:max_lines]:
        _draw_line(draw, y, words, font, color)
        y += line_h
    return y


def _brand(draw, idx, total):
    f = _font(700, 30)
    draw.text((PAD, H - 95), PAGE_HANDLE, font=f, fill=MUTED)
    # נקודות התקדמות
    r, gap = 7, 26
    x0 = W - PAD - (total - 1) * gap
    for i in range(total):
        cx = x0 + i * gap
        draw.ellipse([cx - r, H - 78 - r, cx + r, H - 78 + r], fill=ACCENT if i == idx else CARD)


def _tag(draw, label):
    f = _font(700, 32)
    disp = get_display(label)
    tw = _text_w(draw, disp, f)
    draw.rounded_rectangle([W - PAD - tw - 40, PAD - 10, W - PAD, PAD + 48], radius=28, fill=ACCENT)
    draw.text((W - PAD - tw - 20, PAD - 4), disp, font=f, fill=BG_TOP)


def cover(post, total):
    img, draw = _background()
    _tag(draw, post["tag"])
    lines = _wrap_tokens(draw, post["title"], _font(900, 96), W - 2 * PAD)
    y = (H - len(lines) * 135) / 2 - 60
    for words in lines:
        _draw_line(draw, y, words, _font(900, 96))
        y += 128
    if post.get("subtitle"):
        y = _block(draw, y + 30, post["subtitle"], _font(400, 44), color=MUTED)
    # "החליקו" בתחתית
    f = _font(700, 38)
    t = get_display("החליקו")
    tw = _text_w(draw, t, f)
    x = PAD
    draw.text((x + 70, H - 200), t, font=f, fill=ACCENT)
    ay = H - 200 + 26
    draw.polygon([(x, ay), (x + 40, ay - 20), (x + 40, ay + 20)], fill=ACCENT)
    draw.rectangle([x + 38, ay - 6, x + 60, ay + 6], fill=ACCENT)
    _brand(draw, 0, total)
    return img


def content_slide(slide, num, idx, total):
    img, draw = _background()
    # מספר גדול
    nf = _font(900, 150)
    n = f"{num:02d}" if num is not None else ""
    tl = len(_wrap_tokens(draw, slide["title"], _font(900, 72), W - 2 * PAD))
    bl = min(8, len(_wrap_tokens(draw, slide["body"], _font(400, 52), W - 2 * PAD)))
    nl = len(_wrap_tokens(draw, slide.get("note", ""), _font(700, 40), W - 2 * PAD - 60)) if slide.get("note") else 0
    block_h = 190 + tl * 92 + 70 + bl * 76 + (90 + 56 * nl if nl else 0)
    top = max(PAD - 20, (H - 130 - block_h) / 2)
    if n:
        draw.text((W - PAD - _text_w(draw, n, nf), top), n, font=nf, fill=ACCENT)
    y = top + 210
    y = _block(draw, y, slide["title"], _font(900, 72), line_h=92)
    draw.rectangle([W - PAD - 120, y + 20, W - PAD, y + 28], fill=ACCENT)
    y += 70
    y = _block(draw, y, slide["body"], _font(400, 52), line_h=76, max_lines=8)
    if slide.get("note"):
        nf2 = _font(700, 40)
        lines = _wrap_tokens(draw, slide["note"], nf2, W - 2 * PAD - 60)
        box_h = 50 + 56 * len(lines)
        top = y + 40
        draw.rounded_rectangle([PAD, top, W - PAD, top + box_h], radius=26, fill=CARD)
        draw.rectangle([W - PAD - 10, top + 20, W - PAD, top + box_h - 20], fill=ACCENT)
        ty = top + 25
        for words in lines:
            _draw_line(draw, ty, words, nf2, right=W - PAD - 40)
            ty += 56
    _brand(draw, idx, total)
    return img


def cta(post, total):
    img, draw = _background()
    y = 300
    y = _block(draw, y, post.get("cta_title", "אהבתם? *שמרו* את הפוסט"), _font(900, 84), line_h=110)
    y += 50
    for icon, text in (("1", "שמרו לפעם הבאה"), ("2", "שלחו לחבר שנכנס לקריפטו"), ("3", f"עקבו אחרי {PAGE_HANDLE}")):
        draw.rounded_rectangle([PAD, y, W - PAD, y + 110], radius=26, fill=CARD)
        cf = _font(900, 44)
        cx, cy = W - PAD - 60, y + 55
        draw.ellipse([cx - 32, cy - 32, cx + 32, cy + 32], fill=ACCENT)
        draw.text((cx - _text_w(draw, icon, cf) / 2, cy - 33), icon, font=cf, fill=BG_TOP)
        t = get_display(text)
        tf = _font(700, 44)
        draw.text((W - PAD - 120 - _text_w(draw, t, tf), y + 26), t, font=tf, fill=TEXT)
        y += 135
    y += 30
    _block(draw, y, "התוכן אינו מהווה ייעוץ השקעות.", _font(400, 32), color=MUTED)
    _brand(draw, total - 1, total)
    return img


def render_carousel(post, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    total = len(post["slides"]) + 2
    images = [cover(post, total)]
    for i, s in enumerate(post["slides"], 1):
        images.append(content_slide(s, i if post.get("numbered", True) else None, i, total))
    images.append(cta(post, total))
    paths = []
    for i, im in enumerate(images, 1):
        p = out_dir / f"{i:02d}.png"
        im.save(p, "PNG", optimize=True)
        paths.append(p)
    return paths
