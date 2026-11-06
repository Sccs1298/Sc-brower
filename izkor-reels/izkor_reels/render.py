"""Render a 9:16 Instagram Reel commemorating one fallen soldier.

Design principles
  * Quiet and dignified: dark background, gold accent, slow motion only.
  * Official photo only (never AI generated or altered beyond scaling).
  * Only verified text from the Izkor record.
"""
from __future__ import annotations

import math
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

if not features.check("raqm"):  # without raqm Hebrew renders reversed - never publish that
    raise RuntimeError("Pillow is missing libraqm (RTL text shaping). Install libraqm0.")

from .izkor import Fallen
from .quotes import Excerpt

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
AUDIO = ROOT / "assets" / "audio" / "ambient.mp3"

W, H, FPS = 1080, 1920, 30

# palette
BG_TOP = np.array([10, 13, 20], np.float32)
BG_BOTTOM = np.array([4, 5, 9], np.float32)
GOLD = (201, 169, 110)
TEXT = (242, 237, 228)
MUTED = (168, 161, 150)


# ---------------------------------------------------------------- helpers
_font_cache: dict = {}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    key = (name, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(FONTS / f"{name}.ttf"), size,
                                              layout_engine=ImageFont.Layout.RAQM)
    return _font_cache[key]


def text_width(s: str, f: ImageFont.FreeTypeFont) -> float:
    return f.getlength(s, direction="rtl", language="he")


