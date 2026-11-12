import json
W = '/tmp/claude-0/-home-user-Sc-brower/9d869544-66c7-5a4f-81f8-26dd7e80659a/scratchpad/daily/2026-11-12'
mk = json.load(open(W + '/market.json'))
coins = [[s, m, ch] for s, m, ch, _ in mk['coins']][:24]
LTR = lambda t: f'<span dir="ltr" style="unicode-bidi:isolate">{t}</span>'


def news(num, place, body, src):
    return (f'<div class="card" style="margin-bottom:20px;text-align:right;padding:26px 36px"><div style="font:900 38px Heebo;color:var(--acc2)">{num} · {place}</div>'
            f'<div style="font:700 38px/1.3 Heebo;margin-top:8px">{body}</div>'
            f'<div style="font:400 24px Heebo;opacity:.5;margin-top:10px;direction:ltr;text-align:left">{src}</div></div>')


def step(icon, t):
    return (f'<div class="card" style="margin-bottom:22px;display:flex;gap:30px;align-items:center;padding:30px 36px">'
            f'<div style="flex:none;width:90px;height:90px;border-radius:50%;background:#9D5CFF;color:#fff;font:900 40px/90px Heebo;text-align:center">{icon}</div>'
            f'<div style="font:700 40px/1.3 Heebo">{t}</div></div>')


slides = [
 {"theme": "dark", "tag": "12.11.2026", "icon": ["clock", 150, 480],
  "bp": [{"c": [540, 390, 260]}, {"t": [890, 160, "NVDA // 24/7"], "anchor": "end"}],
  "html": '<div class="c giga acc" style="top:690px;font-size:190px">אנבידיה</div>'
          '<div class="c h1" style="top:900px;font-size:66px;padding:0 60px;white-space:normal">וול סטריט הייתה סגורה. בורסת קריפטו כבר תמחרה את הנפילה.</div>'
          '<div class="c" style="top:1180px"><span style="display:inline-block;padding:12px 30px;border-radius:999px;background:rgba(157,92,255,.18);border:1.5px solid rgba(157,92,255,.5);font:700 34px Heebo">ועוד 3 חדשות מהיממה ←</span></div>'},
 {"theme": "light", "tag": "TIMELINE",
  "html": '<div class="c h1" style="top:170px;font-size:84px">איך זה קרה</div>'
          '<div class="cards" style="top:330px;flex-direction:column;gap:0">'
          + step('1', 'יום ראשון, וול סטריט סגורה. הדירקטוריון של אנבידיה פותח חקירה פנימית סביב המנכ״ל, אחרי דיווח בתקשורת.')
          + step('2', f'בבורסת הקריפטו Hyperliquid, החוזה על המניה צונח לכ-{LTR("$178")}, יותר מ-4% מתחת לסגירה של יום שישי.')
          + step('3', 'אתמול בלילה, אחרי דיווח שהדירקטוריון שוקל להחליף אותו, החוזה ירד שוב ביותר מ-7%.')
          + '</div><div class="c src" style="top:1170px;direction:ltr">Reuters · Dow Jones · Finance Magnates · CoinDesk · The Block</div>'},
 {"theme": "dark", "tag": "WHY IT MATTERS",
  "html": '<div class="c h1" style="top:180px;font-size:84px">למה זה מעניין</div>'
          '<div class="cards" style="top:360px;flex-direction:column;gap:0">'
          + step('24/7', 'חוזים עתידיים על מניות נסחרים בבורסות קריפטו גם בסופ״ש ובלילה.')
          + step('⚡', 'כשיש חדשות בזמן שהבורסה סגורה, שם נקבע המחיר הראשון.')
          + step('!', 'יש שם מינוף. התנודות יכולות להיות חדות יותר מהמניה עצמה.')
          + '</div><div class="c p" style="top:1060px;font-size:36px;opacity:.6;padding:0 90px;white-space:normal">לפי הדיווחים, ג׳נסן הואנג עדיין בתפקיד, ואנבידיה אומרת שהוא ממשיך להוביל.</div>'},
 {"theme": "dark", "tag": "MORE NEWS",
  "html": '<div class="c h1" style="top:150px;font-size:80px">ומה עוד קרה</div><div class="cards" style="top:290px;flex-direction:column;gap:0">'
          + news('01', 'דרום קוריאה', 'בורסת GOPAX הקפיאה מסחר ומשיכות רגילות, אחרי מייל איום של האקרים.', 'Cointelegraph · Finance Magnates · The Star')
          + news('02', 'טורקיה', 'המועצה ליציבות פיננסית (FSB) המליצה לטורקיה להדק את הפיקוח על קריפטו ועל מטבעות יציבים.', 'Reuters · FSB')
          + news('03', 'Zcash', f'המטבע ירד מתחת ל-{LTR("$1,000")} לראשונה מספטמבר.', 'The Crypto Times · CoinGecko')
          + '</div>'},
 {"theme": "dark", "tag": "CRYPTO TODAY", "heat": True,
  "html": '<div class="c h1" style="top:170px;font-size:78px">והשוק הבוקר:</div>'
          '<div class="c h2" style="top:1100px;font-size:34px;padding:0 70px;white-space:normal">השוק ירד ביממה בקצת פחות מאחוז.</div>'
          '<div class="c h2 acc" style="top:1160px;font-size:38px;padding:0 90px;white-space:normal">בסקנדל הבא בסופ״ש, תסתכלו קודם על הקריפטו.</div>'},
]
open('/home/user/Sc-brower/instagram_bot/motion/carousel/data.js', 'w', encoding='utf-8').write(
    'window.CAROUSEL=' + json.dumps({"slides": slides, "coins": coins}, ensure_ascii=False) + ';')
print('ok')
