"""קריינות לפי משפטים, מוצמדת לגריד ביט + שכבת ביט/סאונד סינתטית (בלי זכויות יוצרים).

    SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 instagram_bot/motion/voice_beat.py seg.json OUT_DIR [--bpm 96] [--impacts 0,7]
       [--replace '{"אף בי איי":"FBI"}'] [--timing PATH/timing.js]

seg.json: רשימת משפטים (סצנה לכל משפט).
--bed music (ברירת מחדל, 08.11 – הבעלים: "הביט לא מסתדר עם הקול") = אקורדים+בס+תופים רכים עם הנמכה מתחת לקול; --bed drums = הישן.
פלט: OUT_DIR/mix.wav (קול+ביט+אפקטים), OUT_DIR/vo_sfx.wav (בלי ביט – אם הבעלים מוסיף מוזיקה), timing.js.
כל משפט מתחיל בדיוק על ביט → החיתוכים מסונכרנים לביט.
⚠️ קול: edge-tts (אברי) – ערוץ לא רשמי.
"""
import asyncio
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
VOICE = "he-IL-AvriNeural"


async def tts(text, rate):
    import edge_tts
    c = edge_tts.Communicate(text, VOICE, rate=rate, boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
    audio, words = bytearray(), []
    async for ch in c.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            words.append([ch["text"], ch["offset"] / 1e7])
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         input=bytes(audio), capture_output=True).stdout
    return np.frombuffer(pcm, np.float32).copy(), words


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-t / d)


def kick(f0=110, f1=42, dur=.35):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .002, .09)


def hat(dur=.05, seed=0):
    n = int(SR * dur); r = np.random.default_rng(seed).standard_normal(n)
    r = np.diff(r, prepend=0)  # high-pass גס
    return r * env(n, .001, .012) * .25


def whoosh(dur=.55, seed=1):
    n = int(SR * dur); r = np.random.default_rng(seed).standard_normal(n)
    k = np.ones(40) / 40
    lo = np.convolve(r, k, "same")
    x = r - lo  # רעש בהיר
    shape = (np.linspace(0, 1, n) ** 2.2)
    return x * shape * .18


def boom(dur=1.4):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 34 + 60 * np.exp(-t * 6)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .003, .45) * .9


def lp(x, fc):  # מסנן נמוכים חד-קוטבי
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a) * x[i] + a * z; y[i] = z
    return y


def note(freq, dur, kind="pad"):
    n = int(SR * dur); t = np.arange(n) / SR
    if kind == "pad":  # שני גלים מעט מכוונים זה מזה + הרמוניות רכות
        w = sum(np.sin(2 * np.pi * freq * d * h * t) / h ** 1.6 for d in (1, 1.004) for h in (1, 2, 3))
        e = np.minimum(t / .35, 1) * np.minimum((dur - t) / .4, 1).clip(0, 1)
    else:  # בס פלאק
        w = np.sin(2 * np.pi * freq * t) + .25 * np.sin(2 * np.pi * freq * 2 * t)
        e = np.minimum(t / .005, 1) * np.exp(-t / .35)
    return (w * e).astype(np.float32)


def music_bed(total, B, vo, drops=()):
    """מצע "מתח" מינימלי לאקספליינר (לפי מחקר 08.11, docs/music_research.md):
    דרון נמוך + פולס שמיניות עמום (הכל מתחת ל-~900Hz – לא נוגע ב-1–4kHz של הדיבור), טיקים עדינים מעל 6kHz,
    רמה ~20dB מתחת לקול + הנמכה חלקה נוספת ~4dB בזמן דיבור, ושקט קצר (drop) לפני רגעי חשיפה."""
    n = len(vo); pad = np.zeros(n, np.float32); pulse = np.zeros(n, np.float32); tick = np.zeros(n, np.float32)
    prog = [(110.0, [110.0, 130.81, 164.81]), (87.31, [87.31, 130.81, 174.61]),
            (130.81, [130.81, 164.81, 196.0]), (98.0, [98.0, 146.83, 196.0])]
    bar = 4 * B; k = 0; t = 0.0
    while t < total:
        root, chord = prog[k % 4]
        for fq in chord:
            add(pad, note(fq, bar * 2 + .5) * .2, t)
        for e in range(16):  # שמיניות על השורש/קווינטה
            fq = root if e % 4 != 3 else root * 1.5
            add(pulse, note(fq, B * .45, "bass") * (.55 if e % 2 == 0 else .35), t + e * B / 2)
        t += bar * 2; k += 1
    pad = lp(lp(pad, 700), 900); pulse = lp(lp(pulse, 600), 900)
    for i in range(int(total / B) * 2):
        h = hat(.03, seed=900 + i); h = h - lp(h, 6000)  # רק מעל 6kHz
        add(tick, h * (.5 if i % 2 else .25), i * B / 2)
    bed = pad + pulse + .6 * tick
    # רמה: 20dB מתחת לרמת הדיבור (RMS על קטעים עם קול)
    blk = int(.01 * SR); m = len(vo) // blk * blk
    r = np.sqrt((vo[:m].reshape(-1, blk) ** 2).mean(1)); speech = r > .2 * r.max()
    v_rms = np.sqrt((r[speech] ** 2).mean()) if speech.any() else .1
    rb = np.sqrt((bed[:m].reshape(-1, blk) ** 2).mean()) + 1e-9
    bed *= v_rms * 10 ** (-20 / 20) / rb
    # הנמכה חלקה: attack 80ms / release 500ms, עד ~4dB
    g = np.ones(len(r)); cur = 1.0; aa, rr = np.exp(-1 / 8), np.exp(-1 / 50)
    for i, sp in enumerate(speech):
        tgt = 10 ** (-4 / 20) if sp else 1.0
        c = aa if tgt < cur else rr; cur = c * cur + (1 - c) * tgt; g[i] = cur
    gain = np.ones(n, np.float32); gain[:m] = np.repeat(g, blk)
    for s0 in drops:  # שקט קצר לפני רגע חשיפה
        a0, a1 = int(max(0, s0 - .45) * SR), int(s0 * SR)
        gain[a0:a1] *= np.linspace(1, 0, a1 - a0) ** .5 if a1 > a0 else 1
    return bed * gain


