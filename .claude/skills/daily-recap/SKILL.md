---
name: daily-recap
description: Produce today's Hebrew crypto daily recap for @crypto_ils - a coinsauce-style 5-slide carousel AND a fast cinematic explainer reel (instagram_bot/motion engine, Instagram safe-zone captions) on the same story, built from real double-sourced data, quality-checked frame by frame, and uploaded to Google Drive for the owner's approval. Use when asked for a daily recap, סיכום שוק, today's post, or /daily-recap.
---

# סיכום שוק יומי – CRYPTO ILS

המטרה: תוצר אחד חזק ביום, על **הסיפור הכי גדול של היממה**, בפורמט שהוכח אצל coinsauce.
קרא קודם את `CLAUDE.md` בשורש הריפו (מותג, כללים, חיבורים, מה למדנו).

## כללי ברזל
1. **כל עובדה ומספר – מ-2 מקורות לפחות** (CoinGecko + כותרת חדשות, או שתי כותרות ממקורות שונים). מה שלא אומת – לא נכנס. אל תנחש.
2. **לא מפרסמים לאינסטגרם בלי אישור מפורש של הבעלים** בהודעה הנוכחית.
3. **אין תמונות מזויפות/ערוכות של אנשים אמיתיים.** ממים קלאסיים מ-imgflip – מותר.
4. **רק מדיה מורשית:** תמונות CC0/Public Domain (Openverse), וידאו רק עם רישיון מסחרי (Pixabay). Mixkit מסומן "Personal use only" – אסור.
5. אם חיבור/מפתח לא עובד – **עצור ודווח לבעלים מה חסר**. לא לעקוף חסימות ולא להמציא תחליף.
6. ציין תמיד מה **נבדק** ומה **הנחה**.

## שלבים

