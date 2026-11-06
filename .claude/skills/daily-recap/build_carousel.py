"""בונה קרוסלת 5 שקפים מ-content.json + market.json, ומוריד לבד ממים ותמונות מורשות.

    python .claude/skills/daily-recap/build_carousel.py WORK_DIR

WORK_DIR/content.json:
{
  "cover_head": "שוק הקריפטו",                      # שורה עבה קצרה (נושא)
  "cover_sub": "איבד כ-175 מיליארד דולר ביממה",      # המספר/הפרט המפתיע
  "meme1": "This Is Fine",  "meme1_caption": "\"זה רק תיקון בריא\"",
  "sauce_title": "השורה התחתונה",
  "sauce": ["פסקה 1 ...", "פסקה 2 ..."],             # עובדות מאומתות בלבד
  "sources": "מקורות: CoinGecko, Reuters",
  "meme2": "Sad Pablo Escobar", "meme2_caption": "...",
  "today_title": "הקריפטו היום:", "today_note": "שינוי ב-24 שעות · CoinGecko",
  "photo_sauce": "wall street sign",                 # חיפוש תמונה חופשית (CC0/PD)
  "photo_today": "new york stock exchange",
  "caption": "כיתוב הפוסט המלא"
}
פלט: WORK_DIR/carousel/1..5.jpg + caption.txt + sheet.jpg (תצוגה מקדימה לבדיקה)
"""
import json
import os
import sys
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "instagram_bot"))
import cs_carousel  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 crypto-ils-daily-recap/1.0"}


def fetch(url, path):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r, open(path, "wb") as f:
        f.write(r.read())
    Image.open(path).verify()
    return path


def meme(name_or_url, path):
    if name_or_url.startswith("http"):
        return fetch(name_or_url, path)
    memes = json.load(urllib.request.urlopen(urllib.request.Request("https://api.imgflip.com/get_memes", headers=UA), timeout=30))["data"]["memes"]
    hit = next((m for m in memes if m["name"].lower() == name_or_url.lower()), None) or \
        next((m for m in memes if name_or_url.lower() in m["name"].lower()), None)
    if not hit:
        raise SystemExit(f"meme not found on imgflip: {name_or_url}")
    return fetch(hit["url"], path)


def free_photo(query, path, min_w=1000):
    """Openverse, רק CC0 / Public Domain, ממקורות שלא חוסמים הורדה."""
    q = urllib.parse.urlencode({"q": query, "license": "cc0,pdm", "page_size": 20, "source": "rawpixel,stocksnap,wikimedia"})
    res = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openverse.org/v1/images/?" + q, headers=UA), timeout=30))["results"]
    for r in res:
        if (r.get("width") or 0) < min_w or r["url"].lower().endswith((".svg", ".gif", ".tif", ".tiff")):
            continue
        try:
            fetch(r["url"], path)
            print(f"photo [{query}] -> {r.get('title','')[:60]} ({r['license']}, {r.get('source')})")
            return path
        except Exception:  # noqa: BLE001
            continue
    raise SystemExit(f"no free photo for: {query}")


def main(work):
    c = json.load(open(os.path.join(work, "content.json"), encoding="utf-8"))
    mk = json.load(open(os.path.join(work, "market.json"), encoding="utf-8"))
    a = os.path.join(work, "assets")
    os.makedirs(a, exist_ok=True)
    images = {
        "meme1": meme(c["meme1"], os.path.join(a, "meme1.jpg")),
        "meme2": meme(c["meme2"], os.path.join(a, "meme2.jpg")),
        "photo_sauce": free_photo(c["photo_sauce"], os.path.join(a, "photo_sauce.jpg")),
        "photo_today": free_photo(c["photo_today"], os.path.join(a, "photo_today.jpg")),
    }
    data = dict(c)
    data["coins"] = [[s, mc, ch] for s, mc, ch, _ in mk["coins"]]
    out = os.path.join(work, "carousel")
    paths = cs_carousel.build(data, images, {}, out)
    open(os.path.join(out, "caption.txt"), "w", encoding="utf-8").write(c["caption"])
    ims = [Image.open(p).resize((432, 540)) for p in paths]
    sheet = Image.new("RGB", (len(ims) * 442, 540), "white")
    for i, im in enumerate(ims):
        sheet.paste(im, (i * 442, 0))
    sheet.save(os.path.join(work, "sheet.jpg"), quality=85)
    print("\n".join(paths))


if __name__ == "__main__":
    main(sys.argv[1])
