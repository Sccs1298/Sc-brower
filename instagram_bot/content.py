"""יצירת תוכן הפוסט בעברית – בעזרת Claude, עם תבנית גיבוי אם אין מפתח API."""
import json
import random

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, BASE_HASHTAGS, DISCLAIMER

EDUCATION_TOPICS = [
    "מה זה ביטקוין ולמה הוא נקרא 'זהב דיגיטלי'",
    "מה זה בלוקצ'יין – בהסבר פשוט",
    "ארנק חם מול ארנק קר",
    "מה זה Seed Phrase ולמה אסור לשתף אותו אף פעם",
    "מה זה Stablecoin (USDT, USDC)",
    "מה זה ה-Halving של ביטקוין",
    "Proof of Work מול Proof of Stake",
    "מה זה Staking",
    "מה זה DeFi",
    "מה זה NFT ומה נשאר ממנו",
    "מה זה Market Cap ולמה הוא חשוב יותר מהמחיר",
    "מה זה DCA – השקעה מחזורית",
    "מדד הפחד והתאוותנות – איך קוראים אותו",
    "מה זה Gas Fees",
    "מה זה Layer 2",
    "5 סימנים שזו הונאת קריפטו",
    "מה זה Rug Pull",
    "בורסה מרכזית (CEX) מול מבוזרת (DEX)",
    "מה זה Altcoin",
    "מה זה Bitcoin Dominance",
    "מה זה Smart Contract",
    "מיסוי קריפטו בישראל – העקרונות הבסיסיים",
    "מה זה ETF של ביטקוין",
    "Bull Market מול Bear Market",
    "מה זה Whale ואיך לווייתנים מזיזים את השוק",
    "מה זה Airdrop",
    "מה זה Memecoin ולמה הוא מסוכן",
    "מה זה Private Key מול Public Key",
    "איך שומרים על החשבון בבורסה – 2FA ועוד",
    "מה זה Tokenomics",
]

