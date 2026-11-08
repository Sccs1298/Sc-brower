"""פוסט ראשון – קרוסלת היכרות (6 שקפים). כותב את motion/carousel/data.js.
    python3 instagram_bot/brand/first_post_data.py && node instagram_bot/motion/carousel/shoot.js instagram_bot/motion/carousel/carousel.html OUT
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
B = '../../brand/'  # נתיב יחסי מ-carousel.html

card = lambda head, body, extra='': (
    f'<div class="card" style="margin-bottom:30px;text-align:right;{extra}">'
    f'<div style="font:900 44px Heebo;color:var(--acc2)">{head}</div>'
    f'<div style="font:700 44px/1.35 Heebo;margin-top:10px">{body}</div></div>')
lcard = lambda body: (
    '<div class="card" style="margin-bottom:34px;text-align:right;display:flex;gap:30px;align-items:center">'
    '<div style="flex:none;width:96px;height:96px;border-radius:50%;background:#9D5CFF;color:#fff;font:900 60px/96px Heebo;text-align:center">✓</div>'
    f'<div style="font:700 46px/1.35 Heebo">{body}</div></div>')

slides = [
    {"theme": "dark", "tag": "WELCOME",
     "bp": [{"c": [540, 420, 250]}, {"t": [540, 740, "CRYPTO // ILS"], "anchor": "middle"}],
     "html": f'<img src="{B}profile_A_purple.png" style="position:absolute;left:340px;top:220px;width:400px;height:400px;border-radius:50%;box-shadow:0 50px 80px rgba(0,0,0,.6)">'
             '<div class="c giga" style="top:800px;font-size:150px;letter-spacing:-2px;direction:ltr">CRYPTO ILS</div>'
             '<div class="c h2" style="top:980px;font-size:52px;padding:0 70px">חדשות הקריפטו של היום, בעברית שכולם מבינים.</div>'
             '<div class="c" style="top:1150px"><span style="display:inline-block;padding:12px 30px;border-radius:999px;background:rgba(157,92,255,.18);border:1.5px solid rgba(157,92,255,.5);font:700 34px Heebo">מה תמצאו כאן ←</span></div>'},
    {"theme": "light", "tag": "WHY",
     "html": '<div class="c h2" style="top:260px;color:#7B3FF2">למה פתחנו את העמוד</div>'
             '<div class="c p" style="top:380px;padding:0 90px;font-size:50px">רוב מה שכתוב על קריפטו הוא באנגלית, מלא במונחים, או בא ממישהו שמנסה למכור לכם מטבע.</div>'
             '<div class="c h1" style="top:720px;padding:0 80px;font-size:92px">רצינו מקום אחד שמספר מה קרה היום, ולמה זה חשוב לכם.</div>'},
    {"theme": "dark", "tag": "WHAT YOU GET",
     "html": '<div class="c h1" style="top:170px;font-size:90px">מה יהיה פה</div>'
             '<div class="cards" style="top:340px;flex-direction:column;gap:0">'
             + card('כל יום', 'סקירה של השוק, ועוד כמה חדשות שכדאי להכיר.')
             + card('כל 4 שעות', 'סטורי עם מצב השוק: ביטקוין, את׳ריום ו-20 המטבעות הגדולים.')
             + card('כשקורה משהו גדול', 'הסבר קצר מה קרה, ולמה זה משנה לכם.') + '</div>'},
    {"theme": "light", "tag": "HOW WE WORK",
     "html": '<div class="c h1" style="top:230px;font-size:90px">איך אנחנו עובדים</div>'
             '<div class="cards" style="top:500px;flex-direction:column;gap:0">'
             + lcard('כל מספר נבדק בשני מקורות לפחות. מה שלא הצלחנו לאמת, לא עולה.')
             + lcard('אנחנו לא ממליצים לקנות או למכור שום מטבע. אנחנו מספרים מה קרה.') + '</div>'},
    {"theme": "dark", "tag": "MARKET STORY",
     "html": '<div class="c h1" style="top:150px;font-size:76px">ככה נראה סטורי מצב השוק</div>'
             f'<div style="position:absolute;left:345px;top:290px;width:390px;height:844px;border-radius:56px;padding:14px;background:#0b0a0e;border:3px solid rgba(255,255,255,.18);box-shadow:0 50px 90px rgba(0,0,0,.6),0 0 80px rgba(157,92,255,.25);transform:rotate(-3deg)">'
             f'<img src="{B}story_sample.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:44px"></div>'
             '<div class="c h2 acc" style="top:1170px;font-size:46px">מתעדכן כל 4 שעות, ישר מהנתונים.</div>'},
    {"theme": "dark", "tag": "FOLLOW",
     "bp": [{"c": [540, 760, 330]}],
     "html": '<div class="c h1" style="top:230px;padding:0 80px;font-size:84px">יש לכם חבר ששואל כל שבוע מה קורה עם הביטקוין?</div>'
             '<div class="c giga acc" style="top:560px;font-size:120px;letter-spacing:-2px">תייגו אותו 👇</div>'
             '<div class="cards" style="top:800px;left:250px;right:250px"><div class="card" style="text-align:center">'
             f'<img src="{B}profile_A_purple.png" style="width:150px;height:150px;border-radius:50%">'
             '<div style="font:900 50px Heebo;direction:ltr;margin-top:12px">CRYPTO ILS</div>'
             '<div style="font:400 34px Heebo;opacity:.55;direction:ltr">@crypto_ils</div>'
             '<div style="margin-top:22px;padding:16px;border-radius:18px;background:#9D5CFF;font:700 38px Heebo">עקבו</div></div></div>'},
]
json.dump  # noqa
open(os.path.join(HERE, '..', 'motion', 'carousel', 'data.js'), 'w', encoding='utf-8').write(
    'window.CAROUSEL=' + json.dumps({"slides": slides, "coins": []}, ensure_ascii=False) + ';')
print('ok', len(slides))
