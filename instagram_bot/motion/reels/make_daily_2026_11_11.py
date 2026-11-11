"""רילס יומי 11.11.2026 – סקירה → 2 עדכונים → הסיפור הגדול מישראל: דיסקונט פותח קנייה של ביטקוין ואת'ריום באפליקציה."""
import os
import make_viral as mv

A, COUNT, STAMP = mv.A, mv.COUNT, mv.STAMP
head = mv.head.replace('daily_2026-11-08_v3_timing.js', 'daily_2026-11-11_timing.js')
L = lambda t: f'<span dir="ltr" style="unicode-bidi:isolate">{t}</span>'


def card(at, num, place, col, big, small, cls='', theme='light'):
    return f""" {{ at: [{at}], theme: '{theme}', {cls}tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="card" style="top:520px;text-align:center"><div style="font:900 60px Heebo;color:{col}">{num} · {place}</div>
     <div style="font:900 92px/1.15 Heebo;margin-top:24px">{big}</div><div style="font:400 50px Heebo;opacity:.6;margin-top:20px">{small}</div></div>`, {A}
"""


ROW = lambda sym, name, col: (f'<div style="display:flex;align-items:center;justify-content:space-between;padding:26px 10px;border-bottom:1.5px solid rgba(0,0,0,.08)">'
                              f'<div style="display:flex;align-items:center;gap:22px"><div style="width:84px;height:84px;border-radius:50%;background:{col};color:#fff;font:900 46px/84px Heebo;text-align:center">{sym}</div>'
                              f'<div style="font:800 52px Heebo">{name}</div></div>'
                              f'<div style="padding:16px 34px;border-radius:20px;background:#9D5CFF;color:#fff;font:800 40px Heebo">קנייה</div></div>')
APP = (f'<div class="card" style="top:470px;padding:40px 46px"><div style="font:700 38px Heebo;opacity:.5">אפליקציית הבנק · השקעות</div>'
       f'<div style="font:900 60px Heebo;margin:10px 0 18px">מטבעות דיגיטליים</div>{ROW("₿", "ביטקוין", "#F7931A")}{ROW("Ξ", "את׳ריום", "#627EEA")}'
       f'<div style="font:400 30px Heebo;opacity:.45;margin-top:18px">המחשה</div></div>')

SCENES = f"""window.SCENES = [
 {{ at: [0, 'סקירת'], theme: 'black', ring: [540, 760, 260], noTop: true,
   bp: [{{ c: [540, 760, 300], at: .1 }}, {{ t: [540, 1120, 'DAILY // 11.11.2026'], anchor: 'middle', at: .2 }}],
   mid: G('סקירת הקריפטו', 'h1', 640, 'font-size:120px') + G('היומית', 'giga acc', 800, 'font-size:210px'), {A}
 {{ at: [1, 'השוק'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('3d-coin', 540, 600, 420) + `<div class="row giga num" style="top:900px;font-size:230px;color:#ff6b70">{L('-1.4%')}</div>` + G('ביטקוין שוב מתחת ל-74 אלף', 'h2', 1160, 'font-size:56px'), {A}
{card("2, 'בארצות'", "01", "ארה״ב", "#7B3FF2", "אינפלציה חמה", "והחשש מהעלאת ריבית חזר")}
{card("3, 'ומשרד'", "02", "ארה״ב", "#ff8a8e", "MEXC מנותקת", "מהמערכת הפיננסית האמריקאית", "cls: 'redtint', ", "dark")}
 {{ at: [4, 'והסיפור'], theme: 'black', tr: 'zoom', ring: [540, 900, 0], noTop: true,
   mid: G('הסיפור הגדול', 'h1', 700, 'font-size:130px') + G('מישראל 🇮🇱', 'giga acc', 850, 'font-size:180px'), {A}
 {{ at: [5, 'בנק'], theme: 'light', tr: 'whipR', ring: [540, 820, 0],
   mid: `{APP}`, {A}
 {{ at: [5, 'מהאפליקציה'], theme: 'dark', tr: 'zoom', ring: [540, 760, 0],
   mid: G('ביטקוין.', 'giga', 600, 'font-size:200px') + G('בבנק.', 'giga acc', 820, 'font-size:200px'), {A}
 {{ at: [6, 'בלי'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('wallet', 540, 620, 440) + G('בלי ארנק. בלי בורסה.', 'h1', 960, 'font-size:90px'), {A}
 {{ at: [6, 'החל'], theme: 'dark', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row giga num acc" style="top:640px;font-size:300px">26.11</div>` + G('תאריך ההשקה', 'h2', 960, 'font-size:64px'), {A}
 {{ at: [7, 'הבנק'], theme: 'light', tr: 'whipR', ring: [540, 640, 230],
   mid: ICON('file-text', 540, 620, 440) + G('המס מנוכה במקור.', 'h1', 960, 'font-size:96px'), {A}
 {{ at: [7, 'לקזז'], theme: 'dark', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div style="position:absolute;top:540px;left:90px;right:90px;display:flex;gap:40px"><div style="flex:1;border-radius:40px;padding:50px 20px;text-align:center;background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04));border:1.5px solid rgba(255,255,255,.16)"><div style="font:700 46px Heebo;opacity:.65">הפסד בביטקוין</div><div style="font:900 130px Heebo;color:#ff6b70;margin-top:10px"><span dir="ltr" style="unicode-bidi:isolate">-₪</span></div></div><div style="flex:1;border-radius:40px;padding:50px 20px;text-align:center;background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04));border:1.5px solid rgba(255,255,255,.16)"><div style="font:700 46px Heebo;opacity:.65">רווח במניות</div><div style="font:900 130px Heebo;color:#2BD07F;margin-top:10px"><span dir="ltr" style="unicode-bidi:isolate">+₪</span></div></div></div>` + G('מתקזזים.', 'h1 acc', 1000, 'font-size:110px'), {A}
 {{ at: [8, 'לפי'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('crown', 540, 620, 440) + G('"הבנק הראשון"', 'h1', 960, 'font-size:110px') + G('(לפי הבנק)', 'h2', 1100, 'font-size:56px;opacity:.6'), {A}
 {{ at: [9, 'אתם'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: G('דרך הבנק', 'h1', 600, 'font-size:110px') + G('או דרך הבורסה?', 'h1 acc', 750, 'font-size:110px') + G('ספרו בתגובות 👇', 'h2', 920, 'font-size:60px'), {A}
];
"""
open(os.path.join(mv.HERE, 'daily_2026-11-11.html'), 'w', encoding='utf-8').write(head + SCENES + mv.tail)
print('ok')
