"""Pick a short excerpt from the official life story - verbatim only.

Rules:
  * The excerpt must appear character-for-character in the Izkor life story.
  * We never summarize, rephrase or generate text about the fallen.
  * A manual override (overrides/<legacy_id>.json) is allowed, but it is
    verified against the official text too; if it doesn't match, we refuse.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

FAMILY = ("אימו", "אמו", "אביו", "אחיו", "אחותו", "אשתו", "רעייתו", "בתו", "בנו",
          "אמה", "אביה", "אחיה", "אחותה", "בעלה", "בתה", "בנה", "סבתו", "סבו", "סבתה", "סבה")

MIN_LEN, MAX_LEN = 25, 120


@dataclass
class Excerpt:
    text: str
    speaker: str  # e.g. "אימו, אולגה" ; "" when not a direct quote

    def verify(self, life_story: str) -> None:
        if _norm(self.text.strip(".… ")) not in _norm(life_story):
            raise ValueError(f"Excerpt not found verbatim in official life story: {self.text!r}")
        if self.speaker and _norm(self.speaker) not in _norm(life_story):
            raise ValueError(f"Speaker not found in official life story: {self.speaker!r}")


def _norm(s: str) -> str:
    s = s.replace("״", '"').replace("“", '"').replace("”", '"').replace("״", '"')
    s = s.replace("׳", "'").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip()


def _sentences(q: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|(?<=\.\.\.)\s*", q)
    return [p.strip() for p in parts if p and p.strip()]


def _quotes_with_speaker(story: str):
    """Yield (speaker_phrase, quoted_text) for `X, Y, ספד/ה (לו): "...."`."""
    text = _norm(story)
    pat = re.compile(r'([^.\n"]{0,60}?)(?:ספד|ספדה|כתב|כתבה|סיפר|סיפרה|אמר|אמרה)(?: לו| לה)?:\s*"([^"]{10,2000})')
    for m in pat.finditer(text):
        yield m.group(1).strip(" ,"), m.group(2)


def auto_excerpt(story: str) -> Excerpt | None:
    best: tuple[int, Excerpt] | None = None
    for speaker, q in _quotes_with_speaker(story):
        is_family = any(speaker.startswith(w) or f" {w}" in f" {speaker}" for w in FAMILY)
        for i, sent in enumerate(_sentences(q)):
            sent = sent.strip()
            if not (MIN_LEN <= len(sent) <= MAX_LEN):
                continue
            score = (100 if is_family else 50) - i * 3 - abs(len(sent) - 70) // 10
            if best is None or score > best[0]:
                best = (score, Excerpt(sent, speaker))
    return best[1] if best else None


def get_excerpt(legacy_id: str, story: str, overrides_dir: Path) -> Excerpt | None:
    ov = overrides_dir / f"{legacy_id}.json"
    if ov.exists():
        d = json.loads(ov.read_text(encoding="utf-8"))
        if d.get("excerpt") is None:
            return None
        ex = Excerpt(d["excerpt"], d.get("speaker", ""))
    else:
        ex = auto_excerpt(story)
    if ex:
        ex.verify(story)
    return ex
