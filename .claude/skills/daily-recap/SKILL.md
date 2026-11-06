---
name: daily-recap
description: Produce today's Hebrew crypto "daily market recap" for the @crypto_ils Instagram page - a coinsauce-style 5-slide carousel (and a reel when licensed video + commercial voice are available) built from real, double-sourced data, quality-checked frame by frame, and uploaded to Google Drive for the owner's approval. Use when asked for a daily recap, סיכום שוק, today's post, or /daily-recap.
---

# סיכום שוק יומי – CRYPTO ILS

המטרה: תוצר אחד חזק ביום, על **הסיפור הכי גדול של היממה**, בפורמט שהוכח אצל coinsauce.
קרא קודם את `CLAUDE.md` בשורש הריפו (מותג, כללים, חיבורים, מה למדנו).

## כללי ברזל
1. **כל עובדה ומספר – מ-2 מקורות לפחות** (CoinGecko + כותרת חדשות, או שתי כותרות ממקורות שונים). מה שלא אומת – לא נכנס. אל תנחש.
2. **לא מפרסמים לאינסטגרם בלי אישור מפורש של הבעלים** בהודעה הנוכחית.
3. **אין תמונות מזויפות/ערוכות של אנשים אמיתיים.** ממים קלאסיים מ-imgflip – מותר.
4. **רק מדיה מורשית:** תמונות CC0/Public Domain (Openverse), וידאו רק עם רישיון מסחרי (Pexels). Mixkit מסומן "Personal use only" – אסור.
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

### 3. כתיבה (עברית חדה, לא "AI")
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
ממים מומלצים (שמות imgflip): This Is Fine, Sad Pablo Escobar, Panik Kalm Panik (בלי טקסט פנימי), Disaster Girl, Hide the Pain Harold, Two Buttons.

### 5. בדיקת איכות (חובה – לפני מסירה)
- פתח את `$W/sheet.jpg` (Read) ובדוק: עברית קריאה ובכיוון נכון, אין שבירות שורה יתומות, המם מתאים לכיתוב, התמונה לא סותרת את הטקסט, המספרים זהים ל-market.json.
- תקן ובנה מחדש עד שזה נקי.

### 6. רילס (רק אם יש תנאים)
דרוש: מפתח Pexels (וידאו מורשה) + ElevenLabs במסלול עם רישיון מסחרי. אם חסר – **דלג ודווח**.
המנוע: `instagram_bot/newsreel.py` (spec עם vo_json/vo_mp3/scenes). קריינות: ElevenLabs `eleven_v3`, `language_code: he`, endpoint `with-timestamps` (המפתח מוזרק אוטומטית ע"י ה-proxy, header `xi-api-key`). אחרי רינדור – חלץ פריימים ובדוק כמו בשלב 5.

### 7. מסירה לדרייב
1. צור תיקייה: `mcp__Google_Drive__create_file` (mimeType folder) בשם `YYYY-MM-DD – <נושא>` תחת התיקייה הראשית `1oLdCvgVtPt_C8nqVm09yBm4i3uwyNMls`.
2. לכל קובץ: פתח session עם `COMPOSIO_PROXY_EXECUTE` (toolkit `googledrive`, POST `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, body `{"name":..,"parents":[folder]}`, header `X-Upload-Content-Type`) → העלה מקומית: `curl -s -X PUT --data-binary @FILE -H "Content-Type: ..." "<location>"`.
3. העלה גם את `caption.txt`.

### 8. דיווח לבעלים
קישור לתיקייה, הסיפור שנבחר ולמה, המקורות לכל מספר, מה נבדק/מה הנחה, ומה דולג (למשל רילס – חסר מפתח). שאל: לאשר פרסום / מה לשנות.
