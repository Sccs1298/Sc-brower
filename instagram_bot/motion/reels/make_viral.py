"""בונה 3 רילסים "ויראליים" (פיצה / מזבלה / סאטושי) מאותה תבנית של daily_2026-11-08_v3.html.
    python3 make_viral.py  →  viral_pizza.html, viral_landfill.html, viral_satoshi.html
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'daily_2026-11-08_v3.html'), encoding='utf-8').read()
head = src[:src.index('window.SCENES = [')]
tail = src[src.index("window.addEventListener('load'"):]

EXTRA_CSS = '''
  .pizza { position:absolute; width:520px; height:520px; border-radius:50%; left:280px; top:430px;
    background: radial-gradient(circle at 50% 50%, #f6c453 0 58%, #e09a3a 59% 66%, #c97a2b 67% 100%);
    box-shadow: 0 50px 80px rgba(0,0,0,.5), inset 0 0 0 18px #b8692a; }
  .pizza i { position:absolute; width:70px; height:70px; border-radius:50%; background: radial-gradient(circle at 35% 35%, #e0473f, #a3201b); }
  .pizza b { position:absolute; left:50%; top:0; width:4px; height:100%; background:rgba(120,60,10,.55); transform-origin:center; }
  .post { direction:ltr; text-align:left; }
  .post .u { font:700 40px Heebo; color:#7B3FF2; } .post .d { font:400 30px Heebo; opacity:.55; margin-left:14px; }
  .post .t { font:700 50px/1.3 Heebo; margin-top:22px; }
  .hdd { position:absolute; left:290px; top:470px; width:500px; height:640px; border-radius:36px;
    background: linear-gradient(160deg,#3a3a42,#16161a); border:2px solid rgba(255,255,255,.15); box-shadow:0 50px 90px rgba(0,0,0,.6); }
  .hdd:before { content:''; position:absolute; left:70px; top:80px; width:360px; height:360px; border-radius:50%;
    background: radial-gradient(circle, #9aa0aa 0 8%, #2b2d33 9% 12%, #cfd3da 13% 70%, #8d929b 71%); }
  .hdd span { position:absolute; left:0; right:0; bottom:60px; text-align:center; font:700 34px "DejaVu Sans Mono", monospace; color:#ffd166; letter-spacing:3px; }
  .dump { position:absolute; left:60px; right:60px; top:860px; height:420px; }
  .dump i { position:absolute; bottom:0; border-radius:50% 50% 0 0; }
  .paper { direction:ltr; text-align:center; font-family: "DejaVu Serif", serif; }
  .paper .h { font:700 52px "DejaVu Serif", serif; line-height:1.25; } .paper .a { font:400 36px "DejaVu Serif", serif; margin-top:18px; opacity:.7; }
  .paper .l { height:14px; border-radius:7px; background:rgba(0,0,0,.12); margin:22px 30px 0; }
  .mail { direction:ltr; text-align:left; } .mail .f { font:700 36px Heebo; opacity:.6; } .mail .b { font:400 56px/1.3 "DejaVu Serif", serif; margin-top:24px; }
  .q { position:absolute; left:0; right:0; text-align:center; font:900 360px/1 Heebo; color:var(--accent); }
'''
head = head.replace('</style>', EXTRA_CSS + '</style>')

FOLLOW = '''`<div class="card follow" style="top:640px;transform:scale(.85)"><div class="lg">₿</div><div class="nm">CRYPTO ILS</div><div class="hd">@crypto_ils</div><a class="btn" id="fb">עקבו</a></div>`'''
FOLLOW_ANIM = '''anim(lt, dur, el) { auto(lt, el); const b = $(el, '#fb'), click = lt > 1.4; if (!b) return; b.textContent = click ? 'עוקבים ✓' : 'עקבו';
     b.style.background = click ? '#e3e3e5' : 'var(--accent)'; b.style.color = click ? '#111' : '#fff'; } },'''
COUNT = '''anim(lt, dur, el) { auto(lt, el); const m = $(el, '.cnt'), p = P(lt, 0, 1.1, easeInOut); m.textContent = m.dataset.pre + Math.round(+m.dataset.to * p).toLocaleString('en-US') + m.dataset.post; } },'''
A = 'anim(lt, dur, el) { auto(lt, el); } },'
STAMP = '''anim(lt, dur, el) { auto(lt, el); const s = $(el, '.stamp'), p = P(lt, .15, .3, back); s.style.opacity = clamp(p); s.style.transform = `rotate(-8deg) scale(${2.4 - 1.4 * p})`; } },'''

def pizza_html(top=430):
    tops = [(120, 140), (300, 110), (210, 290), (360, 300), (110, 330), (250, 400)]
    s = f'<div class="pizza" style="top:{top}px">' + ''.join(f'<i style="left:{x}px;top:{y}px"></i>' for x, y in tops)
    s += ''.join(f'<b style="transform:rotate({a}deg)"></b>' for a in (0, 45, 90, 135)) + '</div>'
    return s

SC = {}
SC['pizza'] = f'''window.SCENES = [
 {{ at: [0, 'הפיצה'], theme: 'dark', ring: [540, 690, 300], bp: [{{ c: [540, 690, 330], at: .1 }}],
   mid: `{pizza_html()}` + G('הפיצה הכי יקרה בהיסטוריה', 'h1', 1050, 'font-size:84px'), {A}
 {{ at: [0, 'משבע'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num acc cnt" data-pre="$" data-to="757" data-post="M" style="top:700px;font-size:250px">$0</div>` + G('על שתי פיצות.', 'h1', 1000, 'font-size:100px'), {COUNT}
 {{ at: [1, 'ב-2010'], theme: 'light', tr: 'whipR', ring: [540, 760, 0],
   bp: [{{ t: [540, 1150, 'MAY // 2010'], anchor: 'middle', at: .2 }}],
   mid: `<div class="row giga num" style="top:640px;font-size:300px">2010</div>` + G('ביטקוין שווה פחות מסנט', 'h2', 960, 'font-size:60px;opacity:.6'), {A}
 {{ at: [1, 'לאסלו'], theme: 'dark', tr: 'whipL', ring: [540, 700, 260],
   mid: AV(540, 700) + G('מתכנת. רעב.', 'h1', 1080, 'font-size:110px'), anim(lt, dur, el) {{ auto(lt, el); avatar(el, lt); }} }},
 {{ at: [2, 'בפורום'], theme: 'light', tr: 'zoom', ring: [540, 800, 0],
   mid: `<div class="card post" style="top:560px"><span class="u">laszlo</span><span class="d">May 18, 2010</span>
     <div class="t">I'll pay 10,000 bitcoins for a couple of pizzas.</div></div>` + G('הפוסט המקורי', 'h2 acc', 1060, 'font-size:56px'), {A}
 {{ at: [2, '10,000'], theme: 'dark', tr: 'whipR', ring: [540, 640, 230],
   mid: ICON('3d-coin', 540, 640, 470) + `<div class="row giga num" style="top:960px;font-size:220px">10,000 ₿</div>`, {A}
 {{ at: [3, 'שווה'], theme: 'light', tr: 'whipL', ring: [540, 760, 0],
   mid: `<div class="row giga num" style="top:620px;font-size:300px">$40</div>` + G('עסקה הוגנת. אז.', 'h1', 960, 'font-size:100px'), {A}
 {{ at: [4, 'הסכים'], theme: 'dark', tr: 'zoom', ring: [540, 690, 300],
   mid: `{pizza_html(380)}` + G('נמסר.', 'giga acc', 960, 'font-size:220px'), {A}
 {{ at: [5, 'היום'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   bp: [{{ d: [160, 1080, 920, 1080], label: '10,000 × $75,700', at: .2 }}],
   mid: `<div class="row giga num cnt" data-pre="$" data-to="757" data-post="M" style="top:760px;font-size:150px">$0</div>` + G('היום', 'h2', 620, 'font-size:70px'), {COUNT}
 {{ at: [5, 'משבע'], theme: 'dark', cls: 'redtint', tr: 'whipR', ring: [540, 820, 0],
   mid: G('הפיצה הכי יקרה', 'h1', 700, 'font-size:110px') + G('שנאכלה אי פעם.', 'h1 acc', 840, 'font-size:110px'), {A}
 {{ at: [6, 'ועד'], theme: 'light', tr: 'zoom', ring: [540, 760, 0],
   mid: `<div class="card" style="top:560px;text-align:center"><div style="font:900 60px Heebo;color:#7B3FF2">יום הפיצה של הביטקוין</div>
     <div class="num" style="font:900 200px Heebo;margin-top:10px">22.05</div><div style="font:400 50px Heebo;opacity:.6">כל שנה. כבר 16 שנה.</div></div>`, {A}
 {{ at: [7, 'אתם'], theme: 'dark', tr: 'whipL', ring: [540, 760, 0], noTop: true,
   mid: `{pizza_html(350)}` + G('אתם הייתם מוותרים?', 'h1', 960, 'font-size:100px') + G('ספרו בתגובות', 'h2 acc', 1100, 'font-size:60px'), {A}
];
'''
SC['landfill'] = f'''window.SCENES = [
 {{ at: [0, 'בוויילס'], theme: 'dark', ring: [540, 1000, 0],
   bp: [{{ d: [160, 820, 920, 820], label: 'NEWPORT // WALES', at: .2 }}],
   mid: `<div class="dump"><i style="left:0;width:520px;height:300px;background:#4a3d2f"></i><i style="left:300px;width:640px;height:400px;background:#5b4a37"></i><i style="left:180px;width:420px;height:200px;background:#3a3026"></i></div>`
     + G('מזבלה.', 'giga', 520, 'font-size:220px'), {A}
 {{ at: [0, 'מחצי מיליארד'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num acc cnt" data-pre="$" data-to="600" data-post="M" style="top:680px;font-size:260px">$0</div>` + G('קבורים בתוכה.', 'h1', 990, 'font-size:100px'), {COUNT}
 {{ at: [1, 'ב-2013'], theme: 'light', tr: 'whipR', ring: [540, 760, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:300px">2013</div>` + G('רגע של ניקיון', 'h2', 960, 'font-size:64px;opacity:.6'), {A}
 {{ at: [1, 'זרק'], theme: 'dark', tr: 'whipL', ring: [540, 790, 300],
   mid: `<div class="hdd"><span>HDD · 2013</span></div>` + G('לפח.', 'giga acc', 1150, 'font-size:180px'), {A}
 {{ at: [2, 'המפתחות'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('key', 540, 640, 460) + `<div class="row giga num" style="top:960px;font-size:220px">8,000 ₿</div>`, {A}
 {{ at: [3, 'נקבר'], theme: 'black', tr: 'whipR', ring: [540, 1000, 0],
   mid: `<div class="dump"><i style="left:0;width:520px;height:340px;background:#4a3d2f"></i><i style="left:300px;width:640px;height:420px;background:#5b4a37"></i></div>`
     + G('איפשהו כאן.', 'h1', 560, 'font-size:110px') + G('בערך.', 'h2 acc', 700, 'font-size:70px'), {A}
 {{ at: [4, 'יותר'], theme: 'light', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('clock', 540, 640, 460) + G('יותר מעשור.', 'giga', 960, 'font-size:180px'), {A}
 {{ at: [5, 'הציע'], theme: 'dark', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('money-bag', 540, 640, 460) + G('"תקבלו חלק"', 'h1', 1000, 'font-size:110px'), {A}
 {{ at: [5, 'סירבו'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row" style="top:700px"><span class="stamp">סירבו</span></div>`, {STAMP}
 {{ at: [6, 'בית'], theme: 'light', tr: 'whipR', ring: [540, 820, 0],
   mid: G('בית המשפט:', 'h1', 600, 'font-size:100px') + `<div class="row" style="top:760px"><span class="stamp">נדחה</span></div>`, {STAMP}
 {{ at: [6, 'מפסיק'], theme: 'dark', tr: 'whipL', ring: [540, 790, 300],
   mid: `<div class="hdd" style="opacity:.6"><span>GAME OVER?</span></div>` + G('אחרי יותר מעשור.', 'h1', 1180, 'font-size:100px'), {A}
 {{ at: [7, '8,000'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num" style="top:640px;font-size:220px">8,000 ₿</div>` + G('עדיין מתחת לזבל.', 'h1 acc', 920, 'font-size:100px'), {A}
 {{ at: [8, 'מה'], theme: 'light', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: G('מה הדבר הכי יקר', 'h1', 640, 'font-size:100px') + G('שזרקתם בטעות?', 'h1 acc', 780, 'font-size:100px') + G('ספרו בתגובות 👇', 'h2', 960, 'font-size:60px'), {A}
];
'''
SC['satoshi'] = f'''window.SCENES = [
 {{ at: [0, 'האיש'], theme: 'dark', ring: [540, 700, 260],
   mid: AV(540, 700) + `<div class="q" style="top:520px;opacity:.0"></div>` + G('הממציא של הביטקוין', 'h1', 1080, 'font-size:90px'), anim(lt, dur, el) {{ auto(lt, el); avatar(el, lt); }} }},
 {{ at: [0, 'משמונים'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num acc cnt" data-pre="$" data-to="80" data-post="B" style="top:700px;font-size:280px">$0</div>` + G('לפי ההערכה', 'h2', 1000, 'font-size:60px;opacity:.6'), {COUNT}
 {{ at: [0, 'ואף'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0],
   mid: `<div class="q" style="top:560px">?</div>` + G('ואין לו פנים.', 'h1', 1000, 'font-size:100px'), {A}
 {{ at: [1, 'ב-2008'], theme: 'light', tr: 'whipL', ring: [540, 760, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:300px">2008</div>` + G('אמצע המשבר הכלכלי', 'h2', 960, 'font-size:60px;opacity:.6'), {A}
 {{ at: [1, 'פרסם'], theme: 'light', tr: 'zoom', ring: [540, 800, 0],
   mid: `<div class="card paper" style="top:520px"><div class="h">Bitcoin: A Peer-to-Peer<br>Electronic Cash System</div><div class="a">Satoshi Nakamoto</div>
     <div class="l"></div><div class="l"></div><div class="l" style="width:60%"></div></div>` + G('9 עמודים.', 'giga acc', 1100, 'font-size:150px'), {A}
 {{ at: [2, 'ככה'], theme: 'dark', tr: 'whipR', ring: [540, 640, 230],
   mid: ICON('3d-coin', 540, 640, 470) + G('ככה זה התחיל.', 'h1', 980, 'font-size:110px'), {A}
 {{ at: [3, 'כרה'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('computer', 540, 640, 460) + `<div class="row giga num" style="top:960px;font-size:200px">1.1M ₿</div>`, {A}
 {{ at: [4, 'ב-2011'], theme: 'light', tr: 'whipL', ring: [540, 800, 0],
   mid: `<div class="card mail" style="top:560px"><div class="f">From: Satoshi · April 2011</div><div class="b">"I've moved on to other things."</div></div>` + G('ההודעה האחרונה.', 'h2 acc', 1050, 'font-size:64px'), {A}
 {{ at: [4, 'ונעלם'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: G('ונעלם.', 'giga', 700, 'font-size:260px'), anim(lt, dur, el) {{ auto(lt, el); const g = $(el, '.kt'); if (g) g.style.opacity = 1 - P(lt, .5, 1.2); }} }},
 {{ at: [5, 'מאז'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0],
   mid: `<div class="q" style="top:560px">?</div>` + G('15 שנה. אין תשובה.', 'h1', 1000, 'font-size:100px'), {A}
 {{ at: [6, 'רוב'], theme: 'dark', cls: 'icetint', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('lock', 540, 640, 460) + G('לא זזו. אף פעם.', 'h1', 980, 'font-size:110px'), {A}
 {{ at: [7, 'אם'], theme: 'black', cls: 'redtint', tr: 'whipL', ring: [540, 760, 0], noTop: true,
   mid: G('ואם הם יזוזו מחר?', 'h1', 680, 'font-size:100px') + G('ספרו בתגובות 👇', 'h2 acc', 860, 'font-size:60px'), {A}
];
'''
for name, scenes in SC.items():
    h = head.replace('daily_2026-11-08_v3_timing.js', f'viral_{name}_timing.js')
    open(os.path.join(HERE, f'viral_{name}.html'), 'w', encoding='utf-8').write(h + scenes + tail)
print('ok')
