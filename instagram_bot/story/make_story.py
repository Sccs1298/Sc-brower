"""סטורי "מצב השוק" – 1080x1920 JPG, כל 4 שעות.

    python3 instagram_bot/story/make_story.py OUT_DIR

1. CoinGecko: שווי שוק כולל + 20 המטבעות הגדולים (מפת חום).
2. אימות מקור שני: CoinPaprika – מחיר BTC/ETH ושינוי השוק. פער מעל 1.5% → עוצרים (exit 2), לא מפרסמים.
3. מצלם את story.html ב-Chromium → OUT_DIR/story.jpg + OUT_DIR/story.json (הנתונים).
"""
import datetime as dt
import json
import os
import subprocess
import sys
import zoneinfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".claude", "skills", "daily-recap"))
from fetch_market import CG, SKIP, SKIP_EXACT, get_json  # noqa: E402

PAPRIKA = {"BTC": "btc-bitcoin", "ETH": "eth-ethereum"}


def main(out):
    os.makedirs(out, exist_ok=True)
    g = get_json(CG + "/global")["data"]
    m = get_json(CG + "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1")
    coins = []
    for c in m:
        s, name = c["symbol"].lower(), c["name"].lower()
        if s in SKIP_EXACT or any(k in s for k in SKIP) or "wrapped" in name or "staked" in name:
            continue
        coins.append([c["symbol"].upper(), c["market_cap"] / 1e9, round(c.get("price_change_percentage_24h") or 0, 2), c["current_price"]])
        if len(coins) == 20:
            break
    check = {}
    for sym, pid in PAPRIKA.items():
        cg = next(c for c in coins if c[0] == sym)
        pp = get_json(f"https://api.coinpaprika.com/v1/tickers/{pid}")["quotes"]["USD"]
        diff = abs(cg[3] - pp["price"]) / pp["price"] * 100
        check[sym] = {"coingecko": cg[3], "paprika": round(pp["price"], 2), "diff_pct": round(diff, 2),
                      "ch_cg": cg[2], "ch_pp": pp["percent_change_24h"]}
        if diff > 1.5 or abs(cg[2] - pp["percent_change_24h"]) > 1.5:
            print("MISMATCH", json.dumps(check, ensure_ascii=False))
            sys.exit(2)
    # שינוי השוק: CoinGecko /global לפעמים משתבש (08.11: -3.7% כשהמטבעות כמעט שטוחים) →
    # הכותרת מ-Paprika, מאומתת מול ממוצע משוקלל של 20 המטבעות הגדולים ב-CoinGecko.
    pg = get_json("https://api.coinpaprika.com/v1/global")
    w = sum(c[1] * c[2] for c in coins) / sum(c[1] for c in coins)
    check["MARKET"] = {"paprika": pg["market_cap_change_24h"], "coingecko_top20": round(w, 2), "coingecko_global": round(g["market_cap_change_percentage_24h_usd"], 2)}
    if abs(pg["market_cap_change_24h"] - w) > 1.5:
        print("MISMATCH", json.dumps(check, ensure_ascii=False))
        sys.exit(2)
    now = dt.datetime.now(zoneinfo.ZoneInfo("Asia/Jerusalem"))
    data = {"time": now.strftime("%H:%M"), "date": now.strftime("%d.%m.%Y"),
            "mcap_tn": round(pg["market_cap_usd"] / 1e12, 2),
            "ch": round(pg["market_cap_change_24h"], 2),
            "btc_dom": round(g["market_cap_percentage"]["btc"], 1),
            "coins": coins, "check": check}
    json.dump(data, open(os.path.join(out, "story.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(HERE, "data.js"), "w", encoding="utf-8").write("window.STORY=" + json.dumps(data, ensure_ascii=False) + ";")
    subprocess.run(["node", os.path.join(HERE, "shoot.js"), os.path.join(out, "story.jpg")], check=True)
    print(json.dumps({k: data[k] for k in ("time", "ch", "mcap_tn")}, ensure_ascii=False), check)


if __name__ == "__main__":
    main(sys.argv[1])
