"""Archive each reel (and its caption) in a Google Drive folder.

Uses an OAuth refresh token for the owner's own Drive (service accounts have
no storage quota on personal Drives). Configure as GitHub secrets:
  GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN
and the target folder id as GDRIVE_FOLDER_ID (secret or variable).
If any is missing, archiving is skipped with a notice.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests

# Scope must be full "drive" so uploads can target an existing folder.
SCOPE = "https://www.googleapis.com/auth/drive"


def configured() -> bool:
    return all(os.environ.get(k) for k in
               ("GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN", "GDRIVE_FOLDER_ID"))


def _token() -> str:
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": os.environ["GDRIVE_CLIENT_ID"],
        "client_secret": os.environ["GDRIVE_CLIENT_SECRET"],
        "refresh_token": os.environ["GDRIVE_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def upload(path: Path, name: str, mime: str, token: str | None = None) -> str:
    token = token or _token()
    meta = {"name": name, "parents": [os.environ["GDRIVE_FOLDER_ID"]]}
    init = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": mime},
        data=json.dumps(meta), timeout=60)
    init.raise_for_status()
    r = requests.put(init.headers["Location"], data=path.read_bytes(),
                     headers={"Content-Type": mime}, timeout=600)
    r.raise_for_status()
    return r.json()["id"]


def archive(video: Path, caption: Path, title: str) -> dict:
    token = _token()
    return {
        "video_id": upload(video, f"{title}.mp4", "video/mp4", token),
        "caption_id": upload(caption, f"{title} - כיתוב.txt", "text/plain", token),
    }
