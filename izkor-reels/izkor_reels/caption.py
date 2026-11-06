"""Instagram caption built only from verified Izkor fields (verbatim)."""
from __future__ import annotations

import re
import urllib.parse

from .izkor import Fallen
from .quotes import Excerpt

MAX_STORY_CHARS = 700
HASHTAGS = "#יזכור #נזכור_את_כולם #לזכרם #חללי_מערכות_ישראל #יהי_זכרם_ברוך"


def _first_sentences(text: str, limit: int) -> str:
    para = text.strip().split("\n")[0].strip()
    if len(para) <= limit:
        return para
    out = ""
    for sent in re.split(r"(?<=\.)\s+", para):
        if len(out) + len(sent) + 1 > limit:
            break
        out = f"{out} {sent}".strip()
    return out


def build_caption(f: Fallen, excerpt: Excerpt | None) -> str:
    fem = f.is_female
    blessing = "יהי זכרה ברוך" if fem else "יהי זכרו ברוך"
    lines = [f"{f.rank} {f.full_name} ז\"ל".strip()]
    if f.unit_name:
        lines.append(f.unit_name)
    when = f"{f.service_label} {f.jewish_death_date} ({f.death_date_display})"
    lines.append(f"{when}. {f.fell_on_age_label}.".replace("..", "."))
    if f.parents_label:
        lines.append(f"{f.parents_label}.")
    if f.resting_place:
        lines.append(f"{'הובאה' if fem else 'הובא'} למנוחות ב{f.resting_place}.")
    story = _first_sentences(f.life_story, MAX_STORY_CHARS) if f.life_story else ""
    if story:
        lines += ["", story]
    if excerpt:
        lines += ["", f"\"{excerpt.text}\"" + (f" — {excerpt.speaker}" if excerpt.speaker else "")]
    lines += [
        "",
        f"{blessing} 🕯️",
        "",
        "המידע והתמונה: יזכור – אתר ההנצחה לחללי מערכות ישראל, משרד הביטחון",
        urllib.parse.unquote(f.page_url),
        "",
        HASHTAGS,
    ]
    cap = "\n".join(lines)
    return cap[:2200]
