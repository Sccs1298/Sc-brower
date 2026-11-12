"""רילס יומי 10.11.2026 – "מה חדש היום" (שוק → 3 עדכונים → הסיפור הגדול: הלבנה דרך מטבעות מם → סיום משתנה)."""
import os
import make_viral as mv

A, COUNT, STAMP = mv.A, mv.COUNT, mv.STAMP
head = mv.head.replace('daily_2026-11-08_v3_timing.js', 'daily_2026-11-10_timing.js')
L = lambda t: f'<span dir="ltr" style="unicode-bidi:isolate">{t}</span>'


def card(at, num, place, col, big, small, cls='', theme='light'):
    return f""" {{ at: [{at}], theme: '{theme}', {cls}tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="card" style="top:520px;text-align:center"><div style="font:900 60px Heebo;color:{col}">{num} · {place}</div>
     <div style="font:900 92px/1.15 Heebo;margin-top:24px">{big}</div><div style="font:400 50px Heebo;opacity:.6;margin-top:20px">{small}</div></div>`, {A}
"""


MEME = lambda emoji, tick, col: (f'<div style="display:inline-block;width:250px;margin:14px;padding:26px 0;text-align:center;border-radius:34px;background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04));border:1.5px solid rgba(255,255,255,.16)">'
                                 f'<div style="font-size:90px">{emoji}</div><div style="font:900 44px Heebo;direction:ltr;color:{col}">${tick}</div></div>')

SCENES = f"""window.SCENES = [
 {{ at: [0, 'מה'], theme: 'black', ring: [540, 760, 260], noTop: true,
   bp: [{{ c: [540, 760, 300], at: .1 }}, {{ t: [540, 1120, 'DAILY // 10.11.2026'], anchor: 'middle', at: .2 }}],
   mid: G('מה חדש היום', 'h1', 640, 'font-size:120px') + G('בקריפטו', 'giga acc', 800, 'font-size:200px'), {A}
 {{ at: [1, 'השוק'], theme: 'dark', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:280px;color:#2BD07F">{L('+1.2%')}</div>` + G('ביטקוין סביב 75 אלף', 'h2', 960, 'font-size:64px'), {A}
{card("2, 'בוול'", "01", "וול סטריט", "#7B3FF2", "הדאו קפץ ביותר מאלף נקודות", "והקריפטו? כמעט לא זז")}
{card("3, 'היום'", "02", "ארה״ב", "#7B3FF2", "היום: מדד המחירים", "המספר שכל השוק מחכה לו")}
{card("4, 'וברוסיה'", "03", "רוסיה", "#ff8a8e", "תקרה: 300 אלף רובל", "בשנה, ורק ביטקוין, את׳ריום וטת׳ר", "cls: 'redtint', ", "dark")}
 {{ at: [5, 'והסיפור'], theme: 'black', tr: 'zoom', ring: [540, 900, 0], noTop: true,
   mid: G('הסיפור הגדול', 'h1', 760, 'font-size:130px') + G('של היום', 'giga acc', 900, 'font-size:190px'), {A}
 {{ at: [6, 'ההאקרים'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 700, 260],
   bp: [{{ t: [540, 1060, 'BINANCE HACK // LAUNDERING'], anchor: 'middle', at: .2 }}],
   mid: AV(540, 700, true) + G('האקרים של בינאנס', 'h1', 1080, 'font-size:96px'), anim(lt, dur, el) {{ auto(lt, el); avatar(el, lt); }} }},
 {{ at: [6, 'מטבעות'], theme: 'light', tr: 'whipR', ring: [540, 760, 0],
   mid: G('מכבסה חדשה:', 'h1', 600, 'font-size:100px') + G('מטבעות מם.', 'giga acc', 740, 'font-size:180px'), {A}
 {{ at: [7, 'הנפיקו'], theme: 'dark', tr: 'zoom', ring: [540, 760, 0],
   mid: `<div style="position:absolute;top:520px;left:60px;right:60px;text-align:center">` + `{MEME('🐵', '???', '#C4A1FF')}{MEME('🐸', '???', '#C4A1FF')}{MEME('🚀', '???', '#ffd166')}{MEME('🐶', '???', '#C4A1FF')}{MEME('🦊', '???', '#C4A1FF')}{MEME('🐻', '???', '#C4A1FF')}` + `</div>` + G('6 מטבעות. אפס ערך.', 'h1', 1150, 'font-size:84px') + G('(המחשה)', 'h2', 1250, 'font-size:40px;opacity:.5'), {A}
 {{ at: [7, 'אילון'], theme: 'light', tr: 'whipL', ring: [540, 760, 0],
   mid: G('"אילון 2028"', 'giga', 640, 'font-size:170px') + G('(למאסק אין שום קשר)', 'h2', 880, 'font-size:60px;opacity:.6'), {A}
 {{ at: [7, 'שעות'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('clock', 540, 620, 460) + G('3 שעות ולפח.', 'h1', 960, 'font-size:110px'), {A}
 {{ at: [8, 'יותר'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num" style="top:640px;font-size:280px">{L('$3B+')}</div>` + G('עדיין לא הולבנו.', 'h1', 940, 'font-size:100px'), {A}
 {{ at: [9, 'מכירים'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: G('קונים כל מטבע', 'h1', 600, 'font-size:100px') + G('עם הפרצוף של אילון?', 'h1 acc', 740, 'font-size:100px') + G('תשלחו לו את זה.', 'h2', 900, 'font-size:64px'), {A}
];
"""
open(os.path.join(mv.HERE, 'daily_2026-11-10.html'), 'w', encoding='utf-8').write(head + SCENES + mv.tail)
print('ok')
