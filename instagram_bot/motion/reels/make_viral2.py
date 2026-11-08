"""סבב 2 של רילסים ויראליים (לפי נתוני צפיות אמיתיים מ-Apify): ליקוויד / קוונטים / Cede & Co.
    python3 make_viral2.py → viral_liquid.html, viral_quantum.html, viral_cede.html
"""
import os
import make_viral as mv  # noqa: E402 (מייצר גם את סבב 1 – לא מזיק)

HERE = mv.HERE
A, COUNT, STAMP = mv.A, mv.COUNT, mv.STAMP
CSS = '''
  .node { position:absolute; width:300px; padding:40px 0; border-radius:34px; text-align:center; font:900 52px Heebo; direction:ltr;
    background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.04)); border:2px solid rgba(255,255,255,.2); }
  .bridge { position:absolute; height:14px; border-radius:7px; background:repeating-linear-gradient(90deg,#9D5CFF 0 40px,transparent 40px 60px); }
  .chip { position:absolute; left:240px; top:470px; width:600px; height:600px; border-radius:40px; display:grid; grid-template-columns:repeat(8,1fr); gap:22px; padding:50px;
    background:linear-gradient(160deg,#20202a,#0c0c10); border:2px solid rgba(157,92,255,.5); box-shadow:0 0 90px rgba(157,92,255,.35); }
  .chip i { border-radius:50%; background:radial-gradient(circle at 35% 35%,#d8c2ff,#9D5CFF 60%,#4c1d95); box-shadow:0 0 18px #9D5CFF; }
  .pie { position:absolute; left:290px; top:440px; width:500px; height:500px; border-radius:50%;
    background:conic-gradient(#ff5a5f 0 33.3%, rgba(255,255,255,.12) 33.3% 100%); box-shadow:0 40px 80px rgba(0,0,0,.5); }
  .cert { direction:ltr; text-align:center; border:6px double #b08d3c !important; background:#fbf6e8 !important; color:#3b2f12; }
  .cert .t { font:700 50px "DejaVu Serif", serif; letter-spacing:4px; } .cert .o { font:400 34px "DejaVu Serif", serif; margin-top:30px; opacity:.7; }
  .cert .n { font:900 84px "DejaVu Serif", serif; margin-top:10px; color:#7a1f1f; }
  .chain { position:absolute; left:200px; right:200px; top:420px; }
  .chain div { margin:0 0 26px; padding:34px; border-radius:30px; text-align:center; font:800 68px Heebo;
    background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04)); border:1.5px solid rgba(255,255,255,.16); }
  .chain div.me { background:#9D5CFF; color:#fff; border:0; } .chain div.cede { color:#ffd166; direction:ltr; }
'''
head = mv.head.replace('</style>', CSS + '</style>')
X = lambda s: s  # noqa

