"""מם זז מ-GIPHY (MP4) – לסצנת המם ברילס / שקף וידאו בקרוסלה.

    python .claude/skills/daily-recap/giphy_meme.py search "this is fine"      # מציג מועמדים (id, כותרת, גודל, משך)
    python .claude/skills/daily-recap/giphy_meme.py get <id> OUT.mp4           # מוריד + OUT.json (מקור)

המפתח: משתנה סביבה GIPHY_API_KEY (לא בריפו). אם חסר – עוצר ומדווח.
בחירה: מם קלאסי מוכר, rating עד pg-13, יחס קרוב לריבוע/אנכי עדיף (אזור המדיה 1080x960).
חלץ פריים ובדוק שהמם הוא מה שחשבת לפני שימוש.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "crypto-ils-daily-recap/1.0"}
API = "https://api.giphy.com/v1/gifs"


def key():
    k = os.environ.get("GIPHY_API_KEY")
    if not k:
        raise SystemExit("GIPHY_API_KEY חסר – יש להוסיף אותו במשתני הסביבה (Edit environment).")
    return k


def call(path, **q):
    q["api_key"] = key()
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{API}{path}?{urllib.parse.urlencode(q)}", headers=UA), timeout=30))


def search(q, n=12):
    for g in call("/search", q=q, limit=n, rating="pg-13")["data"]:
        o = g["images"]["original"]
        print(g["id"], f'{o.get("width")}x{o.get("height")}', "|", g["title"][:60], "|", g.get("username") or "-")


def get(gid, out):
    g = call(f"/{gid}")["data"]
    with urllib.request.urlopen(urllib.request.Request(g["images"]["original"]["mp4"], headers=UA), timeout=60) as r, open(out, "wb") as f:
        f.write(r.read())
    meta = {"source": "giphy", "id": gid, "title": g["title"], "url": g["url"], "user": g.get("username"),
            "note": "מם קלאסי דרך GIPHY – זכויות היצירה המקורית לא שייכות ל-GIPHY"}
    json.dump(meta, open(os.path.splitext(out)[0] + ".json", "w"), ensure_ascii=False, indent=1)
    print(out, meta["title"])


if __name__ == "__main__":
    if sys.argv[1] == "search":
        search(" ".join(sys.argv[2:]))
    else:
        get(sys.argv[2], sys.argv[3])
