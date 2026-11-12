import json
W = '/tmp/claude-0/-home-user-Sc-brower/9d869544-66c7-5a4f-81f8-26dd7e80659a/scratchpad/daily/2026-11-11'
mk = json.load(open(W + '/market.json'))
coins = [[s, m, ch] for s, m, ch, _ in mk['coins']][:24]
LTR = lambda t: f'<span dir="ltr" style="unicode-bidi:isolate">{t}</span>'


def news(num, place, body, src):
    return (f'<div class="card" style="margin-bottom:22px;text-align:right;padding:30px 36px"><div style="font:900 40px Heebo;color:var(--acc2)">{num} · {place}</div>'
            f'<div style="font:700 40px/1.3 Heebo;margin-top:8px">{body}</div>'
            f'<div style="font:400 26px Heebo;opacity:.5;margin-top:12px;direction:ltr;text-align:left">{src}</div></div>')


def step(icon, t):
    return (f'<div class="card" style="margin-bottom:22px;display:flex;gap:30px;align-items:center;padding:30px 36px">'
            f'<div style="flex:none;width:90px;height:90px;border-radius:50%;background:#9D5CFF;color:#fff;font:900 46px/90px Heebo;text-align:center">{icon}</div>'
            f'<div style="font:700 42px/1.3 Heebo">{t}</div></div>')


slides = [
 {"theme": "dark", "tag": "11.11.2026", "icon": ["3d-coin", 150, 480],
  "bp": [{"c": [540, 390, 260]}, {"t": [890, 160, "ISRAEL // BANKS"], "anchor": "end"}],
  "html": '<div class="c giga acc" style="top:690px;font-size:180px">ביטקוין בבנק</div>'
          '<div class="c h1" style="top:900px;font-size:70px;padding:0 60px;white-space:normal">דיסקונט יאפשר לקנות ביטקוין ואת׳ריום ישר מהאפליקציה</div>'
          '<div class="c h2" style="top:1080px;font-size:46px">החל מ-26 בנובמבר</div>'
          '<div class="c" style="top:1180px"><span style="display:inline-block;padding:12px 30px;border-radius:999px;background:rgba(157,92,255,.18);border:1.5px solid rgba(157,92,255,.5);font:700 34px Heebo">ועוד 2 חדשות מהיממה ←</span></div>'},
 {"theme": "light", "tag": "WHAT CHANGES",
  "html": '<div class="c h1" style="top:170px;font-size:84px">מה זה אומר בפועל</div>'
          '<div class="cards" style="top:340px;flex-direction:column;gap:0">'
          + step('₿', 'קונים, מחזיקים ומוכרים ביטקוין ואת׳ריום מתוך אפליקציית הבנק.')
          + step('✕', 'בלי לפתוח חשבון בבורסה חיצונית, ובלי ארנק דיגיטלי.')
          + step('₪', 'הכסף מהמכירה נכנס ישר לחשבון הבנק.')
          + '</div><div class="c src" style="top:1150px;direction:ltr">Globes · ice · Poenta</div>'},
 {"theme": "dark", "tag": "TAX & FEES",
  "html": '<div class="c h1" style="top:180px;font-size:84px">מס ועמלות</div>'
          '<div class="cards" style="top:360px;flex-direction:column;gap:0">'
          + step('%', 'הבנק ינכה את המס במקור.')
          + step('⇄', 'אפשר יהיה לקזז הפסד בביטקוין מול רווח במניות, לפי כללי המס.')
          + step('0', 'חצי שנה בלי דמי ניהול חשבון. גובה עמלת המסחר עוד לא פורסם.')
          + '</div><div class="c p" style="top:1060px;font-size:36px;opacity:.6;padding:0 90px;white-space:normal">לפי דיסקונט, זה הבנק הראשון בישראל שעושה את זה.</div>'},
 {"theme": "dark", "tag": "MORE NEWS",
  "html": '<div class="c h1" style="top:190px;font-size:80px">ומה עוד קרה</div><div class="cards" style="top:360px;flex-direction:column;gap:0">'
          + news('01', 'ארה״ב', 'נתוני אינפלציה חמים הגבירו את החשש מהעלאת ריבית, וביטקוין ירד שוב מתחת ל-74 אלף דולר.', 'Yahoo Finance · Motley Fool · Crypto News')
          + news('02', 'ארה״ב', 'משרד האוצר ניתק את בורסת MEXC מהמערכת הפיננסית האמריקאית, בחשד לעסקאות של כ-16.7 מיליארד דולר שקשורות לעקיפת סנקציות.', 'Cointelegraph · BleepingComputer · MLex')
          + '</div>'},
 {"theme": "dark", "tag": "CRYPTO TODAY", "heat": True,
  "html": '<div class="c h1" style="top:170px;font-size:78px">והשוק הבוקר:</div>'
          '<div class="c h2" style="top:1100px;font-size:34px;padding:0 70px;white-space:normal">השוק ירד ביממה בקצת יותר מאחוז.</div>'
          '<div class="c h2 acc" style="top:1160px;font-size:38px;padding:0 90px;white-space:normal">אתם הייתם קונים ביטקוין דרך הבנק, או נשארים בבורסה שלכם? 👇</div>'},
]
open('/home/user/Sc-brower/instagram_bot/motion/carousel/data.js', 'w', encoding='utf-8').write(
    'window.CAROUSEL=' + json.dumps({"slides": slides, "coins": coins}, ensure_ascii=False) + ';')
print('ok')