SC = {}
SC['liquid'] = f'''window.SCENES = [
 {{ at: [0, 'מישהו'], theme: 'dark', ring: [540, 640, 230], mid: AV(540, 680, true) + G('הדפיס ביטקוין.', 'h1', 1060, 'font-size:110px'), anim(lt, dur, el) {{ auto(lt, el); avatar(el, lt); }} }},
 {{ at: [0, '4,000'], theme: 'black', tr: 'zoom', ring: [540, 640, 230], noTop: true,
   mid: ICON('3d-coin', 540, 600, 420) + `<div class="row giga num cnt" data-pre="" data-to="4000" data-post=" ₿" style="top:900px;font-size:220px">0</div>` + G('מזויפים.', 'h1 acc', 1150, 'font-size:100px'), {COUNT}
 {{ at: [1, 'שווי'], theme: 'dark', cls: 'redtint', tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="row giga num cnt" data-pre="$" data-to="320" data-post="M" style="top:680px;font-size:280px">$0</div>` + G('ביטקוין אמיתי.', 'h1', 980, 'font-size:100px'), {COUNT}
 {{ at: [2, 'נפרץ'], theme: 'light', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('shield', 540, 620, 440) + G('הביטקוין? בסדר גמור.', 'h1', 960, 'font-size:96px'), {A}
 {{ at: [3, 'ליקוויד'], theme: 'dark', tr: 'whipL', ring: [540, 760, 0],
   bp: [{{ t: [540, 1060, 'SIDECHAIN // BRIDGE'], anchor: 'middle', at: .2 }}],
   mid: `<div class="node" style="left:80px;top:640px">BITCOIN</div><div class="bridge" style="left:380px;right:380px;top:720px"></div><div class="node" style="right:80px;top:640px;color:#C4A1FF">LIQUID</div>`
     + G('הפרצה הייתה בגשר.', 'h1', 900, 'font-size:96px'), {A}
 {{ at: [4, 'שם'], theme: 'light', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('locker', 540, 620, 460) + G('1 מטבע = 1 ביטקוין בכספת', 'h1', 960, 'font-size:80px'), {A}
 {{ at: [5, 'באג'], theme: 'dark', cls: 'redtint', tr: 'whipR', ring: [540, 640, 230],
   mid: ICON('3d-coin', 540, 600, 400) + `<div class="row" style="top:880px"><span class="stamp" style="border-color:#2BD07F;color:#2BD07F">VALID ✓</span></div>` + G('(לא מגובה בכלום)', 'h2', 1120, 'font-size:56px;opacity:.7'), {STAMP}
 {{ at: [6, 'משכו'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('locker', 540, 620, 460) + G('הכספת התרוקנה.', 'h1 acc', 960, 'font-size:110px'), {A}
 {{ at: [6, 'החזירו'], theme: 'light', tr: 'whipL', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:220px">3,400 ₿</div>` + G('חזרו אחרי יום.', 'h1', 920, 'font-size:100px'), {A}
 {{ at: [7, 'כמעט'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num" style="top:640px;font-size:240px">598 ₿</div>` + G('לא חזרו.', 'h1 acc', 940, 'font-size:110px'), {A}
 {{ at: [8, 'אתם'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: G('גשר או ביטקוין עצמו?', 'h1', 680, 'font-size:100px') + G('ספרו בתגובות 👇', 'h2 acc', 850, 'font-size:60px'), {A}
];
'''
SC['quantum'] = f'''window.SCENES = [
 {{ at: [0, 'גוגל'], theme: 'light', ring: [540, 760, 0],
   mid: `<div class="row giga" style="top:620px;font-size:250px;direction:ltr">Google</div>` + G('פרסמה מחקר.', 'h1', 920, 'font-size:100px'), {A}
 {{ at: [0, 'שמפחיד'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: G('מחקר שמפחיד', 'h1', 640, 'font-size:110px') + G('כל מחזיק ביטקוין.', 'h1 acc', 790, 'font-size:110px'), {A}
 {{ at: [1, 'קוונטי'], theme: 'dark', tr: 'whipR', ring: [540, 770, 300],
   mid: `<div class="chip">` + '<i></i>'.repeat(64) + `</div>` + G('מחשב קוונטי', 'h1', 1150, 'font-size:100px'), {A}
 {{ at: [1, 'מחצי מיליון'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num acc" style="top:640px;font-size:250px">500K</div>` + G('קיוביטים. זה מה שצריך.', 'h1', 940, 'font-size:90px'), {A}
 {{ at: [2, 'מיליונים'], theme: 'light', tr: 'whipL', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:620px;font-size:230px;text-decoration:line-through;opacity:.45">20M</div>` + G('ההערכה הקודמת.', 'h1', 920, 'font-size:100px'), {A}
 {{ at: [3, 'חשוף'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('clock', 540, 620, 460) + G('9 דקות.', 'giga', 940, 'font-size:220px'), {A}
 {{ at: [4, 'בסכנה'], theme: 'dark', tr: 'whipR', ring: [540, 690, 270],
   mid: `<div class="pie"></div>` + G('שליש מכל הביטקוין.', 'h1', 1040, 'font-size:100px') + G('6.9 מיליון ₿, לפי המחקר', 'h2', 1180, 'font-size:54px;opacity:.7'), {A}
 {{ at: [5, 'החדשות'], theme: 'light', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('shield', 540, 620, 440) + G('רגע, לא להיבהל.', 'h1', 960, 'font-size:100px'), {A}
 {{ at: [5, 'רחוקים'], theme: 'dark', cls: 'icetint', tr: 'whipL', ring: [540, 770, 300],
   mid: `<div class="chip" style="opacity:.35">` + '<i></i>'.repeat(64) + `</div>` + G('היום: רחוק מאוד מזה.', 'h1', 1150, 'font-size:96px'), {A}
 {{ at: [6, 'וגוגל'], theme: 'black', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num acc" style="top:640px;font-size:300px">2029</div>` + G('גוגל כבר מתכוננת.', 'h1', 960, 'font-size:100px'), {A}
 {{ at: [7, 'אתם'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: ICON('lock', 540, 560, 380) + G('ביטקוין יספיק בזמן?', 'h1', 860, 'font-size:100px') + G('ספרו בתגובות 👇', 'h2 acc', 1010, 'font-size:60px'), {A}
];
'''
SC['cede'] = f'''window.SCENES = [
 {{ at: [0, 'המניות'], theme: 'light', ring: [540, 640, 230],
   mid: ICON('chart', 540, 620, 460) + G('המניות שלכם', 'h1', 960, 'font-size:110px'), {A}
 {{ at: [0, 'רשומות'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0],
   mid: G('לא על השם שלכם.', 'giga', 700, 'font-size:150px'), {A}
 {{ at: [1, 'בעל'], theme: 'light', tr: 'whipR', ring: [540, 800, 0],
   mid: `<div class="card cert" style="top:560px"><div class="t">STOCK CERTIFICATE</div><div class="o">Registered holder</div><div class="n">???</div></div>` + G('בעל המניות הכי גדול', 'h2', 1080, 'font-size:64px'), {A}
 {{ at: [1, 'Cede & Co'], theme: 'light', tr: 'zoom', ring: [540, 800, 0],
   mid: `<div class="card cert" style="top:560px"><div class="t">STOCK CERTIFICATE</div><div class="o">Registered holder</div><div class="n">CEDE &amp; CO.</div></div>` + G('נעים להכיר.', 'h1 acc', 1080, 'font-size:100px'), {A}
 {{ at: [2, 'רוב'], theme: 'dark', tr: 'whipL', ring: [540, 760, 0],
   mid: `<div class="q" style="top:560px">?</div>` + G('אף פעם לא שמעתם?', 'h1', 1000, 'font-size:100px'), {A}
 {{ at: [3, 'מסלקת'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('locker', 540, 620, 460) + G('מיליוני משקיעים. שם אחד.', 'h1', 960, 'font-size:88px'), {A}
 {{ at: [4, 'הכלכליים'], theme: 'light', tr: 'whipR', ring: [540, 800, 0],
   mid: G('"בעלים כלכליים"', 'h1', 620, 'font-size:120px') + G('ככה קוראים לכם.', 'h1 acc', 800, 'font-size:100px'), {A}
 {{ at: [4, 'עוברים'], theme: 'dark', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="chain"><div>החברה</div><div class="cede">CEDE &amp; CO.</div><div>הברוקר</div><div class="me">אתם</div></div>`, {A}
 {{ at: [5, 'מתווכים'], theme: 'dark', cls: 'redtint', tr: 'whipL', ring: [540, 820, 0],
   mid: G('חוקי. עובד.', 'h1', 640, 'font-size:110px') + G('וכמה ידיים באמצע.', 'h1 acc', 790, 'font-size:110px'), {A}
 {{ at: [6, 'בביטקוין'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('key', 540, 620, 460) + G('המפתח אצלכם.', 'h1', 960, 'font-size:110px'), {A}
 {{ at: [6, 'באמצע'], theme: 'light', tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="chain" style="top:560px"><div>ביטקוין</div><div class="me">אתם</div></div>` + G('בלי אף אחד באמצע.', 'h1 acc', 1000, 'font-size:96px'), {A}
 {{ at: [7, 'ידעתם'], theme: 'black', tr: 'zoom', ring: [540, 760, 0], noTop: true,
   mid: G('ידעתם?', 'giga', 600, 'font-size:220px') + G('ספרו בתגובות 👇', 'h2 acc', 880, 'font-size:60px'), {A}
];
'''
for name, scenes in SC.items():
    h = head.replace('daily_2026-11-08_v3_timing.js', f'viral_{name}_timing.js')
    open(os.path.join(HERE, f'viral_{name}.html'), 'w', encoding='utf-8').write(h + scenes + mv.tail)
print('ok2')
