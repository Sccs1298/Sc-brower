"""הגדרות הבוט. כל הסודות נקראים ממשתני סביבה (GitHub Secrets) ולא נשמרים בקוד."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent
FONTS_DIR = BASE_DIR / "fonts"
POSTS_DIR = REPO_DIR / "posts"
HISTORY_FILE = POSTS_DIR / "history.json"

# --- שם העמוד (מופיע על התמונות) ---
PAGE_HANDLE = os.getenv("PAGE_HANDLE", "@crypto.ivrit")

# --- מטבעות למעקב (מזהי CoinGecko) ---
COINS = [
    ("bitcoin", "ביטקוין", "BTC"),
    ("ethereum", "את'ריום", "ETH"),
    ("solana", "סולנה", "SOL"),
    ("ripple", "XRP", "XRP"),
    ("binancecoin", "BNB", "BNB"),
    ("dogecoin", "דוג'קוין", "DOGE"),
]

# --- Claude ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")

# --- Instagram Graph API ---
IG_USER_ID = os.getenv("IG_USER_ID", "")
IG_ACCESS_TOKEN = os.getenv("IG_ACCESS_TOKEN", "")
GRAPH_API_VERSION = os.getenv("GRAPH_API_VERSION", "v23.0")

# --- אחסון התמונה (אינסטגרם דורש URL ציבורי לתמונה) ---
# "github" = התמונה נשמרת בריפו ומוגשת דרך raw.githubusercontent.com (דורש ריפו ציבורי)
# "imgbb"  = העלאה ל-imgbb.com (דורש IMGBB_API_KEY, מתאים גם לריפו פרטי)
IMAGE_HOST = os.getenv("IMAGE_HOST", "github")
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY", "")
GITHUB_REPOSITORY = os.getenv("GITHUB_REPOSITORY", "sccs1298/Sc-brower")
GITHUB_BRANCH = os.getenv("GITHUB_REF_NAME", "main")

DISCLAIMER = "⚠️ התוכן נועד למטרות מידע ולימוד בלבד ואינו מהווה ייעוץ השקעות. השקעה בקריפטו כרוכה בסיכון גבוה."

BASE_HASHTAGS = [
    "#קריפטו", "#ביטקוין", "#השקעות", "#כסף", "#בלוקצ'יין",
    "#crypto", "#bitcoin", "#ethereum", "#cryptoisrael",
]
