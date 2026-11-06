"""Synthesize an original, quiet memorial pad (no samples, no licensing issues).

Slow minor progression, soft string-like voices with gentle attack/release,
a sparse high "bell" note per chord, and a long reverb tail via ffmpeg.
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 48000
# A minor: Am - F - C - G/B - Am - Dm - E(sus->maj) - Am   (MIDI notes)
PROGRESSION = [
    [45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [47, 55, 59, 62],
    [45, 57, 60, 64], [50, 57, 62, 65], [40, 56, 59, 64], [45, 57, 60, 64],
]
MELODY = [76, 72, 72, 74, 76, 74, 71, 69]  # one soft high note per chord


def hz(m: int) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def voice(freq: float, n: int, rng) -> np.ndarray:
    t = np.arange(n) / SR
    vib = 1 + 0.0025 * np.sin(2 * np.pi * (4.6 + rng.random()) * t + rng.random() * 6)
    ph = 2 * np.pi * freq * np.cumsum(vib) / SR
    # soft "bowed" tone: few harmonics, decaying amplitudes
    sig = sum((0.6 ** k) * np.sin((k + 1) * ph + rng.random() * 6) for k in range(5))
    return sig


def env(n: int, attack: float, release: float) -> np.ndarray:
    a, r = int(attack * SR), int(release * SR)
    e = np.ones(n)
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e


def bell(freq: float, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 2)
    return s * np.exp(-t * 0.9) * np.minimum(1, t / 0.01)


def synth(out: Path, seconds: float = 48.0, chord_len: float = 5.6) -> Path:
    rng = np.random.default_rng(3)
    total = int(seconds * SR)
    L = np.zeros(total)
    R = np.zeros(total)
    step = int(chord_len * SR)
    overlap = int(1.6 * SR)
    i = 0
    while i * step < total:
        chord = PROGRESSION[i % len(PROGRESSION)]
        start = i * step
        n = min(step + overlap, total - start)
        e = env(n, 1.8, 1.8 if n > 4 * SR else n / SR / 2)
        for j, m in enumerate(chord):
            amp = 0.20 if j == 0 else 0.11
            for det, pan in ((-0.0018, 0.3), (0.0018, 0.7)):  # chorus pair
                v = voice(hz(m) * (1 + det), n, rng) * e * amp
                L[start:start + n] += v * (1 - pan)
                R[start:start + n] += v * pan
        if i % 2 == 0 or i == 0:  # sparse melody
            off = int(0.9 * SR)
            if start + off < total:
                bn = min(int(4.5 * SR), total - start - off)
                b = bell(hz(MELODY[i % len(MELODY)]), bn) * 0.09
                L[start + off:start + off + bn] += b * 0.55
                R[start + off:start + off + bn] += b * 0.45
        i += 1
    # global fade in/out
    g = env(total, 3.0, 4.0)
    st = np.stack([L * g, R * g], 1)
    st /= np.abs(st).max() + 1e-9
    st *= 0.5
    tmp = out.with_suffix(".raw.wav")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())
    # warm low-pass + hall-like reverb + loudness normalisation (quiet background)
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af",
        "lowpass=f=5200,aecho=0.8:0.85:60|130|210|330:0.32|0.24|0.18|0.12,"
        "loudnorm=I=-22:TP=-3:LRA=7", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", str(out)],
        check=True)
    tmp.unlink()
    return out


if __name__ == "__main__":
    import sys
    synth(Path(sys.argv[1] if len(sys.argv) > 1 else "assets/audio/ambient.mp3"))