SYSTEM_PROMPT = f"""אתה כותב התוכן של עמוד אינסטגרם ישראלי על קריפטו בעברית.
קהל היעד: ישראלים סקרנים, רובם מתחילים. הסגנון: ברור, ענייני, צעיר, בלי סלנג מוגזם,
עם מעט אימוג'ים במקומות הנכונים. כותבים בעברית תקנית; מונחים טכניים מקובלים (DeFi, Staking) מותר באנגלית.

כללים מחייבים:
- לעולם אל תמליץ לקנות/למכור מטבע ספציפי, ואל תחזה מחירים. מתארים מה קרה – לא מה יקרה.
- השתמש רק במספרים שקיבלת בנתונים. אל תמציא נתונים, חדשות או סיבות לתנועות מחיר.
- הכותרת לתמונה קצרה: עד 6 מילים.
- כל נקודה לתמונה: עד 12 מילים.
- הכיתוב (caption) 60-150 מילים, פותח במשפט שתופס תשומת לב, ומסתיים בשאלה לקהל כדי לעודד תגובות.
- אל תכלול את ההאשטגים בתוך ה-caption ואל תכלול הסתייגות משפטית – הן מתווספות אוטומטית: "{DISCLAIMER}"
- האשטגים: 5-8 תגיות רלוונטיות לנושא, בעברית ובאנגלית, כל אחת מתחילה ב-#.
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
        "caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["headline", "points", "caption", "hashtags"],
    "additionalProperties": False,
}


def _fmt_usd(x):
    if x >= 1e12:
        return f"${x / 1e12:.2f}T"
    if x >= 1e9:
        return f"${x / 1e9:.1f}B"
    if x >= 100:
        return f"${x:,.0f}"
    if x >= 1:
        return f"${x:,.2f}"
    return f"${x:.4f}"


def _market_brief(snapshot):
    lines = [f"{c['name']} ({c['symbol']}): {_fmt_usd(c['price'])}, 24h: {c['change_24h']:+.2f}%, 7d: {c['change_7d']:+.2f}%"
             for c in snapshot["coins"]]
    g = snapshot.get("global")
    if g:
        lines.append(f"שווי שוק כולל: {_fmt_usd(g['total_market_cap_usd'])} ({g['market_cap_change_24h']:+.2f}% ב-24 שעות), דומיננטיות ביטקוין: {g['btc_dominance']:.1f}%")
    fg = snapshot.get("fear_greed")
    if fg:
        lines.append(f"מדד פחד ותאוותנות: {fg['value']}/100 ({fg['label']})")
    return "\n".join(lines)


def _ask_claude(user_prompt):
    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.beta.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined: {response.stop_details}")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


# ---------- תבניות גיבוי (בלי Claude) ----------

def _fallback_market(snapshot):
    coins = snapshot["coins"]
    up = sum(1 for c in coins if c["change_24h"] > 0)
    best = max(coins, key=lambda c: c["change_24h"])
    worst = min(coins, key=lambda c: c["change_24h"])
    mood = "ירוק" if up > len(coins) / 2 else "אדום" if up < len(coins) / 2 else "מעורב"
    caption = (
        f"📊 עדכון שוק הקריפטו היומי – יום {mood} בשוק.\n\n"
        f"🚀 המוביל: {best['name']} ({best['change_24h']:+.2f}%)\n"
        f"📉 המאסף: {worst['name']} ({worst['change_24h']:+.2f}%)\n"
    )
    fg = snapshot.get("fear_greed")
    if fg:
        caption += f"😨 מדד פחד ותאוותנות: {fg['value']}/100\n"
    caption += "\nאיזה מטבע אתם עוקבים אחריו השבוע? ספרו בתגובות 👇"
    return {
        "headline": f"עדכון שוק – יום {mood}",
        "points": [],
        "caption": caption,
        "hashtags": ["#עדכוןשוק", "#מחירביטקוין", "#cryptonews"],
    }


def _fallback_education(topic):
    return {
        "headline": topic,
        "points": ["שמרו את הפוסט 📌", "עקבו לעוד הסברים פשוטים על קריפטו"],
        "caption": f"💡 {topic}\n\nבפוסט הבא נצלול לעומק. רוצים שנסביר נושא מסוים? כתבו לנו בתגובות 👇",
        "hashtags": ["#לימודקריפטו", "#cryptoeducation"],
    }


# ---------- API ציבורי ----------

def generate_market_post(snapshot):
    if not ANTHROPIC_API_KEY:
        print("[content] ANTHROPIC_API_KEY missing – using template")
        return _fallback_market(snapshot)
    prompt = (
        "כתוב פוסט 'עדכון שוק יומי' על סמך הנתונים הבאים (הם יוצגו גם בטבלה על התמונה):\n\n"
        f"{_market_brief(snapshot)}\n\n"
        "headline: כותרת שמסכמת את מצב השוק היום.\n"
        "points: 2-3 תובנות קצרות מהנתונים (למשל המטבע המוביל, מצב מדד הפחד).\n"
        "caption: סיכום השוק בשפה פשוטה."
    )
    try:
        return _ask_claude(prompt)
    except Exception as e:  # noqa: BLE001
        print(f"[content] Claude failed ({e}) – using template")
        return _fallback_market(snapshot)


def pick_topic(used_topics):
    remaining = [t for t in EDUCATION_TOPICS if t not in used_topics] or EDUCATION_TOPICS
    return random.choice(remaining)


def generate_education_post(topic):
    if not ANTHROPIC_API_KEY:
        print("[content] ANTHROPIC_API_KEY missing – using template")
        return _fallback_education(topic)
    prompt = (
        f"כתוב פוסט לימודי בנושא: {topic}\n\n"
        "headline: כותרת קליטה לנושא.\n"
        "points: 3-4 נקודות קצרות שמסבירות את העיקר – כל אחת עומדת בפני עצמה.\n"
        "caption: הסבר מורחב ופשוט, עם דוגמה מחיי היומיום אם אפשר."
    )
    try:
        return _ask_claude(prompt)
    except Exception as e:  # noqa: BLE001
        print(f"[content] Claude failed ({e}) – using template")
        return _fallback_education(topic)


def build_caption(content):
    tags = []
    for t in content.get("hashtags", []) + BASE_HASHTAGS:
        t = t.strip()
        if not t.startswith("#"):
            t = "#" + t
        t = t.replace(" ", "")
        if t.lower() not in {x.lower() for x in tags}:
            tags.append(t)
    caption = f"{content['caption'].strip()}\n\n{DISCLAIMER}\n\n{' '.join(tags[:15])}"
    return caption[:2200]  # מגבלת אינסטגרם
