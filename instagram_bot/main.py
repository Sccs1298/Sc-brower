"""הבוט של עמוד הקריפטו: נתונים → תוכן (Claude) → תמונה → אינסטגרם.

שימוש:
    python main.py --type auto              # בוקר: עדכון שוק, ערב: פוסט לימודי
    python main.py --type market --dry-run  # רק יוצר תמונה וכיתוב, בלי לפרסם
    python main.py --type education --dry-run --sample  # בלי אינטרנט, נתוני דוגמה
"""
import argparse
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from config import HISTORY_FILE, POSTS_DIR
import content as content_mod
import market
import render


def load_history():
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    return {"posts": []}


def save_history(history):
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", choices=["auto", "market", "education"], default="auto")
    ap.add_argument("--dry-run", action="store_true", help="לא לפרסם לאינסטגרם")
    ap.add_argument("--sample", action="store_true", help="נתוני שוק לדוגמה (בלי אינטרנט)")
    args = ap.parse_args()

    now = datetime.now(ZoneInfo("Asia/Jerusalem"))
    post_type = args.type
    if post_type == "auto":
        post_type = "market" if now.hour < 14 else "education"

    history = load_history()
    out_dir = POSTS_DIR / f"{now:%Y-%m-%d_%H%M}_{post_type}"
    out_dir.mkdir(parents=True, exist_ok=True)
    image_path = out_dir / "image.png"

    if post_type == "market":
        snapshot = market.sample_snapshot() if args.sample else market.fetch_market_snapshot()
        post = content_mod.generate_market_post(snapshot)
        render.render_market(snapshot, post, image_path)
        topic = None
    else:
        used = [p["topic"] for p in history["posts"] if p.get("topic")]
        topic = content_mod.pick_topic(used)
        post = content_mod.generate_education_post(topic)
        render.render_education(post, image_path)

    caption = content_mod.build_caption(post)
    record = {"time": now.isoformat(), "type": post_type, "topic": topic,
              "content": post, "caption": caption, "image": str(image_path.name)}
    (out_dir / "post.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ Image: {image_path}\n\n{caption}\n")

    if args.dry_run:
        print("[dry-run] not publishing")
        return 0

    from instagram import host_image, publish_image
    url = host_image(image_path)
    print(f"[instagram] image hosted at {url}")
    media_id = publish_image(url, caption)
    print(f"[instagram] published! media id = {media_id}")

    record["media_id"] = media_id
    history["posts"].append({k: record[k] for k in ("time", "type", "topic", "media_id")})
    save_history(history)
    return 0


if __name__ == "__main__":
    sys.exit(main())