def add(buf, x, at):
    i = int(at * SR)
    if i < 0:
        x, i = x[-i:], 0
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[:j - i]


def main():
    a = sys.argv[1:]
    seg, out = json.load(open(a[0], encoding="utf-8")), a[1]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    bpm = float(opt("--bpm", 96)); B = 60 / bpm
    impacts = [int(x) for x in opt("--impacts", "0").split(",") if x != ""]
    rep = json.loads(opt("--replace", "{}"))
    timing_path = opt("--timing", os.path.join(out, "timing.js"))
    rate = opt("--rate", "+6%")
    os.makedirs(out, exist_ok=True)

    clips = []
    for s in seg:  # חיתוך שקט בהתחלה ובסוף כל משפט (edge-tts מוסיף ~0.3–0.8ש')
        pcm, ws = asyncio.run(tts(s, rate))
        loud = np.where(np.abs(pcm) > 0.012)[0]
        a0 = max(0, loud[0] - int(.03 * SR)) if len(loud) else 0
        a1 = min(len(pcm), loud[-1] + int(.08 * SR)) if len(loud) else len(pcm)
        clips.append((pcm[a0:a1], [[w, max(0.0, o - a0 / SR)] for w, o in ws]))
    starts, words, t = [], [], 0.0  # ההוק מתחיל מיד, על ביט 0
    for k, (pcm, ws) in enumerate(clips):
        starts.append(t)
        for w, o in ws:
            words.append([w, round(t + o, 3), k])
        end = t + len(pcm) / SR
        G = B / 2 if opt("--bed", "music") == "music" else B  # במצע מוזיקלי – רשת של חצי ביט (פחות שקט מת)
        t = (np.ceil((end + float(opt("--gap", .12))) / G)) * G
    total = t + B * 2
    # החלפות תצוגה (רצף מילים → מילה אחת)
    for src, dst in rep.items():
        parts = src.split(" ")
        i = 0
        while i <= len(words) - len(parts):
            if [x[0].strip(",.?!") for x in words[i:i + len(parts)]] == parts:
                tail = words[i + len(parts) - 1][0][len(parts[-1]):]
                words[i:i + len(parts)] = [[dst + tail, words[i][1], words[i][2]]]
            i += 1

    n = int(total * SR) + SR
    vo, beat, sfx = np.zeros(n, np.float32), np.zeros(n, np.float32), np.zeros(n, np.float32)
    for (pcm, _), s in zip(clips, starts):
        add(vo, pcm, s)
    nb = int(total / B) if opt("--bed", "music") == "drums" else 0
    for i in range(nb):
        add(beat, kick() * (1 if i % 4 == 0 else .55), i * B)
        add(beat, hat(seed=i), i * B + B / 2)
        if i % 2:
            add(beat, hat(seed=1000 + i) * .6, i * B)
    for k, s in enumerate(starts):
        if k > 0 and (opt("--bed", "music") == "drums" or k in impacts):
            add(sfx, whoosh(seed=k), s - .55)
        if k in impacts:
            add(sfx, boom(), s)
    # מיקס: הביט שקט מתחת לקול
    if opt("--bed", "music") == "music":
        beat = music_bed(total, B, vo, drops=[starts[k] for k in impacts if 0 < k < len(starts)])
        mix = vo + beat + .3 * sfx
    else:
        mix = vo + .16 * beat + .5 * sfx
    vos = vo + .5 * sfx
    for name, x in (("mix.wav", mix), ("vo_sfx.wav", vos)):
        x = x / max(1e-6, np.abs(x).max()) * .89
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), os.path.join(out, name)],
                       input=x.astype(np.float32).tobytes(), check=True)
    timing = {"starts": [round(x, 3) for x in starts], "words": words, "total": round(total, 3), "bpm": bpm, "beat": B}
    open(timing_path, "w", encoding="utf-8").write("window.TIMING=" + json.dumps(timing, ensure_ascii=False) + ";")
    print("scenes", len(starts), "total", round(total, 2), "bpm", bpm)


if __name__ == "__main__":
    main()