def wrap(s: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_width(trial, f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    # avoid a lonely last word
    if len(lines) >= 2 and len(lines[-1].split()) == 1 and len(lines[-2].split()) > 2:
        prev = lines[-2].split()
        lines[-2], lines[-1] = " ".join(prev[:-1]), f"{prev[-1]} {lines[-1]}"
    return lines


def balanced_wrap(s: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """Wrap into the fewest lines, then even out line widths (no orphans)."""
    n = len(_greedy(s, f, max_w))
    if n <= 1:
        return [s]
    lo, hi = int(max(text_width(w, f) for w in s.split())), max_w
    while lo < hi:
        mid = (lo + hi) // 2
        if len(_greedy(s, f, mid)) <= n:
            hi = mid
        else:
            lo = mid + 1
    return _greedy(s, f, lo)


def clause_wrap(s: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """Prefer line breaks after commas/periods (natural reading pauses)."""
    clauses = [c.strip() for c in re.split(r"(?<=[,.;:])\s+", s) if c.strip()]
    lines: list[str] = []
    for c in clauses:
        lines.extend(balanced_wrap(c, f, max_w))
    # merge short neighbours when they fit together
    merged: list[str] = []
    for l in lines:
        if merged and text_width(f"{merged[-1]} {l}", f) <= max_w * 0.8 and not merged[-1].endswith("."):
            merged[-1] = f"{merged[-1]} {l}"
        else:
            merged.append(l)
    best = balanced_wrap(s, f, max_w)
    return merged if len(merged) <= len(best) + 1 else best


HEB = "\u05d0-\u05ea"


def heb_typography(s: str) -> str:
    """Display-only: ASCII ' and " used as geresh/gershayim -> ׳ ״."""
    s = re.sub(rf'(?<=[{HEB}])"(?=[{HEB}])', "\u05f4", s)
    s = re.sub(rf"(?<=[{HEB}])'", "\u05f3", s)
    return s


def _greedy(s, f, max_w):
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_width(trial, f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def shift(items, dy: int):
    for spr, _ in items:
        spr.y += dy
    return items


def block_bounds(items):
    top = min(spr.y for spr, _ in items)
    bottom = max(spr.y + spr.a.shape[0] for spr, _ in items)
    return top, bottom


@dataclass
class Sprite:
    rgb: np.ndarray  # h,w,3 float32 (premultiplied)
    a: np.ndarray  # h,w,1 float32
    x: int
    y: int


def to_sprite(img: Image.Image, cx: int, cy: int) -> Sprite:
    arr = np.asarray(img.convert("RGBA"), np.float32) / 255.0
    a = arr[..., 3:4]
    return Sprite(arr[..., :3] * a, a, int(cx - img.width / 2), int(cy - img.height / 2))


def text_sprite(lines: list[str] | str, f: ImageFont.FreeTypeFont, fill, cx: int, top: int,
                line_h: float = 1.35, shadow: bool = True) -> tuple[Sprite, int]:
    if isinstance(lines, str):
        lines = [lines]
    lines = [heb_typography(l) for l in lines]
    lh = int(f.size * line_h)
    pad = int(f.size * 0.6)
    w = int(max(text_width(l, f) for l in lines)) + pad * 2
    h = lh * len(lines) + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        for i, l in enumerate(lines):
            d.text((w / 2, pad + lh * i + lh / 2 + 3), l, font=f, fill=(0, 0, 0, 170),
                   anchor="mm", direction="rtl", language="he")
        img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        d.text((w / 2, pad + lh * i + lh / 2), l, font=f, fill=fill + (255,),
               anchor="mm", direction="rtl", language="he")
    s = to_sprite(img, cx, 0)
    s.y = top - pad
    return s, top + lh * len(lines)


def blend(frame: np.ndarray, s: Sprite, alpha: float, dy: float = 0.0, scale_rgb: float = 1.0):
    if alpha <= 0.002:
        return
    y0 = s.y + int(round(dy))
    x0 = s.x
    h, w = s.a.shape[:2]
    fy0, fx0 = max(0, y0), max(0, x0)
    fy1, fx1 = min(H, y0 + h), min(W, x0 + w)
    if fy1 <= fy0 or fx1 <= fx0:
        return
    sy0, sx0 = fy0 - y0, fx0 - x0
    rgb = s.rgb[sy0:sy0 + fy1 - fy0, sx0:sx0 + fx1 - fx0]
    a = s.a[sy0:sy0 + fy1 - fy0, sx0:sx0 + fx1 - fx0] * alpha
    region = frame[fy0:fy1, fx0:fx1]
    region *= 1.0 - a
    region += rgb * (alpha * scale_rgb)


def ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def fade(t: float, start: float, end: float, fin: float = 1.2, fout: float = 1.0) -> float:
    """1 inside [start,end] with smooth fade in/out."""
    if t < start or t > end:
        return 0.0
    return min(ease((t - start) / fin) if fin else 1.0, ease((end - t) / fout) if fout else 1.0)


def hline(width: int, color=GOLD, thickness: int = 2) -> Image.Image:
    img = Image.new("RGBA", (width, thickness + 4), (0, 0, 0, 0))
    arr = np.zeros((thickness + 4, width, 4), np.uint8)
    xs = np.linspace(-1, 1, width)
    alpha = (np.clip(1 - np.abs(xs) ** 2.2, 0, 1) * 255).astype(np.uint8)
    arr[2:2 + thickness, :, :3] = color
    arr[2:2 + thickness, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


# ---------------------------------------------------------------- background
def make_background() -> np.ndarray:
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg = BG_TOP * (1 - y) + BG_BOTTOM * y
    bg = np.broadcast_to(bg, (H, W, 3)).copy()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.42) / H) ** 2)
    bg *= (1.25 - np.clip(r * 1.4, 0, 0.75))[..., None]  # vignette
    return bg / 255.0


def make_grain(n: int = 8, amp: float = 0.018) -> list[np.ndarray]:
    rng = np.random.default_rng(7)
    return [(rng.standard_normal((H, W, 1)).astype(np.float32) * amp) for _ in range(n)]


def radial_glow(radius: int) -> np.ndarray:
    yy, xx = np.mgrid[-radius:radius, -radius:radius].astype(np.float32)
    d = np.sqrt(xx ** 2 + yy ** 2) / radius
    g = np.clip(1 - d, 0, 1) ** 2.4
    return g[..., None]


# ---------------------------------------------------------------- candle
class Candle:
    def __init__(self, scale: float = 1.0):
        self.s = scale
        self.w, self.h = int(240 * scale), int(560 * scale)
        body = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(body)
        bw, bh = int(110 * scale), int(300 * scale)
        bx, by = (self.w - bw) // 2, self.h - bh
        # body with horizontal shading
        grad = np.zeros((bh, bw, 4), np.uint8)
        xs = np.linspace(-1, 1, bw)
        shade = 0.62 + 0.38 * np.cos(xs * 1.2)
        base = np.array([236, 226, 205])
        grad[..., :3] = (base[None, None, :] * shade[None, :, None]).clip(0, 255)
        ys = np.linspace(0, 1, bh)[:, None]
        grad[..., :3] = (grad[..., :3] * (1.0 - 0.25 * ys[..., None])).astype(np.uint8)
        grad[..., 3] = 255
        body_img = Image.fromarray(grad, "RGBA")
        mask = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, bw - 1, bh + 20], radius=int(10 * scale), fill=255)
        body.paste(body_img, (bx, by), mask)
        # top melt highlight
        d.ellipse([bx, by - 8 * scale, bx + bw, by + 14 * scale], fill=(246, 238, 222, 255))
        d.ellipse([bx + 10 * scale, by - 3 * scale, bx + bw - 10 * scale, by + 9 * scale], fill=(228, 214, 188, 255))
        # wick
        self.wick_x, self.wick_y = self.w / 2, by - 4 * scale
        d.line([self.wick_x, self.wick_y, self.wick_x + 2 * scale, self.wick_y - 18 * scale],
               fill=(40, 30, 25, 255), width=max(2, int(4 * scale)))
        self.body = body

    def flame(self, t: float) -> Image.Image:
        s = self.s
        flick = (0.06 * math.sin(t * 7.3) + 0.04 * math.sin(t * 13.1 + 1.3)
                 + 0.03 * math.sin(t * 23.7 + 0.4))
        sway = 3.0 * s * (math.sin(t * 2.1) + 0.5 * math.sin(t * 5.3 + 2))
        fh = 120 * s * (1 + flick)
        fw = 30 * s * (1 - flick * 0.5)
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        base_x, base_y = self.wick_x, self.wick_y - 6 * s

        def tear(width, height, color, blur):
            layer = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
            pts = []
            for i in range(60):
                a = i / 59 * 2 * math.pi
                # teardrop: round bottom, pointy top
                yv = -math.cos(a)
                xv = math.sin(a) * ((1 - yv) / 2) ** 0.9
                px = base_x + xv * width + sway * (1 + yv) / 2
                py = base_y - (yv + 1) / 2 * height
                pts.append((px, py))
            ImageDraw.Draw(layer).polygon(pts, fill=color)
            return layer.filter(ImageFilter.GaussianBlur(blur))

        img = Image.alpha_composite(img, tear(fw * 1.25, fh * 1.08, (255, 140, 40, 200), 7 * s))
        img = Image.alpha_composite(img, tear(fw, fh, (255, 196, 90, 235), 4 * s))
        img = Image.alpha_composite(img, tear(fw * 0.55, fh * 0.62, (255, 246, 214, 255), 3 * s))
        img = Image.alpha_composite(img, tear(fw * 0.4, fh * 0.18, (120, 150, 255, 120), 2 * s))
        return img

    def intensity(self, t: float) -> float:
        return 0.85 + 0.08 * math.sin(t * 7.3) + 0.05 * math.sin(t * 13.1 + 1.3)

    def draw(self, frame: np.ndarray, cx: int, bottom: int, t: float, alpha: float, glow: np.ndarray):
        if alpha <= 0.002:
            return
        x0, y0 = int(cx - self.w / 2), int(bottom - self.h)
        # warm additive glow centred on the flame
        r = glow.shape[0] // 2
        gx, gy = int(x0 + self.wick_x), int(y0 + self.wick_y - 50 * self.s)
        fy0, fy1 = max(0, gy - r), min(H, gy + r)
        fx0, fx1 = max(0, gx - r), min(W, gx + r)
        g = glow[fy0 - (gy - r):fy1 - (gy - r), fx0 - (gx - r):fx1 - (gx - r)]
        frame[fy0:fy1, fx0:fx1] += g * np.array([0.30, 0.17, 0.06], np.float32) * self.intensity(t) * alpha
        spr = to_sprite(Image.alpha_composite(self.body, self.flame(t)), 0, 0)
        spr.x, spr.y = x0, y0
        blend(frame, spr, alpha)


# ---------------------------------------------------------------- portrait
class Portrait:
    def __init__(self, photo: Path | None, card_w: int = 660, card_h: int = 880, cy: int = 730):
        self.cw, self.ch, self.cy = card_w, card_h, cy
        self.cx = W // 2
        self.photo = None
        if photo and photo.exists():
            im = Image.open(photo).convert("RGB")
            # cover-fit to card aspect, upscale x2 for smooth slow zoom
            target = card_w / card_h
            if im.width / im.height > target:
                nw = int(im.height * target)
                im = im.crop(((im.width - nw) // 2, 0, (im.width - nw) // 2 + nw, im.height))
            else:
                nh = int(im.width / target)
                im = im.crop((0, 0, im.width, nh))  # keep top (face)
            im = im.resize((card_w * 2, card_h * 2), Image.LANCZOS)
            # gentle inner vignette so the light studio backdrop sits in the dark scene
            arr = np.asarray(im, np.float32)
            yy, xx = np.mgrid[0:im.height, 0:im.width].astype(np.float32)
            d = np.sqrt(((xx / im.width - 0.5) * 1.6) ** 2 + ((yy / im.height - 0.42) * 1.25) ** 2)
            v = 1.0 - 0.32 * np.clip((d - 0.38) / 0.62, 0, 1) ** 1.6
            self.photo = Image.fromarray((arr * v[..., None]).clip(0, 255).astype(np.uint8))
        # frame + shadow sprite
        pad = 60
        fr = Image.new("RGBA", (card_w + pad * 2, card_h + pad * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(fr)
        d.rectangle([pad - 4, pad + 14, pad + card_w + 4, pad + card_h + 22], fill=(0, 0, 0, 200))
        fr = fr.filter(ImageFilter.GaussianBlur(22))
        d = ImageDraw.Draw(fr)
        d.rectangle([pad - 16, pad - 16, pad + card_w + 15, pad + card_h + 15], outline=GOLD + (230,), width=2)
        self.frame = to_sprite(fr, self.cx, cy)

    def draw(self, frame: np.ndarray, t: float, alpha: float, zoom_t: float):
        if alpha <= 0.002:
            return
        blend(frame, self.frame, alpha)
        if self.photo is None:
            return
        z = 1.0 + 0.07 * ease(zoom_t)
        pw, ph = self.photo.size
        cw, ch = pw / z, ph / z
        x0 = (pw - cw) / 2
        y0 = (ph - ch) * 0.35  # drift toward the face
        crop = self.photo.resize((self.cw, self.ch), Image.BICUBIC,
                                 box=(x0, y0, x0 + cw, y0 + ch))
        spr = to_sprite(crop, self.cx, self.cy)
        blend(frame, spr, alpha)


# ---------------------------------------------------------------- reel
def build_reel(f: Fallen, excerpt: Excerpt | None, photo: Path | None, out: Path,
               audio: Path | None = AUDIO) -> Path:
    fem = f.is_female
    blessing = "יהי זכרה ברוך" if fem else "יהי זכרו ברוך"
    story_word = "מתוך סיפור חייה" if fem else "מתוך סיפור חייו"

    # ---- timeline (seconds)
    S1 = (0.0, 10.5)   # portrait + name
    S2 = (10.0, 19.0)  # dates + family
    S3 = (18.5, 29.5) if excerpt else None  # verbatim excerpt
    end_start = (S3 or S2)[1] - 0.5
    S4 = (end_start, end_start + 8.0)  # candle + blessing
    total = S4[1]

    bg = make_background()
    grains = make_grain()
    glow_big = radial_glow(520)
    glow_small = radial_glow(300)
    portrait = Portrait(photo)
    candle_small = Candle(0.62)
    candle_big = Candle(1.0)

    # ---- S1 text
    s1 = []
    y = 1255
    if f.rank:
        spr, y = text_sprite(f.rank, font("Heebo-Light", 46), GOLD, W // 2, y)
        s1.append((spr, 1.6))
        y += 6
    name_font = font("FrankRuhlLibre-Bold", 104)
    name_lines = wrap(f.full_name, name_font, 900)
    if len(name_lines) > 1:
        name_font = font("FrankRuhlLibre-Bold", 84)
        name_lines = wrap(f.full_name, name_font, 920)
    spr, y = text_sprite(name_lines, name_font, TEXT, W // 2, y, line_h=1.2)
    s1.append((spr, 2.2))
    if f.unit_name:
        spr, y = text_sprite(f.unit_name, font("Heebo-Regular", 44), MUTED, W // 2, y + 14)
        s1.append((spr, 2.9))

    # ---- S2 text
    s2 = []
    y = 0
    spr, y = text_sprite(f.service_label, font("Heebo-Light", 46), MUTED, W // 2, y)
    s2.append((spr, 0.6))
    spr, y = text_sprite(f.jewish_death_date, font("FrankRuhlLibre-Medium", 92), TEXT, W // 2, y + 10)
    s2.append((spr, 1.1))
    spr, y = text_sprite(f.death_date_display, font("Heebo-Light", 60), GOLD, W // 2, y + 4)
    s2.append((spr, 1.6))
    s2.append((to_sprite(hline(420), W // 2, y + 46), 2.0))
    y += 90
    spr, y = text_sprite(f.fell_on_age_label, font("FrankRuhlLibre-Medium", 66), TEXT, W // 2, y)
    s2.append((spr, 2.4))
    if f.parents_label:
        spr, y = text_sprite(f.parents_label, font("Heebo-Regular", 50), TEXT, W // 2, y + 10)
        s2.append((spr, 2.9))
    if f.resting_place:
        rp = wrap(f"{'הובאה' if fem else 'הובא'} למנוחות ב{f.resting_place}", font("Heebo-Light", 38), 860)
        spr, y = text_sprite(rp, font("Heebo-Light", 38), MUTED, W // 2, y + 26)
        s2.append((spr, 3.4))
    top, bottom = block_bounds(s2)
    candle_gap = 90
    total_h = (bottom - top) + candle_gap + candle_small.h
    dy = int(H * 0.47 - total_h / 2) - top
    shift(s2, dy)
    s2_candle_bottom = bottom + dy + candle_gap + candle_small.h

    # ---- S3 text
    s3 = []
    if excerpt:
        s3.append((to_sprite(hline(160), W // 2, 0), 0.4))
        quoted = f'"{excerpt.text}"'
        qf, lines = None, None
        for size in (66, 60, 56):  # largest size where every clause fits on one line
            cand = font("FrankRuhlLibre-Medium", size)
            clauses = [c for c in re.split(r"(?<=[,.;:])\s+", quoted) if c.strip()]
            if len(clauses) <= 4 and all(text_width(c, cand) <= 920 for c in clauses):
                qf, lines = cand, clause_wrap(quoted, cand, 920)
                break
        if qf is None:
            qf = font("FrankRuhlLibre-Medium", 66)
            lines = clause_wrap(quoted, qf, 900)
            if len(lines) > 5:
                qf = font("FrankRuhlLibre-Medium", 54)
                lines = clause_wrap(quoted, qf, 920)
        y = 70
        for i, l in enumerate(lines):
            spr, y = text_sprite(l, qf, TEXT, W // 2, y, line_h=1.45)
            s3.append((spr, 1.0 + i * 0.55))
        delay = 1.0 + len(lines) * 0.55 + 0.4
        if excerpt.speaker:
            spr, y = text_sprite(f"— {excerpt.speaker}", font("Heebo-Regular", 44), GOLD, W // 2, y + 40)
            s3.append((spr, delay))
        spr, y = text_sprite(f"{story_word} באתר יזכור", font("Heebo-Light", 34), MUTED, W // 2, y + 18)
        s3.append((spr, delay + 0.5))
        s3.append((to_sprite(hline(160), W // 2, y + 60), delay + 0.5))
        top, bottom = block_bounds(s3)
        shift(s3, int(H * 0.45 - (top + bottom) / 2))

    # ---- S4 text
    s4 = []
    spr, y = text_sprite(blessing, font("FrankRuhlLibre-Bold", 96), TEXT, W // 2, 1180)
    s4.append((spr, 1.2))
    spr, y = text_sprite(f"{f.rank} {f.full_name}".strip(), font("Heebo-Regular", 46), GOLD, W // 2, y + 10)
    s4.append((spr, 1.8))
    credit = balanced_wrap("המידע והתמונה: יזכור – אתר ההנצחה לחללי מערכות ישראל, משרד הביטחון",
                  font("Heebo-Light", 30), 820)
    spr, _ = text_sprite(credit, font("Heebo-Light", 30), MUTED, W // 2, 1500)
    s4.append((spr, 2.6))

    def draw_texts(frame, items, t_local, scene_alpha):
        for spr, delay in items:
            k = ease((t_local - delay) / 1.0)
            if k > 0:
                blend(frame, spr, k * scene_alpha, dy=(1 - k) * 24)

    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if audio and Path(audio).exists():
        cmd += ["-i", str(audio), "-filter_complex",
                f"[1:a]atrim=0:{total},afade=t=in:st=0:d=2,afade=t=out:st={total - 3}:d=3,"
                f"aresample=48000[a]", "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-r", str(FPS), "-t", f"{total}", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    n = int(total * FPS)
    for i in range(n):
        t = i / FPS
        frame = bg.copy()

        a1 = fade(t, *S1, fin=1.8, fout=1.0)
        if a1:
            portrait.draw(frame, t, a1, (t - S1[0]) / (S1[1] - S1[0]))
            draw_texts(frame, s1, t - S1[0], a1)

        a2 = fade(t, *S2, fin=1.0, fout=1.0)
        if a2:
            candle_small.draw(frame, W // 2, s2_candle_bottom, t, a2, glow_small)
            draw_texts(frame, s2, t - S2[0], a2)

        if S3:
            a3 = fade(t, *S3, fin=1.0, fout=1.0)
            if a3:
                draw_texts(frame, s3, t - S3[0], a3)

        a4 = fade(t, *S4, fin=1.2, fout=1.6)
        if a4:
            candle_big.draw(frame, W // 2, 1080, t, a4, glow_big)
            draw_texts(frame, s4, t - S4[0], a4)

        frame += grains[i % len(grains)]
        np.clip(frame, 0, 1, out=frame)
        proc.stdin.write((frame * 255 + 0.5).astype(np.uint8).tobytes())

    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    return out

