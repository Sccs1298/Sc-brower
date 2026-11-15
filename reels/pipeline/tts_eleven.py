"""ElevenLabs Hebrew TTS with per-word timestamps. Same interface/output as tts_free.py.

Reads reel.json ("eleven_voice" = voice id, optional "eleven_model"), synthesizes each line via the
with-timestamps endpoint, turns character alignment into word timings, and caches every line by
(voice, model, text) so re-renders don't spend credits again.
Usage: python3 tts_eleven.py <reel.json> <out_prefix>
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "out", "tts_cache")
STRIP = ".,!?:;…\"'״׳()"
SR = 24000
MAX_GAP = 0.28  # ElevenLabs phrasing is natural; only trim long inner silences


def synth(text, voice, model, settings):
    key = hashlib.sha1(json.dumps([voice, model, text, settings], ensure_ascii=False).encode()).hexdigest()[:16]
    os.makedirs(CACHE, exist_ok=True)
    mp3, js = os.path.join(CACHE, key + ".mp3"), os.path.join(CACHE, key + ".json")
    if not (os.path.exists(mp3) and os.path.exists(js)):
        body = {"text": text, "model_id": model}
        if settings:
            body["voice_settings"] = settings
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps",
                                     data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "xi-api-key": "proxy"})
        for attempt in range(4):
            try:
                d = json.load(urllib.request.urlopen(req, timeout=120))
                break
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt == 3:
                    raise
                print("retry:", e)
                time.sleep(3 + attempt * 4)
        open(mp3, "wb").write(base64.b64decode(d["audio_base64"]))
        json.dump(d.get("normalized_alignment") or d["alignment"], open(js, "w"), ensure_ascii=False)
    al = json.load(open(js))
    words, cur = [], None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            cur = None
            continue
        if cur is None:
            cur = {"t": "", "s": s, "e": e}
            words.append(cur)
        cur["t"] += ch
        cur["e"] = e
    out = []
    for w in words:
        t = w["t"].strip(STRIP)
        if t:
            out.append({"t": t, "s": w["s"], "e": w["e"]})
    return mp3, out


def squeeze(src, dst, ws, max_gap):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(pcm, np.int16)
    keep, out_ws, t_out = [], [], 0.0
    prev_end = max(ws[0]["s"] - 0.04, 0)
    for i, w in enumerate(ws):
        gap = w["s"] - prev_end
        g = min(gap, max_gap) if i else 0.0
        if g > 0:
            keep.append(a[int((w["s"] - g) * SR):int(w["s"] * SR)])
            t_out += g
        seg = a[int(w["s"] * SR):int(w["e"] * SR)]
        out_ws.append({"t": w["t"], "s": t_out, "e": t_out + len(seg) / SR})
        keep.append(seg)
        t_out += len(seg) / SR
        prev_end = w["e"]
    tail = a[int(ws[-1]["e"] * SR):int((ws[-1]["e"] + 0.12) * SR)]
    keep.append(tail)
    t_out += len(tail) / SR
    y = np.concatenate(keep)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-af", "afade=t=in:d=0.01,areverse,afade=t=in:d=0.04,areverse", dst],
                   input=y.tobytes(), check=True)
    return out_ws, t_out


def main():
    cfg = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    voice, model = cfg["eleven_voice"], cfg.get("eleven_model", "eleven_v3")
    settings = cfg.get("eleven_settings")
    gap = cfg.get("gap", 0.18)
    allw, lines, parts, t = [], [], [], 0.0
    for i, ln in enumerate(cfg["lines"]):
        p = f"{out}_l{i:02d}.mp3"
        raw, ws = synth(ln["say"], voice, model, settings)
        ws, d = squeeze(raw, p, ws, ln.get("max_gap", MAX_GAP))
        for w in ws:
            allw.append({"t": w["t"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3), "line": i})
        lines.append({"start": round(t, 3), "end": round(t + d, 3)})
        parts.append(p)
        t += d + ln.get("pause", gap)
    lst = f"{out}_list.txt"
    with open(lst, "w") as f:
        for i, p in enumerate(parts):
            f.write(f"file '{p}'\n")
            sil = f"{out}_sil{i:02d}.mp3"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                            "-t", str(cfg["lines"][i].get("pause", gap)), "-c:a", "libmp3lame", "-b:a", "48k", sil],
                           check=True)
            f.write(f"file '{sil}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                    "-ar", "48000", "-ac", "1", f"{out}.wav"], check=True)
    json.dump({"words": allw, "lines": lines, "duration": round(t, 3)}, open(f"{out}.words.json", "w"),
              ensure_ascii=False, indent=1)
    print("voice:", round(t, 2), "s,", len(allw), "words")


main()
