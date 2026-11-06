"""Fetch verified data about the fallen from the official Izkor site
(www.izkor.gov.il, Ministry of Defense - Families, Commemoration & Heritage Division).

Every field used in a video comes from here. Nothing is invented or paraphrased.
"""
from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

import requests

BASE = "https://www.izkor.gov.il"
UA = "izkor-reels/1.0 (commemoration project)"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = UA


def _get(url: str, **kw) -> requests.Response:
    last = None
    for attempt in range(4):
        try:
            r = SESSION.get(url, timeout=30, **kw)
            if r.status_code == 200:
                r.encoding = "utf-8"
                return r
            last = RuntimeError(f"{url} -> HTTP {r.status_code}")
        except requests.RequestException as e:  # network hiccup
            last = e
        time.sleep(2 ** (attempt + 1))
    raise last  # type: ignore[misc]


def latest_page(page: int = 0, size: int = 50) -> dict:
    """Fallen ordered from the most recent backwards (official site order).

    `page` is zero-based here; the site's API is one-based.
    """
    r = _get(f"{BASE}/search/api/latest/he", params={"page": page + 1, "size": size})
    return r.json()


def iter_latest(size: int = 100):
    """Yield summary records from the latest fallen back to the first."""
    page = 0
    while True:
        d = latest_page(page, size)
        rows = d.get("data") or []
        if not rows:
            return
        yield from rows
        page += 1
        if page * size >= d["metadata"]["totalResults"]:
            return


def _astro_decode(v):
    """Decode Astro's serialized island props ([0, value] / [1, [..]])."""
    if isinstance(v, list) and len(v) == 2 and isinstance(v[0], int):
        tag, val = v
        if tag == 0:
            return _astro_decode(val) if isinstance(val, (dict, list)) else val
        if tag == 1:
            return [_astro_decode(x) for x in val]
        return val
    if isinstance(v, dict):
        return {k: _astro_decode(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_astro_decode(x) for x in v]
    return v


def _find_person(o):
    if isinstance(o, dict):
        if "life_story" in o and "legacy_id" in o:
            return o
        for v in o.values():
            p = _find_person(v)
            if p:
                return p
    elif isinstance(o, list):
        for v in o:
            p = _find_person(v)
            if p:
                return p
    return None


@dataclass
class Fallen:
    legacy_id: str
    person_id: str
    first_name: str
    last_name: str
    full_name: str
    rank: str
    unit_name: str
    gender: str  # "ז" / "נ"
    age: str
    death_date: str  # d-m-yyyy
    jewish_death_date: str
    fell_on_age_label: str  # "בן 22 בנופלו"
    service_label: str  # "נפל ביום"
    parents_label: str  # "בן אולגה וירון"
    birth_city: str
    resting_place: str
    life_story: str
    has_image: bool
    page_url: str
    image_url: str | None = None
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def death_date_display(self) -> str:
        d, m, y = self.death_date.split("-")
        return f"{int(d)}.{int(m)}.{y}"

    @property
    def is_female(self) -> bool:
        return self.gender == "נ"


def person_url(first: str, last: str, person_id: str) -> str:
    name = urllib.parse.quote(f"{first} {last}".strip())
    return f"{BASE}/{name}/{person_id}"


def fetch_person(summary: dict) -> Fallen:
    url = person_url(summary["first_name"], summary["last_name"], summary["person_id"])
    t = _get(url).text
    person = None
    for m in re.finditer(r'props="([^"]*)"', t):
        p = html.unescape(m.group(1))
        if "life_story" not in p:
            continue
        person = _find_person(_astro_decode(json.loads(p)))
        if person:
            break
    if not person:
        raise RuntimeError(f"Could not parse person record at {url}")
    if str(person.get("legacy_id")) != str(summary["legacy_id"]):
        raise RuntimeError("Person page does not match the requested record")

    s = lambda k: (person.get(k) or "").strip()  # noqa: E731
    img = f"{BASE}/assets/person/images/{person['legacy_id']}.jpg" if person.get("has_image") else None
    return Fallen(
        legacy_id=str(person["legacy_id"]),
        person_id=person["person_id"],
        first_name=s("first_name"),
        last_name=s("last_name"),
        full_name=s("full_name") or f"{s('first_name')} {s('last_name')}",
        rank=s("rank"),
        unit_name=s("unit_name"),
        gender=s("gender"),
        age=s("age"),
        death_date=s("death_date"),
        jewish_death_date=s("jewish_death_date"),
        fell_on_age_label=s("fell_on_age_label"),
        service_label=s("service_label") or "נפל ביום",
        parents_label=s("parents_label"),
        birth_city=s("birth_city"),
        resting_place=s("resting_place") if not person.get("hide_cemetery") else "",
        life_story=html.unescape(person.get("life_story") or "").replace("\r", ""),
        has_image=bool(person.get("has_image")),
        page_url=url,
        image_url=img,
        raw=person,
    )


def download_image(f: Fallen, dest: Path) -> Path | None:
    if not f.image_url:
        return None
    r = _get(f.image_url)
    if not r.headers.get("content-type", "").startswith("image"):
        return None
    dest.write_bytes(r.content)
    return dest
