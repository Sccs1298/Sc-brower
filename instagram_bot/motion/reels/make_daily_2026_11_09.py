"""רילס יומי 09.11.2026 – "סקירה יומית" (שוק → 3 עדכונים → הסיפור הגדול → סיום משתנה)."""
import os
import make_viral as mv

A, COUNT, STAMP = mv.A, mv.COUNT, mv.STAMP
head = mv.head.replace('daily_2026-11-08_v3_timing.js', 'daily_2026-11-09_timing.js')


def card(at, num, place, col, big, small, cls='', theme='light'):
    return f""" {{ at: [{at}], theme: '{theme}', {cls}tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="card" style="top:520px;text-align:center"><div style="font:900 60px Heebo;color:{col}">{num} · {place}</div>
     <div style="font:900 92px/1.15 Heebo;margin-top:24px">{big}</div><div style="font:400 50px Heebo;opacity:.6;margin-top:20px">{small}</div></div>`, {A}
"""


SCENES = f"""window.SCENES = [
 {{ at: [0, 'סקירת'], theme: 'black', ring: [540, 760, 260], noTop: true,
   bp: [{{ c: [540, 760, 300], at: .1 }}, {{ t: [540, 1120, 'DAILY // 09.11.2026'], anchor: 'middle', at: .2 }}],
   mid: G('סקירת הקריפטו', 'h1', 640, 'font-size:120px') + G('היומית', 'giga acc', 800, 'font-size:210px'), {A}
 {{ at: [1, 'השוק'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:280px;color:#ff6b70"><span dir="ltr" style="unicode-bidi:isolate">-3.1%</span></div>` + G('את׳ריום חטף 6.5%', 'h2', 960, 'font-size:64px'), {A}
{card("2, 'בארצות'", "01", "ארה״ב", "#7B3FF2", "סוכן FBI גנב קריפטו", "2.47 מיליון דולר מ-35 תיקי חקירה")}
 {{ at: [2, 'שגנב'], theme: 'dark', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('key', 540, 620, 460) + G('המפתחות היו אצלו.', 'h1', 960, 'font-size:110px'), {A}
{card("3, 'בדרום'", "02", "דרום קוריאה", "#7B3FF2", "יותר כסף לארנקים קרים", "אחרי הפריצה לבינאנס")}
{card("4, 'ובסולנה'", "03", "סולנה", "#ff8a8e", "מבטלים פיצ׳ר מסוכן", "דרכו נגנבו 270 מיליון דולר מ-Drift", "cls: 'redtint', ", "dark")}
 {{ at: [5, 'והסיפור'], theme: 'black', tr: 'zoom', ring: [540, 900, 0], noTop: true,
   mid: G('הסיפור הגדול', 'h1', 760, 'font-size:130px') + G('של היום', 'giga acc', 900, 'font-size:190px'), {A}
 {{ at: [6, 'ביטקוין'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 640, 230],
   bp: [{{ d: [160, 1060, 920, 1060], label: 'BTC · $73,700', at: .2 }}],
   mid: ICON('3d-coin', 540, 620, 460) + G('ביטקוין מתחת ל', 'h2', 930, 'font-size:70px') + `<div class="row giga num" style="top:1000px;font-size:220px">$74K</div>`, {A}
 {{ at: [6, 'השפל'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('chart', 540, 620, 460) + G('שפל של חודשיים.', 'h1', 960, 'font-size:110px'), {A}
 {{ at: [7, 'עפו'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num" style="top:660px;font-size:300px"><span dir="ltr" style="unicode-bidi:isolate">$1B</span></div>` + G('נמחקו ביממה.', 'h1', 980, 'font-size:100px'), {A}
 {{ at: [7, 'ממונפות'], theme: 'dark', cls: 'redtint', tr: 'whipR', ring: [540, 820, 0],
   mid: G('מי שהיה ממונף', 'h1', 600, 'font-size:100px') + `<div class="row" style="top:780px"><span class="stamp">עף</span></div>`, {STAMP}
 {{ at: [8, 'וקרנות'], theme: 'light', tr: 'zoom', ring: [540, 640, 230],
   mid: ICON('money-bag', 540, 620, 460) + `<div class="row giga num" style="top:960px;font-size:200px"><span dir="ltr" style="unicode-bidi:isolate">$1.28B</span></div>` + G('יצאו מקרנות הביטקוין בשבוע', 'h2', 1180, 'font-size:54px'), {A}
 {{ at: [9, 'יש'], theme: 'dark', tr: 'whipL', ring: [540, 760, 0], noTop: true,
   mid: G('"ביטקוין רק עולה"', 'h1', 620, 'font-size:110px') + G('תשלחו לו את זה.', 'h1 acc', 790, 'font-size:100px') + G('@crypto_ils', 'h2', 960, 'font-size:56px;direction:ltr'), {A}
];
"""
open(os.path.join(mv.HERE, 'daily_2026-11-09.html'), 'w', encoding='utf-8').write(head + SCENES + mv.tail)
print('ok')
