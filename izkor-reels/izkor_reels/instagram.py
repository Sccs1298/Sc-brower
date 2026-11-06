"""Publish a Reel through the official Instagram Graph API (resumable upload).

Needs:
  IG_USER_ID       - Instagram professional account id
  IG_ACCESS_TOKEN  - long-lived token with instagram_content_publish permission
Optional:
  IG_GRAPH_HOST    - graph.facebook.com (Facebook Login, default) or graph.instagram.com
  IG_API_VERSION   - default v23.0
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import requests


class InstagramError(RuntimeError):
    pass


def _cfg():
    user = os.environ.get("IG_USER_ID")
    token = os.environ.get("IG_ACCESS_TOKEN")
    if not user or not token:
        raise InstagramError("IG_USER_ID / IG_ACCESS_TOKEN are not set")
    host = os.environ.get("IG_GRAPH_HOST", "graph.facebook.com")
    ver = os.environ.get("IG_API_VERSION", "v23.0")
    return user, token, f"https://{host}/{ver}", ver


def _check(r: requests.Response) -> dict:
    try:
        d = r.json()
    except ValueError:
        raise InstagramError(f"HTTP {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400 or "error" in d:
        raise InstagramError(str(d.get("error", d)))
    return d


def publish_reel(video: Path, caption: str, share_to_feed: bool = True, timeout_s: int = 900) -> str:
    user, token, base, ver = _cfg()

    # 1. create a resumable REELS container
    d = _check(requests.post(f"{base}/{user}/media", data={
        "media_type": "REELS",
        "upload_type": "resumable",
        "caption": caption,
        "share_to_feed": "true" if share_to_feed else "false",
        "access_token": token,
    }, timeout=60))
    container = d["id"]
    upload_uri = d.get("uri") or f"https://rupload.facebook.com/ig-api-upload/{ver}/{container}"

    # 2. upload the file bytes
    data = video.read_bytes()
    _check(requests.post(upload_uri, data=data, headers={
        "Authorization": f"OAuth {token}",
        "offset": "0",
        "file_size": str(len(data)),
    }, timeout=600))

    # 3. wait for processing
    deadline = time.time() + timeout_s
    while True:
        st = _check(requests.get(f"{base}/{container}", params={
            "fields": "status_code,status", "access_token": token}, timeout=60))
        code = st.get("status_code")
        if code == "FINISHED":
            break
        if code in ("ERROR", "EXPIRED"):
            raise InstagramError(f"container {container} failed: {st}")
        if time.time() > deadline:
            raise InstagramError(f"container {container} still processing: {st}")
        time.sleep(10)

    # 4. publish
    d = _check(requests.post(f"{base}/{user}/media_publish", data={
        "creation_id": container, "access_token": token}, timeout=60))
    return d["id"]
