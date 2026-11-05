"""פרסום לאינסטגרם דרך Instagram Graph API (חשבון Business/Creator)."""
import base64
import subprocess
import time

import requests

from config import (GITHUB_BRANCH, GITHUB_REPOSITORY, GRAPH_API_VERSION, IG_ACCESS_TOKEN,
                    IG_USER_ID, IMAGE_HOST, IMGBB_API_KEY, REPO_DIR)

GRAPH = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def host_image(path):
    """מעלה את התמונה למקום ציבורי ומחזיר URL. אינסטגרם מוריד את התמונה מה-URL הזה."""
    if IMAGE_HOST == "imgbb":
        if not IMGBB_API_KEY:
            raise RuntimeError("IMAGE_HOST=imgbb אבל IMGBB_API_KEY חסר")
        with open(path, "rb") as f:
            r = requests.post("https://api.imgbb.com/1/upload",
                              data={"key": IMGBB_API_KEY, "image": base64.b64encode(f.read())},
                              timeout=60)
        r.raise_for_status()
        return r.json()["data"]["url"]

    # github: שומרים את התמונה בריפו ודוחפים, ואז משתמשים בקישור raw
    rel = path.relative_to(REPO_DIR).as_posix()
    subprocess.run(["git", "add", rel], cwd=REPO_DIR, check=True)
    subprocess.run(["git", "commit", "-m", f"post: {rel}"], cwd=REPO_DIR, check=True)
    subprocess.run(["git", "push", "origin", f"HEAD:{GITHUB_BRANCH}"], cwd=REPO_DIR, check=True)
    url = f"https://raw.githubusercontent.com/{GITHUB_REPOSITORY}/{GITHUB_BRANCH}/{rel}"
    # מחכים שהקובץ יהיה זמין
    for _ in range(12):
        if requests.head(url, timeout=15).status_code == 200:
            return url
        time.sleep(5)
    raise RuntimeError(f"התמונה לא זמינה ב-{url} (האם הריפו ציבורי?)")


def _check(r):
    if not r.ok:
        raise RuntimeError(f"Instagram API error {r.status_code}: {r.text}")
    return r.json()


def publish_image(image_url, caption):
    if not (IG_USER_ID and IG_ACCESS_TOKEN):
        raise RuntimeError("חסרים IG_USER_ID / IG_ACCESS_TOKEN")

    # 1) יצירת container
    container = _check(requests.post(
        f"{GRAPH}/{IG_USER_ID}/media",
        data={"image_url": image_url, "caption": caption, "access_token": IG_ACCESS_TOKEN},
        timeout=60,
    ))["id"]

    # 2) המתנה לעיבוד
    for _ in range(20):
        status = _check(requests.get(
            f"{GRAPH}/{container}",
            params={"fields": "status_code", "access_token": IG_ACCESS_TOKEN}, timeout=30,
        )).get("status_code")
        if status == "FINISHED":
            break
        if status == "ERROR":
            raise RuntimeError("Instagram failed to process the image")
        time.sleep(3)

    # 3) פרסום
    media_id = _check(requests.post(
        f"{GRAPH}/{IG_USER_ID}/media_publish",
        data={"creation_id": container, "access_token": IG_ACCESS_TOKEN},
        timeout=60,
    ))["id"]
    return media_id
