// Policy helpers (step 4): code-chosen locations, and pitch-option filters (diatonic / chord tones).
import { type Acc, type Letter, type Note, type Score, type VoiceName, VOICES, DURS, beatsPerBar, durBeats, gaps, isLocked, noteAt, pitchClass } from '@core/score/model.ts'
import { identifyChord, keyAccidental } from '@core/grader/index.ts'
import { LETTERS, letterIndex } from '@core/score/model.ts'
import type { Turn } from '@core/controller/options.ts'

/** the next location code would fill: earliest (or latest) gap, bass-first; duration runs to the next attack in any voice */
export function codeLocation(s: Score, order: 'forward' | 'backward' = 'forward'): Turn | null {
  const bar = beatsPerBar(s.time)
  const all: { v: VoiceName; m: number; gap: [number, number]; abs: number }[] = []
  for (const v of VOICES) for (let m = 0; m < s.nMeasures; m++) for (const g of gaps(s, v, m)) all.push({ v, m, gap: g, abs: m * bar + g[0] })
  if (!all.length) return null
  const pick = order === 'forward' ? Math.min(...all.map(x => x.abs)) : Math.max(...all.map(x => x.abs))
  const order4: VoiceName[] = ['B', 'T', 'A', 'S']
  const hit = all.filter(x => x.abs === pick).sort((a, b) => order4.indexOf(a.v) - order4.indexOf(b.v))[0]
  const beat = order === 'forward' ? hit.gap[0] : lastUnitStart(hit.gap)
  // duration: up to the next attack in any other voice (or the gap end), longest expressible value
  let limit = (order === 'forward' ? hit.gap[1] : hit.gap[1]) - beat
  for (const v of VOICES) if (v !== hit.v) for (const n of s.voices[v][hit.m]) if (n.onset > beat && n.onset - beat < limit) limit = n.onset - beat
  const dur = DURS.find(d => durBeats(d, s.time) <= limit + 1e-9) ?? 'QUARTER'
  return { voice: hit.v, measure: hit.m, beat, duration: dur }
}
function lastUnitStart(gap: [number, number]) {
  // for backward filling: the start of the last beat-sized slot in the gap
  const unit = Math.min(1, gap[1] - gap[0])
  return Math.max(gap[0], gap[1] - unit)
}

const ALL: { letter: Letter; acc: Acc }[] = LETTERS.flatMap(l => (['flat', 'natural', 'sharp'] as Acc[]).map(acc => ({ letter: l, acc })))

/** pitch classes in the key (harmonic minor: both natural and raised 7th) */
export function diatonicPcs(s: Score): Set<number> {
  const out = new Set<number>()
  for (const l of LETTERS) out.add(pitchClass({ letter: l, acc: keyAccidental(l, s.key) }))
  if (s.key.mode === 'minor') { const lt = LETTERS[(letterIndex(s.key.tonic) + 6) % 7]; const a = keyAccidental(lt, s.key); out.add(pitchClass({ letter: lt, acc: a === 'flat' ? 'natural' : 'sharp' })) }
  return out
}

/** pitch classes of the chord at (m, beat): from the bass figures if present, else identified from the other sounding voices; null if unknown */
export function chordPcs(s: Score, v: VoiceName, m: number, beat: number): Set<number> | null {
  const bass = noteAt(s, 'B', m, beat)
  if (bass && !bass.rest && bass.figures !== undefined && isLocked(s, 'B', m, bass.onset)) {
    const f = bass.figures.replace(/[#bn♯♭♮]/g, '')
    const bpc = pitchClass(bass)
    const tri = (ints: number[]) => new Set(ints.map(i => (bpc + i) % 12))
    // intervals above the bass (in the key's diatonic scale) by figure — approximate with diatonic steps above the bass
    const stepsAbove = (n: number) => { const l = LETTERS[(letterIndex(bass.letter) + n) % 7]; const acc = keyAccidental(l, s.key); return pitchClass({ letter: l, acc }) }
    const alter = (pc: number) => { const m2 = /[#♯]/.test(bass.figures!) ? 1 : /[b♭]/.test(bass.figures!) ? -1 : 0; return (pc + m2 + 12) % 12 }
    const third = stepsAbove(2), fifth = stepsAbove(4), sixth = stepsAbove(5), fourth = stepsAbove(3), seventh = stepsAbove(6), second = stepsAbove(1)
    if (f === '' || f === '5' || f === '5/3') return new Set([bpc, /^[#b♯♭]$/.test(bass.figures) ? alter(third) : third, fifth])
    if (f === '6' || f === '6/3') return new Set([bpc, third, sixth])
    if (f === '6/4') return new Set([bpc, fourth, sixth])
    if (f === '7' || f === '7/5/3') return new Set([bpc, third, fifth, seventh])
    if (f === '6/5' || f === '6/5/3') return new Set([bpc, third, fifth, sixth])
    if (f === '4/3' || f === '6/4/3') return new Set([bpc, third, fourth, sixth])
    if (f === '4/2' || f === '2' || f === '6/4/2') return new Set([bpc, second, fourth, sixth])
    void tri
  }
  const others = VOICES.filter(x => x !== v).map(x => noteAt(s, x, m, beat)).filter((n): n is Note => !!n && !n.rest)
  if (others.length < 2) return null
  const id = identifyChord(others, s.key)
  if (!id || id.quality === 'root only') return null
  return new Set(id.pcs.length >= 3 ? id.pcs : [...id.pcs, ...completeTriad(id)])
}
function completeTriad(id: { root: { letter: Letter; acc: Acc }; quality: string }): number[] {
  const r = pitchClass(id.root)
  const iv = id.quality === 'minor' ? [3, 7] : id.quality === 'diminished' ? [3, 6] : id.quality === 'augmented' ? [4, 8] : [4, 7]
  return iv.map(i => (r + i) % 12)
}

export function filterPitches(policy: 'all' | 'diatonic' | 'chord-tones', s: Score, t: Turn): { letter: Letter; acc: Acc }[] {
  if (policy === 'all') return ALL
  let pcs: Set<number> | null = null
  if (policy === 'chord-tones' && t.voice && t.voice !== 'STOP' && t.measure !== undefined && t.beat !== undefined) pcs = chordPcs(s, t.voice, t.measure, t.beat)
  if (!pcs) pcs = diatonicPcs(s)
  return ALL.filter(p => pcs!.has(pitchClass(p)))
}
