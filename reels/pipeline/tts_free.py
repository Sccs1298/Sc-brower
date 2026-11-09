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
VOICE_OVERRIDE = None


async def synth(text, path, rate, pitch):
    c = edge_tts.Communicate(text, VOICE_OVERRIDE or VOICE, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(path, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                words.append({"t": ch["text"], "s": s, "e": s + ch["duration"] / 1e7})
    return words


MAX_GAP = 0.16  # longest silence kept between words inside a line (tight, punchy delivery)


def squeeze(src, dst, ws, max_gap):
    """cut every inner silence longer than max_gap down to max_gap; remap word timings"""
    import numpy as np
    sr = 24000
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(pcm, np.int16)
    keep, out_ws, t_out = [], [], 0.0
    lead = 0.03
    prev_end = max(ws[0]["s"] - lead, 0)
    for i, w in enumerate(ws):
        gap = w["s"] - prev_end
        g = min(gap, max_gap) if i else 0.0
        if g > 0:
            keep.append(a[int((w["s"] - g) * sr):int(w["s"] * sr)])
            t_out += g
        seg = a[int(w["s"] * sr):int(w["e"] * sr)]
        out_ws.append({"t": w["t"], "s": t_out, "e": t_out + len(seg) / sr})
        keep.append(seg)
        t_out += len(seg) / sr
        prev_end = w["e"]
    tail = a[int(ws[-1]["e"] * sr):int((ws[-1]["e"] + 0.06) * sr)]
    keep.append(tail)
    t_out += len(tail) / sr
    y = np.concatenate(keep)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-",
                    "-af", "afade=t=in:d=0.01,areverse,afade=t=in:d=0.03,areverse", dst],
                   input=y.tobytes(), check=True)
    return out_ws, t_out


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
        ws = await synth(ln["say"], raw, ln.get("rate", rate), ln.get("pitch", pitch))
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
