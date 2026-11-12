"""מושך תמונת מצב של השוק + כותרות חדשות מהיממה האחרונה, ושומר ל-JSON.

    python .claude/skills/daily-recap/fetch_market.py OUT_DIR

פלט: OUT_DIR/market.json
  global   – שווי שוק כולל, שינוי 24ש', דומיננטיות BTC, הפסד/רווח משוער בדולרים
  coins    – 30 המטבעות הגדולים (בלי סטייבלקוינים/עטופים): [symbol, mcap_bn, change_24h, price]
  headlines – כותרות Google News לפי נושא: [date, title (כולל שם המקור)]
"""
import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "crypto-ils-daily-recap/1.0"}
CG = "https://api.coingecko.com/api/v3"
SKIP = ("usd", "eur", "gold", "xaut", "paxg", "steth", "wsteth", "weth", "wbtc", "cbbtc", "weeth", "reth",
        "wbeth", "bnsol", "jitosol", "lbtc", "figr", "wbt", "buidl", "ousg", "usyc", "susde", "bfusd")
SKIP_EXACT = {"dai", "usdd", "gho", "frax", "lusd", "tusd", "usdx", "crvusd", "rlusd", "eurc"}
QUERIES = [
    "bitcoin price when:1d", "crypto market when:1d", "crypto liquidations when:1d", "ethereum when:1d",
    "crypto hack when:2d", "crypto regulation when:2d", "bitcoin ETF flows when:2d", "stock market today when:1d",
]
HE_QUERIES = ["קריפטו when:2d", "ביטקוין when:2d"]


def get_json(url, tries=5):
    import time
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(15 * (i + 1))  # CoinGecko מגביל קצב – מחכים ומנסים שוב


def news(q, hl="en-US", gl="US", ceid="US:en", n=6):
    u = "https://news.google.com/rss/search?q=" + urllib.parse.quote(q) + f"&hl={hl}&gl={gl}&ceid={ceid}"
    root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
    return [[i.findtext("pubDate")[5:22], i.findtext("title")] for i in root.iter("item")][:n]


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    g = get_json(CG + "/global")["data"]
    mcap = g["total_market_cap"]["usd"]
    ch = g["market_cap_change_percentage_24h_usd"]
    prev = mcap / (1 + ch / 100)
    glob = {
        "total_mcap_usd_tn": round(mcap / 1e12, 3),
        "change_24h_pct": round(ch, 2),
        "delta_usd_bn": round((mcap - prev) / 1e9, 1),
        "btc_dominance_pct": round(g["market_cap_percentage"]["btc"], 1),
    }
    m = get_json(CG + "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&price_change_percentage=24h")
    coins = []
    for c in m:
        s, name = c["symbol"].lower(), c["name"].lower()
        if s in SKIP_EXACT or any(k in s for k in SKIP) or "wrapped" in name or "staked" in name or "bridged" in name:
            continue
        coins.append([c["symbol"].upper(), round(c["market_cap"] / 1e9, 1),
                      round(c.get("price_change_percentage_24h") or 0, 2), c["current_price"]])
        if len(coins) == 30:
            break
    heads = {}
    for q in QUERIES:
        try:
            heads[q] = news(q)
        except Exception as e:  # noqa: BLE001
            heads[q] = [["error", str(e)[:80]]]
    for q in HE_QUERIES:
        try:
            heads[q] = news(q, "iw", "IL", "IL:he")
        except Exception as e:  # noqa: BLE001
            heads[q] = [["error", str(e)[:80]]]
    data = {"global": glob, "coins": coins, "headlines": heads}
    path = os.path.join(out_dir, "market.json")
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(glob, ensure_ascii=False))
    print("top:", coins[:5])
    print("saved", path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
