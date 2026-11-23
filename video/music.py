"""Original background music for the Fer Agent video, made from scratch in code (no samples, no third-party audio):
warm pads, a plucked arpeggio, soft bass, kick and hats, D major, 100 BPM, I–V–vi–IV. Free to use, like Fer Agent (MIT).
Usage: python3 music.py <seconds> <out.wav>"""
import sys, numpy as np, wave
SR = 48000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 54.0
OUT = sys.argv[2] if len(sys.argv) > 2 else "music.wav"
BPM = 100.0; BEAT = 60.0 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(7)
N = int(DUR * SR) + SR * 3
L = np.zeros(N); R = np.zeros(N)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def place(buf, sig, t, gain=1.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if i < N: buf[i:j] += gain * sig[: j - i]
def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for k in range(len(x)): s = (1 - a) * x[k] + a * s; y[k] = s
    return y
def lp_fast(x, fc):   # vectorised one-pole low-pass via scipy-free IIR (blockwise)
    from math import exp
    a = exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); s = 0.0
    xs = (1 - a) * x
    for k in range(len(x)): s = xs[k] + a * s; y[k] = s
    return y

# chords (MIDI): D, A, Bm, G — voiced warm and close
CHORDS = [[50, 57, 62, 66, 69], [45, 57, 61, 64, 69], [47, 54, 59, 62, 66], [43, 55, 59, 62, 67]]
ROOTS = [38, 33, 35, 31]
bars = int(np.ceil(DUR / BAR)) + 1

# --- pads: detuned additive saws, slow swell, low-passed
def pad_note(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR; sig = np.zeros(n)
    for det in (-0.11, 0.0, 0.09):            # semitone fractions (≈ ±10 cents)
        ff = f * 2 ** (det / 12)
        for h in range(1, 14):
            if ff * h > 5000: break
            sig += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / h
    att, rel = 0.9, 1.3
    env = np.minimum(1, t / att) * np.minimum(1, np.maximum(0, (dur - t) / rel))
    return sig * env / 9
pad = np.zeros(N)
for b in range(bars):
    ch = CHORDS[b % 4]; t0 = b * BAR
    for m in ch[1:]:
        place(pad, pad_note(hz(m), BAR + 1.2), t0, 0.55)
pad = lp_fast(pad, 3400)

# --- plucked arpeggio (Karplus-Strong), eighth notes, from bar 2
def pluck(f, dur=1.4, bright=0.5):
    n = int(dur * SR); p = int(SR / f)
    buf = rng.uniform(-1, 1, p); buf = onepole_lp(buf, 4000 + 6000 * bright)
    out = np.empty(n); idx = 0
    for k in range(n):
        out[k] = buf[idx]
        nxt = (idx + 1) % p
        buf[idx] = 0.996 * 0.5 * (buf[idx] + buf[nxt])
        idx = nxt
    return out * np.exp(-np.arange(n) / SR * 1.2)
ARP = [0, 2, 1, 3, 2, 4, 3, 2]   # chord-tone pattern over the 8 eighths of a bar
plL = np.zeros(N); plR = np.zeros(N)
cache = {}
for b in range(1, bars):
    ch = CHORDS[b % 4]; tones = [m + 12 for m in ch[1:]]
    for e in range(8):
        m = tones[ARP[e] % len(tones)]
        if (m, e % 2) not in cache: cache[(m, e % 2)] = pluck(hz(m), 1.3, 0.35 + 0.2 * (e % 2))
        s = cache[(m, e % 2)]; t = b * BAR + e * BEAT / 2
        vel = 0.62 if e % 2 == 0 else 0.48
        if b >= bars - 3: vel *= 1.15
        pan = 0.35 if e % 2 else -0.35
        place(plL, s, t, vel * (1 - pan) / 1.35); place(plR, s, t, vel * (1 + pan) / 1.35)

# --- bass: round sine + a touch of 2nd harmonic, beats 1 and 3 (from bar 3)
def bass_note(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    env = np.minimum(1, t / 0.01) * np.exp(-t * 1.6)
    return np.tanh(1.4 * s * env) * 0.8
bass = np.zeros(N)
for b in range(2, bars):
    f = hz(ROOTS[b % 4])
    place(bass, bass_note(f, BEAT * 2), b * BAR, 0.2); place(bass, bass_note(f, BEAT * 2), b * BAR + 2 * BEAT, 0.16)

# --- kick and hats (from bar 3; a lighter bar before the end card)
def kick():
    n = int(0.32 * SR); t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)
def hat():
    n = int(0.05 * SR); x = rng.uniform(-1, 1, n)
    x = x - onepole_lp(x, 7000)   # high-pass
    return x * np.exp(-np.arange(n) / SR * 90)
K, H = kick(), hat()
drums = np.zeros(N); hats = np.zeros(N)
for b in range(2, bars):
    for q in (0, 2): place(drums, K, b * BAR + q * BEAT, 0.26)
    for e in range(8):
        if e % 2: place(hats, H, b * BAR + e * BEAT / 2, 0.22)

# --- reverb: decaying-noise impulse on pads and plucks
def reverb(x, secs=1.9, wet=0.28):
    n = int(secs * SR); ir = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 3.2); ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n - 1; F = 1 << int(np.ceil(np.log2(m)))
    y = np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[: len(x)]
    return (1 - wet) * x + wet * y
padL = reverb(pad, 2.2, 0.35); padR = reverb(np.roll(pad, 240), 2.2, 0.35)
plL = reverb(plL, 1.6, 0.3); plR = reverb(plR, 1.6, 0.3)

L = padL + plL + bass + drums + hats * 0.9
R = padR + plR + bass + drums + hats * 1.1
# fade in 1.5 s, fade out the last 2.5 s
t = np.arange(N) / SR
env = np.minimum(1, t / 1.5) * np.clip((DUR - t) / 2.5, 0, 1)
L *= env; R *= env
L, R = L[: int(DUR * SR)], R[: int(DUR * SR)]
peak = max(np.max(np.abs(L)), np.max(np.abs(R))); L *= 0.89 / peak; R *= 0.89 / peak
st = np.stack([L, R], 1)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("music", OUT, DUR, "s")
