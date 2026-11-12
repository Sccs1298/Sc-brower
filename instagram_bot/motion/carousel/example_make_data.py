import json
mk = json.load(open('/tmp/daily-recap/2026-11-06b/market.json'))
c = {s: ch for s, _, ch, _ in mk['coins']}
coins = [[s, m, ch] for s, m, ch, _ in mk['coins']][:24]
pct = lambda s: f"{c[s]:+.1f}%"
slides = [
 {"theme": "dark", "tag": "06.11.2026", "icon": ["3d-coin", 150, 560],
  "bp": [{"c": [540, 450, 300]}, {"d": [190, 1000, 890, 1000], "label": "BTC / USD · 7-WEEK LOW"}, {"t": [890, 160, "SIGNAL: RISK-OFF"], "anchor": "end"}],
  "html": '<div class="c giga num" style="top:745px">$76K</div>'
          '<div class="c h1" style="top:1040px;font-size:78px">ביטקוין בשפל של 7 שבועות</div>'
          '<div class="c h2 acc" style="top:1140px">ומי אשם? הבינה המלאכותית.</div>'},
 {"theme": "light", "tag": "WHAT HAPPENED",
  "bp": [{"d": [120, 720, 960, 720], "label": "24H · TOTAL MARKET CAP"}],
  "html": '<div class="c h2" style="top:250px">שוק הקריפטו איבד</div>'
          '<div class="c giga num" style="top:360px;font-size:250px">$100B+</div>'
          '<div class="c p" style="top:610px">ביממה אחת. בלי האק. בלי פשיטת רגל.</div>'
          '<div class="cards" style="top:820px">'
          + ''.join(f'<div class="card"><div class="k num">{s}</div><div class="v dn">{pct(s)}</div></div>' for s in ("BTC", "ETH", "XRP"))
          + '</div><div class="c p" style="top:1150px;font-size:40px;opacity:.6">רק וול סטריט שהחליטה שנמאס לה.</div>'},
 {"theme": "red", "tag": "WHY", "icon": ["computer", 170, 470],
  "bp": [{"c": [540, 400, 270]}, {"t": [140, 170, "NASDAQ · AI SELLOFF"]}],
  "html": '<div class="c h1" style="top:740px;font-size:92px">וול סטריט ברחה<br>ממניות ה-AI</div>'
          '<div class="c h2" style="top:1000px;color:#ff8a8e">והקריפטו? נגרר אחריה.</div>'
          '<div class="c p" style="top:1100px;opacity:.75">כמו מניית טכנולוגיה. רק עם יותר קפאין.</div>'},
 {"theme": "dark", "tag": "LEVERAGE",
  "html": '<div class="c h1" style="top:230px;font-size:86px">מי שהימר על עלייה</div>'
          '<div class="c h1 acc" style="top:330px;font-size:86px">שילם.</div>'
          '<div class="cards" style="top:540px;flex-direction:column;gap:34px">'
          '<div class="card"><div class="k">פוזיציות לונג שחוסלו</div><div class="v dn">$1B+</div><div class="s">ביממה האחרונה</div></div>'
          '<div class="card"><div class="k">יצאו מקרנות ביטקוין (ETF)</div><div class="v dn">$430M</div><div class="s">ביום אחד</div></div></div>'},
 {"theme": "dark", "tag": "CRYPTO TODAY", "heat": True,
  "html": '<div class="c h1" style="top:170px;font-size:84px">הקריפטו היום:</div>'
          '<div class="c h2" style="top:1120px;font-size:44px"><span class="acc">השורה התחתונה:</span> ביטקוין עדיין זז עם הנאסד״ק.</div>'
          '<div class="c src" style="top:1215px">מקורות: CoinGecko · CoinDesk · Bloomberg · The Block · CryptoRank</div>'},
]
open('/home/user/Sc-brower/instagram_bot/motion/carousel/data.js', 'w', encoding='utf-8').write(
    'window.CAROUSEL=' + json.dumps({"slides": slides, "coins": coins}, ensure_ascii=False) + ';')
caption = f"""ביטקוין בשפל של 7 שבועות. ומי אשם? הבינה המלאכותית 🤖📉

וול סטריט ברחה ממניות ה-AI, והקריפטו נגרר אחריה:
• ביטקוין סביב 76 אלף דולר
• יותר ממיליארד דולר בפוזיציות לונג חוסלו
• 430 מיליון דולר יצאו מקרנות ביטקוין ביום אחד

"מקלט בטוח"? בינתיים הוא זז בדיוק כמו הנאסד"ק.

אתם קונים את הירידה או מחכים בצד? 👇

⚠️ אין לראות בתוכן ייעוץ השקעות.
#ביטקוין #קריפטו #בינהמלאכותית #נאסדק #השקעות #crypto #bitcoin #CRYPTOILS"""
open('/tmp/claude-0/-home-user-Sc-brower/9d869544-66c7-5a4f-81f8-26dd7e80659a/scratchpad/carousel1/caption.txt', 'w', encoding='utf-8').write(caption)
print('ok', c['BTC'], c['ETH'], c['XRP'])
