# 🤖 בוט אינסטגרם לקריפטו בעברית

הבוט מפרסם **2 פוסטים ביום** באופן אוטומטי לגמרי:

| מתי | מה |
|---|---|
| ~08:00 | **עדכון שוק** – טבלת מחירים (BTC, ETH, SOL, XRP, BNB, DOGE), שינוי ב-24 שעות, מדד פחד ותאוותנות |
| ~19:00 | **לומדים קריפטו** – הסבר פשוט על מושג (Seed Phrase, Staking, DCA ועוד 30 נושאים, בלי חזרות) |

**איך זה עובד:** GitHub Actions מריץ את הבוט לפי שעון → נתונים חיים מ-CoinGecko → Claude כותב כותרת וכיתוב בעברית → נוצרת תמונה מעוצבת → פרסום דרך Instagram Graph API.
כל פוסט כולל אוטומטית הסתייגות "אינו מהווה ייעוץ השקעות".

---

## הגדרה חד-פעמית (כ-30 דקות)

### 1. חשבון אינסטגרם מקצועי
1. פתחו חשבון אינסטגרם חדש לעמוד.
2. הגדרות → **סוג חשבון** → עברו ל-**Business** (או Creator).
3. צרו **דף פייסבוק** וקשרו אותו לחשבון האינסטגרם (הגדרות האינסטגרם → "חשבונות מקושרים").

### 2. אפליקציית Meta וטוקן גישה
1. היכנסו ל-[developers.facebook.com](https://developers.facebook.com) → **Create App** → סוג **Business**.
2. הוסיפו את המוצר **Instagram Graph API** (Instagram API with Facebook Login).
3. ב-**Graph API Explorer** בחרו את האפליקציה, וסמנו הרשאות:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`
4. לחצו **Generate Access Token**, ואז המירו אותו ל**טוקן ארוך-טווח** (Access Token Debugger → Extend). עדיף: צרו System User ב-Business Settings עם טוקן שלא פג.
5. מצאו את ה-**IG User ID**: ב-Explorer הריצו
   `me/accounts?fields=instagram_business_account{id,username}` – המספר שבתוך `instagram_business_account.id`.

### 3. מפתח Claude
צרו מפתח ב-[console.anthropic.com](https://console.anthropic.com) → API Keys.
(בלי מפתח הבוט עדיין יעבוד, אבל עם טקסטים מתבנית קבועה.)

### 4. סודות ב-GitHub
בריפו: **Settings → Secrets and variables → Actions → New repository secret**:

| שם | ערך |
|---|---|
| `ANTHROPIC_API_KEY` | המפתח של Claude |
| `IG_USER_ID` | ה-ID מסעיף 2.5 |
| `IG_ACCESS_TOKEN` | הטוקן הארוך |

ובלשונית **Variables** (לא חובה):

| שם | ערך |
|---|---|
| `PAGE_HANDLE` | שם העמוד שיופיע על התמונות, למשל `@crypto.ivrit` |
| `IMAGE_HOST` | `github` (ברירת מחדל) או `imgbb` |

### 5. אחסון התמונה
אינסטגרם מוריד את התמונה מכתובת ציבורית:
- **ריפו ציבורי** → לא צריך כלום, התמונה נשמרת בתיקיית `posts/` בריפו.
- **ריפו פרטי** → פתחו מפתח חינמי ב-[api.imgbb.com](https://api.imgbb.com), הוסיפו סוד `IMGBB_API_KEY` ומשתנה `IMAGE_HOST=imgbb`.

### 6. הפעלה
- GitHub מריץ תזמונים **רק מהענף הראשי (main)** – צריך למזג את הענף הזה ל-main.
- בדיקה ראשונה: **Actions → Instagram crypto post → Run workflow**, סמנו `dry_run` – תקבלו את התמונה כ-Artifact בלי לפרסם. אם הכל נראה טוב – הריצו שוב בלי `dry_run`.

---

## הרצה מקומית

```bash
cd instagram_bot
pip install -r requirements.txt
python main.py --type market --dry-run --sample     # נתוני דוגמה, בלי אינטרנט
python main.py --type education --dry-run           # עם Claude אם ANTHROPIC_API_KEY מוגדר
```

## התאמות
- **מטבעות:** `COINS` ב-`config.py`
- **נושאים לימודיים:** `EDUCATION_TOPICS` ב-`content.py`
- **סגנון הכתיבה:** `SYSTEM_PROMPT` ב-`content.py`
- **שעות פרסום:** `cron` ב-`.github/workflows/instagram-post.yml` (בשעון UTC)
- **צבעים ועיצוב:** `render.py`

## עלויות
- GitHub Actions, CoinGecko, אינסטגרם API – חינם.
- Claude – בערך סנטים בודדים לפוסט.
