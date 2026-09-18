# Audio for a piano recording: arpeggiated chords from the page's timing log, using the FluidR3 electric piano samples.
#   python3 scripts/mixaudio-piano.py <outdir> <sampledir>
import json, subprocess, sys, wave
import numpy as np
out, sfdir = sys.argv[1], sys.argv[2]
ev = json.load(open(f'{out}/events.json'))
SR = 44100
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
cache = {}
def sample(m):
    if m not in cache:
        raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f'{sfdir}/{NAMES[m % 12]}{m // 12 - 1}.mp3', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
        cache[m] = np.frombuffer(raw, dtype=np.float32)
    return cache[m]
def note(m, seconds, gain, release=0.6):
    s = sample(m)[: int((seconds + release) * SR)].copy()
    n = len(s); env = np.ones(n); r = min(n, int(release * SR)); env[n - r:] = np.linspace(1, 0, r)
    return s * env * gain
dur = (ev['tEnd'] - ev['t0']) / 1000 + 2
mix = np.zeros(int(dur * SR), dtype=np.float32)
def place(sig, t):
    i = int(t * SR); j = min(len(mix), i + len(sig))
    if 0 <= i < len(mix): mix[i:j] += sig[: j - i]
for c in ev['events']:
    base = (c['t'] - ev['t0']) / 1000
    total = (c['holdMs'] + c['gapMs'] * len(c['notes']) + 800) / 1000
    for i, m in enumerate(c['notes']):
        gain = 0.8 if i == 0 else 0.55 if i < 3 else 0.6
        place(note(m, total - i * c['gapMs'] / 1000, gain), base + i * c['gapMs'] / 1000)
peak = np.max(np.abs(mix)) or 1
mix = mix / peak * 0.9
with wave.open(f'{out}/audio.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f'audio {dur:.1f}s, {len(ev["events"])} chords')
