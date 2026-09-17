# Build the audio track for a recording: auditions (one piano note each) + full playbacks, using abcjs's FluidR3 piano samples.
#   python3 scripts/mixaudio.py <outdir> <sampledir>
import json, subprocess, sys, wave
import numpy as np
out, sfdir = sys.argv[1], sys.argv[2]
ev = json.load(open(f'{out}/events.json'))
SR = 44100
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
cache = {}
def sample(m):
    if m not in cache:
        name = f'{NAMES[m % 12]}{m // 12 - 1}'
        raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f'{sfdir}/{name}.mp3', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
        cache[m] = np.frombuffer(raw, dtype=np.float32)
    return cache[m]
def note(m, seconds, gain, release=0.12):
    s = sample(m)[: int((seconds + release) * SR)].copy()
    n = len(s); env = np.ones(n)
    r = min(n, int(release * SR)); env[n - r:] = np.linspace(1, 0, r)
    return s * env * gain
dur = (ev['tEnd'] - ev['t0']) / 1000 + 1
mix = np.zeros(int(dur * SR), dtype=np.float32)
def place(sig, t):
    i = int(t * SR); j = min(len(mix), i + len(sig))
    if i < len(mix): mix[i:j] += sig[: j - i]
for a in ev['auditions']:
    place(note(a['midi'], a['ms'] / 1000, 0.7), (a['t'] - ev['t0']) / 1000)
for p in ev['playbacks']:
    base = (p['t'] - ev['t0']) / 1000 + 0.15
    for n in p['notes']:
        place(note(n['midi'], n['dur'] * 0.95, 0.45), base + n['start'])
peak = np.max(np.abs(mix)) or 1
mix = mix / peak * 0.89
with wave.open(f'{out}/audio.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f'audio {dur:.1f}s, {len(ev["auditions"])} auditions, {sum(len(p["notes"]) for p in ev["playbacks"])} playback notes')
