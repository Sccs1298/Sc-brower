"""שליפת נתוני שוק: CoinGecko (מחירים) + Alternative.me (מדד פחד ותאוותנות). ללא מפתח API."""
import requests

from config import COINS

TIMEOUT = 20
HEADERS = {"User-Agent": "crypto-ivrit-bot/1.0"}


def _get(url, **params):
    r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def fetch_prices():
    ids = ",".join(c[0] for c in COINS)
    data = _get(
        "https://api.coingecko.com/api/v3/coins/markets",
        vs_currency="usd", ids=ids, price_change_percentage="24h,7d",
    )
    by_id = {d["id"]: d for d in data}
    out = []
    for cid, name_he, symbol in COINS:
        d = by_id.get(cid)
        if not d:
            continue
        out.append({
            "id": cid,
            "name": name_he,
            "symbol": symbol,
            "price": d["current_price"],
            "change_24h": d.get("price_change_percentage_24h_in_currency") or 0.0,
            "change_7d": d.get("price_change_percentage_7d_in_currency") or 0.0,
        })
    return out


def fetch_global():
    d = _get("https://api.coingecko.com/api/v3/global")["data"]
    return {
        "total_market_cap_usd": d["total_market_cap"]["usd"],
        "market_cap_change_24h": d.get("market_cap_change_percentage_24h_usd", 0.0),
        "btc_dominance": d["market_cap_percentage"]["btc"],
    }


def fetch_fear_greed():
    d = _get("https://api.alternative.me/fng/", limit=1)["data"][0]
    return {"value": int(d["value"]), "label": d["value_classification"]}


def fetch_market_snapshot():
    """מחזיר את כל נתוני השוק. אם מקור משני נכשל – ממשיכים בלעדיו."""
    snapshot = {"coins": fetch_prices()}
    for key, fn in (("global", fetch_global), ("fear_greed", fetch_fear_greed)):
        try:
            snapshot[key] = fn()
        except Exception as e:  # noqa: BLE001 – מקור משני, לא קריטי
            print(f"[market] {key} unavailable: {e}")
            snapshot[key] = None
    return snapshot


def sample_snapshot():
    """נתוני דוגמה לבדיקה מקומית בלי אינטרנט."""
    return {
        "coins": [
            {"id": "bitcoin", "name": "ביטקוין", "symbol": "BTC", "price": 98250.0, "change_24h": 2.41, "change_7d": 5.1},
            {"id": "ethereum", "name": "את'ריום", "symbol": "ETH", "price": 3620.5, "change_24h": -1.12, "change_7d": 3.2},
            {"id": "solana", "name": "סולנה", "symbol": "SOL", "price": 212.3, "change_24h": 4.87, "change_7d": 9.9},
            {"id": "ripple", "name": "XRP", "symbol": "XRP", "price": 2.31, "change_24h": 0.35, "change_7d": -2.0},
            {"id": "binancecoin", "name": "BNB", "symbol": "BNB", "price": 701.8, "change_24h": -0.64, "change_7d": 1.4},
            {"id": "dogecoin", "name": "דוג'קוין", "symbol": "DOGE", "price": 0.3812, "change_24h": 6.02, "change_7d": 12.5},
        ],
        "global": {"total_market_cap_usd": 3.42e12, "market_cap_change_24h": 1.8, "btc_dominance": 57.3},
        "fear_greed": {"value": 71, "label": "Greed"},
    }
