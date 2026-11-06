"""Daily run: take the most recent fallen not yet commemorated, render, publish.

Order: from the latest fallen back to the first, following the official
Izkor ordering. Fallen newly added to Izkor are picked up first on the next run.

Usage:
  python -m izkor_reels.main               # render + publish next one
  python -m izkor_reels.main --dry-run     # render only, don't publish or record
  python -m izkor_reels.main --legacy-id 520128 --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from . import izkor, render
from .caption import build_caption
from .quotes import get_excerpt

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state" / "published.json"
SKIPPED = ROOT / "state" / "skipped.json"
OVERRIDES = ROOT / "overrides"
OUT = ROOT / "output"


def load(p: Path) -> list:
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def save(p: Path, data: list):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def next_candidate(done: set[str], legacy_id: str | None):
    for row in izkor.iter_latest():
        lid = str(row["legacy_id"])
        if legacy_id and lid != legacy_id:
            continue
        if not legacy_id and lid in done:
            continue
        return row
    return None


def run(dry_run: bool, legacy_id: str | None) -> int:
    published = load(STATE)
    skipped = load(SKIPPED)
    done = {p["legacy_id"] for p in published} | {s["legacy_id"] for s in skipped}

    row = next_candidate(done, legacy_id)
    if not row:
        print("Nothing left to publish.")
        return 0

    f = izkor.fetch_person(row)
    print(f"Next: {f.rank} {f.full_name} ({f.death_date_display}) legacy_id={f.legacy_id}")

    # Minimal data integrity: we never publish an incomplete record.
    missing = [k for k in ("full_name", "death_date", "jewish_death_date") if not getattr(f, k)]
    if missing:
        print(f"Record incomplete ({missing}); skipping and recording for manual review.")
        if not dry_run:
            skipped.append({"legacy_id": f.legacy_id, "name": f.full_name, "reason": f"missing {missing}"})
            save(SKIPPED, skipped)
        return 0

    work = OUT / f.legacy_id
    work.mkdir(parents=True, exist_ok=True)
    excerpt = get_excerpt(f.legacy_id, f.life_story, OVERRIDES)
    photo = izkor.download_image(f, work / "photo.jpg")
    video = render.build_reel(f, excerpt, photo, work / "reel.mp4")
    caption = build_caption(f, excerpt)
    (work / "caption.txt").write_text(caption, encoding="utf-8")
    print(f"Rendered {video}")

    if dry_run:
        print("--- caption ---\n" + caption)
        return 0

    from .instagram import publish_reel
    media_id = publish_reel(video, caption)
    published.append({
        "legacy_id": f.legacy_id,
        "name": f"{f.rank} {f.full_name}".strip(),
        "death_date": f.death_date_display,
        "ig_media_id": media_id,
        "published_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    })
    save(STATE, published)
    print(f"Published media {media_id}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--legacy-id")
    a = ap.parse_args(argv)
    return run(a.dry_run, a.legacy_id)


if __name__ == "__main__":
    sys.exit(main())
