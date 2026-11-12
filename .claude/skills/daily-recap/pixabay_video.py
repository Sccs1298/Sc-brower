"""מוריד קליפ וידאו מורשה מ-Pixabay (Pixabay Content License: מסחרי מותר, בלי קרדיט חובה).

    python .claude/skills/daily-recap/pixabay_video.py "stock market decline" OUT.mp4 [--portrait] [--n 1]

המפתח: משתנה סביבה PIXABAY_API_KEY (לא בריפו!). אם חסר – עוצר ומדווח.
לכל קליפ נשמר OUT.json עם id, קישור לעמוד, יוצר ותגיות – תיעוד רישוי.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "crypto-ils-daily-recap/1.0"}


def search(q, portrait=False, n=10):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        raise SystemExit("PIXABAY_API_KEY חסר – יש להוסיף אותו במשתני הסביבה (Edit environment).")
    url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode(
        {"key": key, "q": q, "per_page": 50, "safesearch": "true"})
    hits = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))["hits"]
    if portrait:  # סדר הרלוונטיות של Pixabay נשמר; אנכיים קודם
        hits = sorted(hits, key=lambda h: pick(h)["height"] < pick(h)["width"])
    return hits[:n]


def pick(hit):
    """1080p אם יש (קל יותר מ-4K), אחרת הגדול הזמין."""
    vs = hit["videos"]
    for k in ("medium", "large", "small"):
        if vs.get(k, {}).get("width", 0) >= 1080 or (k == "small" and vs[k].get("url")):
            return vs[k]
    return vs["large"]


def download(hit, out):
    v = pick(hit)
    with urllib.request.urlopen(urllib.request.Request(v["url"], headers=UA), timeout=120) as r, open(out, "wb") as f:
        f.write(r.read())
    meta = {"source": "pixabay", "license": "Pixabay Content License", "id": hit["id"],
            "page": hit["pageURL"], "user": hit["user"], "tags": hit["tags"], "duration": hit["duration"],
            "size": [v["width"], v["height"]]}
    json.dump(meta, open(os.path.splitext(out)[0] + ".json", "w"), ensure_ascii=False, indent=1)
    return meta


if __name__ == "__main__":
    a = sys.argv[1:]
    portrait = "--portrait" in a
    n = int(a[a.index("--n") + 1]) if "--n" in a else 1
    q, out = [x for x in a if not x.startswith("--") and not x.isdigit()][:2]
    base, ext = os.path.splitext(out)
    for i, h in enumerate(search(q, portrait, n)):
        path = out if n == 1 else f"{base}_{i + 1}{ext}"
        m = download(h, path)
        print(path, m["id"], m["duration"], "s", m["size"], m["tags"][:60])
