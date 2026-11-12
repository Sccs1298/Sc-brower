"""רילס יומי 12.11.2026 – סקירה → 3 עדכונים → הסיפור: המחיר של אנבידיה נקבע בבורסת קריפטו כשוול סטריט סגורה."""
import os
import make_viral as mv

A = mv.A
head = mv.head.replace('daily_2026-11-08_v3_timing.js', 'daily_2026-11-12_timing.js')
L = lambda t: f'<span dir="ltr" style="unicode-bidi:isolate">{t}</span>'


def card(at, num, place, col, big, small, cls='', theme='light'):
    return f""" {{ at: [{at}], theme: '{theme}', {cls}tr: 'whipR', ring: [540, 820, 0],
   mid: `<div class="card" style="top:520px;text-align:center"><div style="font:900 60px Heebo;color:{col}">{num} · {place}</div>
     <div style="font:900 92px/1.15 Heebo;margin-top:24px">{big}</div><div style="font:400 50px Heebo;opacity:.6;margin-top:20px">{small}</div></div>`, {A}
"""


PERP = (f'<div class="card" style="top:470px;padding:40px 46px;text-align:right">'
        f'<div style="display:flex;justify-content:space-between;align-items:center"><div style="font:800 40px Heebo;opacity:.55;direction:ltr">NVDA-PERP</div>'
        f'<div style="padding:8px 22px;border-radius:999px;background:rgba(43,208,127,.18);color:#2BD07F;font:800 32px Heebo">פתוח 24/7</div></div>'
        f'<div style="font:900 150px Heebo;margin-top:16px">{L("$178")}</div>'
        f'<div style="font:800 64px Heebo;color:#ff6b70">{L("-4%")}</div>'
        f'<div style="font:400 30px Heebo;opacity:.45;margin-top:18px">המחשה · מחירים לפי הדיווחים</div></div>')

SHUT = ('<div class="card" style="top:560px;text-align:center;padding:50px 40px"><div style="font:700 50px Heebo;opacity:.6">NYSE · NASDAQ</div>'
        '<div style="font:900 130px Heebo;color:#ff6b70;margin-top:10px">סגור</div><div style="font:400 46px Heebo;opacity:.6;margin-top:10px">יום ראשון</div></div>')

SCENES = f"""window.SCENES = [
 {{ at: [0, 'סקירת'], theme: 'black', ring: [540, 760, 260], noTop: true,
   bp: [{{ c: [540, 760, 300], at: .1 }}, {{ t: [540, 1120, 'DAILY // 12.11.2026'], anchor: 'middle', at: .2 }}],
   mid: G('סקירת הקריפטו', 'h1', 640, 'font-size:120px') + G('היומית', 'giga acc', 800, 'font-size:210px'), {A}
 {{ at: [1, 'השוק'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:280px;color:#ff6b70">{L('-0.7%')}</div>` + G('יום אפור. שוב.', 'h2', 960, 'font-size:64px'), {A}
 {{ at: [1, 'וביטקוין'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('3d-coin', 540, 620, 420) + `<div class="row h1 num" style="top:960px;font-size:110px">{L('$73.5K')}</div>`, {A}
{card("2, 'בדרום'", "01", "דרום קוריאה", "#7B3FF2", "GOPAX קפואה", "איום של האקרים, והמשיכות נעצרו")}
{card("3, 'בטורקיה'", "02", "טורקיה", "#7B3FF2", "״תהדקו את החוקים״", "דרישה של גוף פיקוח בינלאומי (FSB)")}
{card("4, 'Zcash'", "03", "Zcash", "#ff8a8e", "מתחת ל-1,000 דולר", "לראשונה מספטמבר", "cls: 'redtint', ", "dark")}
 {{ at: [5, 'והסיפור'], theme: 'black', tr: 'zoom', ring: [540, 900, 0], noTop: true,
   mid: G('הסיפור הגדול', 'h1', 640, 'font-size:120px') + G('אנבידיה', 'giga acc', 790, 'font-size:220px'), {A}
 {{ at: [6, 'וול'], theme: 'dark', tr: 'whipR', ring: [540, 820, 0],
   mid: `{SHUT}`, {A}
 {{ at: [6, 'חקירה'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('file-text', 540, 620, 420) + G('חקירה פנימית', 'h1', 950, 'font-size:100px') + G('(לפי הדיווחים)', 'h2', 1090, 'font-size:52px;opacity:.6'), {A}
 {{ at: [7, 'המחיר'], theme: 'dark', tr: 'zoom', ring: [540, 760, 0],
   mid: G('המחיר', 'giga', 600, 'font-size:190px') + G('לא מחכה.', 'giga acc', 810, 'font-size:190px'), {A}
 {{ at: [7, 'בבורסת'], theme: 'dark', cls: 'redtint', tr: 'whipR', ring: [540, 820, 0],
   mid: `{PERP}`, {A}
 {{ at: [7, 'עשרים'], theme: 'black', tr: 'zoom', ring: [540, 760, 0],
   mid: `<div class="row giga num acc" style="top:600px;font-size:300px">24/7</div>` + G('גם כשהבורסה ישנה.', 'h2', 950, 'font-size:64px'), {A}
 {{ at: [8, 'ירידה'], theme: 'dark', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0],
   mid: `<div class="row giga num" style="top:640px;font-size:280px;color:#ff6b70">{L('-4%')}</div>` + G('ויותר. לפני הפעמון.', 'h1', 960, 'font-size:96px'), {A}
 {{ at: [8, 'לפני'], theme: 'light', tr: 'whipL', ring: [540, 640, 230],
   mid: ICON('clock', 540, 620, 420) + G('וול סטריט עוד ישנה.', 'h1', 950, 'font-size:90px'), {A}
 {{ at: [9, 'ואתמול'], theme: 'black', cls: 'redtint', tr: 'zoom', ring: [540, 820, 0], noTop: true,
   mid: `<div class="row giga num" style="top:640px;font-size:280px;color:#ff6b70">{L('-7%')}</div>` + G('ויותר. סיבוב שני.', 'h1', 960, 'font-size:96px'), {A}
 {{ at: [10, 'אז'], theme: 'dark', tr: 'whipR', ring: [540, 760, 0], noTop: true,
   mid: G('סקנדל בסופ״ש?', 'h1', 600, 'font-size:110px') + G('המחיר הראשון', 'h1 acc', 750, 'font-size:110px') + G('מגיע מהקריפטו.', 'h1 acc', 890, 'font-size:110px'), {A}
];
"""
open(os.path.join(mv.HERE, 'daily_2026-11-12.html'), 'w', encoding='utf-8').write(head + SCENES + mv.tail)
print('ok')
