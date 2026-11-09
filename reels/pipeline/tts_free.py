"""Free Hebrew TTS (Microsoft Edge neural voice) with per-word timestamps.

Synthesizes each script line separately, joins them with a short pause, and writes
<out>.mp3 plus <out>.words.json: [{"t": word, "s": start, "e": end, "line": i}], plus line start/end times.
Usage: python3 tts_free.py <reel.json> <out_prefix>
"""
import asyncio
import json
import subprocess
import sys

import edge_tts

VOICE = "he-IL-AvriNeural"


async def synth(text, path, rate, pitch):
    c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(path, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                words.append({"t": ch["text"], "s": s, "e": s + ch["duration"] / 1e7})
    return words


def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", path]).decode())


async def main():
    cfg = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    rate, pitch, gap = cfg.get("rate", "+8%"), cfg.get("pitch", "-2Hz"), cfg.get("gap", 0.18)
    allw, lines, parts, t = [], [], [], 0.0
    for i, ln in enumerate(cfg["lines"]):
        p = f"{out}_l{i:02d}.mp3"
        raw = p.replace(".mp3", "_raw.mp3")
        ws = await synth(ln["say"], raw, rate, pitch)
        d = min(dur(raw), ws[-1]["e"] + 0.07)  # cut the built-in trailing silence (tight, remy-style pacing)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-t", f"{d:.3f}", "-af",
                        f"afade=t=out:st={max(d - 0.04, 0):.3f}:d=0.04", p], check=True)
        for w in ws:
            allw.append({"t": w["t"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3), "line": i})
        lines.append({"start": round(t, 3), "end": round(t + d, 3)})
        parts.append(p)
        t += d + ln.get("pause", gap)
    lst = f"{out}_list.txt"
    with open(lst, "w") as f:
        for i, p in enumerate(parts):
            f.write(f"file '{p}'\n")
            pause = cfg["lines"][i].get("pause", gap)
            sil = f"{out}_sil{i:02d}.mp3"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                            "-t", str(pause), "-c:a", "libmp3lame", "-b:a", "48k", sil], check=True)
            f.write(f"file '{sil}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                    "-ar", "48000", "-ac", "1", f"{out}.wav"], check=True)
    json.dump({"words": allw, "lines": lines, "duration": round(t, 3)}, open(f"{out}.words.json", "w"),
              ensure_ascii=False, indent=1)
    print("voice:", round(t, 2), "s,", len(allw), "words")


asyncio.run(main())
