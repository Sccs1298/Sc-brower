"""Build one tutorial video of "הוואטסאפ שלי נעול" from videos.json.

Pipeline: free Hebrew voice (tts_free.py) -> screenshot / chat scenes (tutorial.html via Playwright)
-> LED-mask avatar + captions + whoosh (render3.py) -> compressed mp4 in <repo>/out/videos/.
Usage: python3 make_video.py <video id, e.g. v1> [--preview]
"""
import json
import os
import subprocess
import sys

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PIPE = os.path.join(REPO, "reels", "pipeline")
SHOTS = os.path.join(HERE, "..", "design", "shots")
AS = os.path.join(HERE, "assets")
OUT = os.path.join(REPO, "out", "videos")
WORK = os.path.join(REPO, "out", "videos", "work")

ASSETS = {
    "font": os.path.join(AS, "Heebo-800.ttf"),
    "plate": os.path.join(AS, "r_22.png"),
    "sfx": {"whoosh": os.path.join(AS, "whoosh.mp3")},
    "flag": {"quad": [[640, 230], [1110, 170], [1110, 760], [640, 720]], "brightness": 0.46},
    "avatar": {"img": os.path.join(AS, "h7_clean.png"), "mask": os.path.join(AS, "h7_mask.png"),
               "face_xy": [295, 322], "face_w": 190},
}


def run(*a, **k):
    print("+", " ".join(str(x) for x in a[0][:3]))
    subprocess.run(*a, check=True, **k)


def main(vid, preview=False):
    allv = json.load(open(os.path.join(HERE, "videos.json"), encoding="utf-8"))
    V = allv[vid]
    wd = os.path.join(WORK, vid)
    os.makedirs(wd, exist_ok=True)
    # 1. reel config for the voice + renderer
    lines, prev = [], None
    for ln in V["lines"]:
        sc = ln.get("scene")
        shot = {"type": "head", "zoom": ln.get("zoom", 1.0)} if not sc else \
            {"type": "screen", "scene": sc, "cont": sc == prev}
        lines.append({"say": ln["say"], "shot": shot, "rate": ln.get("rate", "+6%"), "pitch": ln.get("pitch", "-3Hz"),
                      "pause": ln.get("pause", 0.22)})
        prev = sc
    reel = {"voice": "he-IL-AvriNeural", "lines": lines, "assets": ASSETS,
            "caption_merge": V.get("caption_merge", []), "caption_replace": V.get("caption_replace", {})}
    rj = os.path.join(wd, "reel.json")
    json.dump(reel, open(rj, "w"), ensure_ascii=False, indent=1)
    vp = os.path.join(wd, "voice")
    if not os.path.exists(vp + ".words.json") or os.path.getmtime(vp + ".words.json") < os.path.getmtime(rj) - 5:
        run(["python3", os.path.join(PIPE, "tts_free.py"), rj, vp])
    voice = json.load(open(vp + ".words.json"))
    LT = voice["lines"]
    # 2. scene spans (a scene continues over consecutive lines)
    spans = {}
    for i, ln in enumerate(V["lines"]):
        sc = ln.get("scene")
        if not sc:
            continue
        st = LT[i]["start"]
        en = LT[i + 1]["start"] if i + 1 < len(LT) else voice["duration"] + 0.4
        if sc in spans and V["lines"][i - 1].get("scene") == sc:
            spans[sc][1] = en
        else:
            spans[sc] = [st, en]
    specs, plan = {}, []
    for name, (st, en) in spans.items():
        s = dict(V["scenes"][name])
        d = en - st
        if s["kind"] == "shot":
            p = os.path.join(SHOTS, s["shot"] + ".png")
            h, w = cv2.imread(p).shape[:2]
            s.update(img="file://" + p, w=w, h=h)
            s.setdefault("zs", round(min(0.9, d * 0.28), 2))
            s.setdefault("ze", round(s["zs"] + min(0.8, d * 0.3), 2))
            cap = min(d + 0.2, 4.0)
        else:
            cap = d + 0.2
        specs[name] = s
        plan.append([name, round(cap, 2)])
    scn = os.path.join(wd, "scenes")
    run(["node", os.path.join(PIPE, "capture_scenes.js"), os.path.join(PIPE, "scenes", "tutorial.html"), scn,
         json.dumps(plan), json.dumps({"HEEBO_URL": "file://" + ASSETS["font"],
                                       "SPECS_JSON": json.dumps(specs, ensure_ascii=False)}, ensure_ascii=False)])
    # 3. render
    raw = os.path.join(wd, vid + "_raw.mp4")
    env = dict(os.environ)
    if preview:
        env["PREVIEW"] = ",".join(str(round((l["start"] + l["end"]) / 2, 1)) for l in LT)
    run(["python3", os.path.join(PIPE, "render3.py"), rj, vp, scn, raw], env=env)
    if preview:
        return
    os.makedirs(OUT, exist_ok=True)
    final = os.path.join(OUT, f"{vid}-{V['slug']}.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-maxrate", "4M",
         "-bufsize", "8M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", final])
    print("final:", final)


if __name__ == "__main__":
    main(sys.argv[1], "--preview" in sys.argv)
