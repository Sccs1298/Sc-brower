# סטורי "מצב השוק" – כל 4 שעות (מאושר ע"י הבעלים 08.11 לפרסום אוטומטי)

שעות (שעון ישראל): ~08:00, 12:00, 16:00, 20:00, 00:00. **רק סטורי מצב שוק** – פוסטים/רילס עדיין דורשים אישור לכל פרסום.

1. `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 instagram_bot/story/make_story.py $SCRATCH/story`
   - exit 2 = פער בין CoinGecko ל-Paprika → **לא מפרסמים**, מדווחים לבעלים.
   - לפתוח את story.jpg (Read) ולוודא שהתמונה תקינה.
2. העלאה לדרייב, תיקייה "סטוריז – מצב השוק" `1d9EYpDiqx3B0Hrer5S53jt7UaIzFfOuq`
   (session resumable דרך `COMPOSIO_PROXY_EXECUTE` googledrive + `curl PUT`). שם: `story_YYYY-MM-DD_HHMM.jpg`.
3. `GOOGLEDRIVE_DOWNLOAD_FILE` (Comp) על ה-fileId → `downloaded_file_content.s3url` (כתובת חתומה לשעה).
4. `INSTAGRAM_POST_IG_USER_MEDIA` {ig_user_id: 28573517155684687, media_type: STORIES, image_url: s3url} → creation_id
5. `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` {ig_user_id, creation_id} → media id. אימות: `INSTAGRAM_GET_IG_MEDIA` (media_product_type=STORY).
6. לא לשלוח התראה לבעלים על הצלחה (שקט). התראה רק על כשל.

נבדק בהצלחה: 08.11 14:42 (media 17912839212308051) – הפרסום הראשון של החשבון.