### 1. נתונים
```bash
W=/tmp/daily-recap/$(date +%F); mkdir -p $W
python3 .claude/skills/daily-recap/fetch_market.py $W
```
קרא את `$W/market.json`: `global` (שינוי 24ש', הפסד/רווח בדולרים), `coins`, `headlines`.

### 2. בחירת סיפור ואימות
- בחר את הסיפור עם **המספר הכי גדול ומפתיע** (נמחקו X מיליארד, האק של X, ETF משך X). מה שעובד אצל coinsauce: מספר דרמטי + "נבל"/סיבה ברורה + הומור.
- לכל עובדה בטקסט – רשום לעצמך את 2 המקורות. אם צריך, הרחב חיפוש: `news.google.com/rss/search?q=...`.
- זמנים: כתוב "ביממה האחרונה"/"היום" רק אם זה נכון לשעת ההפקה.

### 3. כתיבה (עברית חדה וצינית, לא "AI")
טון מחייב (החלטת הבעלים): **חד וציני** – כמו חבר שמבין בשוק ולא מתרגש מהייפ. ציניות על השוק/ההייפ/המינוף, לא על הקהל. אף פעם לא על חשבון דיוק.
- **cover_head**: 1–3 מילים, הנושא ("שוק הקריפטו", "בינאנס", "ביטקוין").
- **cover_sub**: הפרט המפתיע עם המספר ("איבד כ-175 מיליארד דולר ביממה").
- **meme captions**: משפט אחד, ציני-מצחיק, בגרשיים כשזה "ציטוט" ("זה רק תיקון בריא").
- **sauce**: 2 פסקאות קצרות, עובדות + סיבה, בלי מליצות. מספרים עגולים ומדויקים.
- **caption**: שורת הוק + 2–3 משפטים + שאלה לקהל + "⚠️ אין לראות בתוכן ייעוץ השקעות." + 5–8 האשטגים.
- הימנע: "חשוב לציין", "בעולם הקריפטו המרתק", אימוג'י בכל שורה, ניסוחים מתורגמים.

### 4. קרוסלה
כתוב `$W/content.json` (ראה המבנה בראש `build_carousel.py`), ואז:
```bash
python3 .claude/skills/daily-recap/build_carousel.py $W
```
**ממים – עדיפות לזזים** (החלטת הבעלים): אם יש מקור GIF מחובר (ראה CLAUDE.md) – השתמש במם זז; אחרת סטטי מ-imgflip.
ממים סטטיים מומלצים (שמות imgflip): This Is Fine, Sad Pablo Escobar, Panik Kalm Panik (בלי טקסט פנימי), Disaster Girl, Hide the Pain Harold, Two Buttons.
אל תחזור על אותו מם שני ימים ברצף.

### 5. בדיקת איכות (חובה – לפני מסירה)
- פתח את `$W/sheet.jpg` (Read) ובדוק: עברית קריאה ובכיוון נכון, אין שבירות שורה יתומות, המם מתאים לכיתוב, התמונה לא סותרת את הטקסט, המספרים זהים ל-market.json.
- תקן ובנה מחדש עד שזה נקי.

### 6. רילס (חובה כל יום) – מנוע "אקספליינר קולנועי" (התבנית האחרונה: v4, 5/10 ועולה)
קרא קודם ב-CLAUDE.md את "7 עקרונות הרילס" ו"אזור בטוח". **התבנית לשכפול: `instagram_bot/motion/reels/binhack4.html` (סגול, 34ש', 27 שוטים).**
1. **תסריט** (`$W/reel_script.json` – רשימת משפטים קצרים, 12–14 משפטים, ~65 מילים, **25–35 שניות**):
   הוק במספר ("שישה פסיק שלושה מיליארד דולר.") → טוויסט קצר → "בואו נסביר." → הסבר בצעדים → הנבל/הסיבה → "החלק שכדאי לזכור" (לקח) → "עקבו, ותבינו קריפטו לפני כולם."
   מספרים במילים; ראשי תיבות באותיות ("ה אף בי איי") + `--replace` לתצוגה.
2. **קול + ביט:**
   `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 instagram_bot/motion/voice_beat.py $W/reel_script.json $W/reel --bpm 120 --rate +25% --gap 0.0 --impacts 0,1 --replace '{"ה אף בי איי":"ה-FBI"}' --timing instagram_bot/motion/reels/<slug>_timing.js`
   (אברי דרך edge-tts = **טיוטה בלבד** עד Azure F0 – ראה CLAUDE.md.)
3. **שוטים:** העתק את binhack3.html ל-`reels/<slug>.html`, החלף את קובץ ה-timing ואת `SCENES`. **שוט חדש כל ~1.3ש'**, מתחלף על מילה: `at:[מספר_משפט,'מילה']`.
   אוצר מילים: `G('טקסט','giga',top,'font-size:..')` מילה/מספר ענק · `ICON('locker'|'fire'|'wallet'|'computer'|'key'|'clock'|'3d-coin'|...,cx,cy,w)` · `card` (UI: ארנק/משרה/מעקב) · `AV(x,y,evil)` דמות · `bp:[...]` שרטוט טכני · `ring:[x,y,r]` Match Cut · `cls:'redtint'|'icetint'` צבע לפי רגש · `tr:'zoom'|'whipR'|'whipL'`.
   **ניסוח הטקסט על המסך (פידבק הבעלים):** הטקסט הגדול **לא חוזר על הקריינות** – הוא "כותרת" שמוסיפה עקיצה. הכתוביות כבר אומרות את המילים.
   דוגמאות: "20 דקות" + "פחות מפרק בנטפליקס" · "שוד המאה." · "ראיון עבודה. כן, באמת." · "טוב מכדי להיות אמיתי." · "קובץ אחד. זהו." · "קפוא. בלחיצת כפתור." · "״זה לא אנחנו״ (כמובן)" · "זה לא ביטקוין. זה מספר במסך." · "אין מפתח? אין ביטקוין."
   כללים: עד 4 מילים בשורה · ציני על השוק/המערכת, לא על הקהל · עובדות רק ממה שאומת · לא להתחיל שורה בסימן (=, -) – נשבר ב-RTL.
   קואורדינטות 1080x1920 "לוגיות" (המנוע מכווץ ל-82% לאזור הבטוח). תוכן בין y≈430 ל-y≈1350; לא לשים כלום מתחת.
4. **בדיקה לפני רינדור:** `node instagram_bot/motion/shots.js $PWD/instagram_bot/motion/reels/<slug>.html OUT_DIR "t1,t2,..."` (צילומי מסך בזמנים) – בדוק: אין חפיפה עם הכתוביות, אין מילים שגולשות מהמסך, טקסט לא נחתך.
5. **רינדור:** `node instagram_bot/motion/render.js reels/<slug>.html $W/reel/silent60.mp4 <total> 60` ואז
   `ffmpeg -i silent60.mp4 -i mix.wav -vf "tmix=frames=2:weights='1 1',fps=30" -crf 22 ...` (+ גרסה עם `vo_sfx.wav` בלי ביט).
6. אייקונים חדשים: 3dicons.co (CC0) premium → rembg (ראה `instagram_bot/assets/icons3d/SOURCE.txt`).

### 7. מסירה לדרייב
1. צור תיקייה: `mcp__Google_Drive__create_file` (mimeType folder) בשם `YYYY-MM-DD – <נושא>` תחת התיקייה הראשית `1oLdCvgVtPt_C8nqVm09yBm4i3uwyNMls`.
2. לכל קובץ: פתח session עם `COMPOSIO_PROXY_EXECUTE` (toolkit `googledrive`, POST `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, body `{"name":..,"parents":[folder]}`, header `X-Upload-Content-Type`) → העלה מקומית: `curl -s -X PUT --data-binary @FILE -H "Content-Type: ..." "<location>"`.
3. העלה גם את `caption.txt`.

### 8. דיווח לבעלים
קישור לתיקייה, הסיפור שנבחר ולמה, המקורות לכל מספר, מה נבדק/מה הנחה, ומה דולג (למשל רילס – חסר מפתח). שאל: לאשר פרסום / מה לשנות.
