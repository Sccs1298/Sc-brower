# מפעל הרילס

צינור הפקה אוטומטי לרילס בסגנון @remy.engineering, בעברית.

## הרכיבים
| שלב | כלי |
|---|---|
| תסריט | `reels/<NN>/script.md` |
| קריינות | ElevenLabs `eleven_v3`, הקול Dorian (עברית, צעיר) |
| תזמון כתוביות | ElevenLabs Scribe עם חותמות זמן לכל מילה |
| הקלטות מסך | Apify `apify/screenshot-url` (מצב כהה, רוחב 430, בלי proxy) |
| פרזנטור | Mixkit 2963/2955 (רישיון חינמי לשימוש מסחרי), עם פנים מפוקסלות |
| זיהוי פנים וחיתוך דמות | MediaPipe (`prep_avatar.py`) |
| הרכבה | `render.py`: צבע אדום-כהה, LED, וינייט, גרעיניות, כתוביות RTL מילה-מילה, מונה 1/5, מדבקת כוכבים, זום על מעברים |
| סאונד | ElevenLabs Sound Effects (whoosh, glitch, pop), ונרמול ל-14- LUFS |

## הרצה
```bash
python3 reels/pipeline/prep_avatar.py <models_dir> clip1.mp4 clip2.mp4
PREVIEW="4,15,29" python3 reels/pipeline/render.py reels/01-dangerous-github/reel.json   # פריימים לבדיקה
python3 reels/pipeline/render.py reels/01-dangerous-github/reel.json                      # וידאו מלא
```
