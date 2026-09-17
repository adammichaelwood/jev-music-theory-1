export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export type Acc = 'natural' | 'sharp' | 'flat'
export type VoiceName = 'S' | 'A' | 'T' | 'B'
export const VOICES: VoiceName[] = ['S', 'A', 'T', 'B']
export const VOICE_LABEL: Record<VoiceName, string> = { S: 'SOPRANO', A: 'ALTO', T: 'TENOR', B: 'BASS' }

export type Dur = 'WHOLE' | 'DOTTED-HALF' | 'HALF' | 'DOTTED-QUARTER' | 'QUARTER' | 'EIGHTH' | 'SIXTEENTH'
export const DURS: Dur[] = ['WHOLE', 'DOTTED-HALF', 'HALF', 'DOTTED-QUARTER', 'QUARTER', 'EIGHTH', 'SIXTEENTH']
// in whole-note units
export const DUR_WHOLE: Record<Dur, number> = {
  WHOLE: 1, 'DOTTED-HALF': 0.75, HALF: 0.5, 'DOTTED-QUARTER': 0.375, QUARTER: 0.25, EIGHTH: 0.125, SIXTEENTH: 0.0625,
}

export interface Time { num: number; den: number }
export interface Key { tonic: Letter; acc: Acc; mode: 'major' | 'minor' }

export interface Note {
  letter: Letter
  acc: Acc
  octave: number
  dur: Dur
  onset: number // beats from bar start (beat = 1/den whole note)
  figures?: string // canonical form: '#', 'b', 'n' accidentals, '/' stacked
  rest?: boolean
}

export interface Score {
  key: Key
  time: Time
  nMeasures: number
  voices: Record<VoiceName, Note[][]> // voices[v][measure] = notes sorted by onset
  locked: Set<string> // lockKey(v, m, onset) for given notes
}

export const lockKey = (v: VoiceName, m: number, onset: number) => `${v}:${m}:${onset}`

export const beatsPerBar = (t: Time) => t.num
/** duration in beats for this time signature */
export const durBeats = (d: Dur, t: Time) => DUR_WHOLE[d] * t.den
/** the "one beat" gap unit: dotted quarter in compound meters, else the denominator */
export const beatUnitDur = (t: Time): Dur =>
  t.den === 8 && t.num % 3 === 0 ? 'DOTTED-QUARTER' : t.den === 2 ? 'HALF' : t.den === 8 ? 'EIGHTH' : 'QUARTER'

export function emptyScore(key: Key, time: Time, nMeasures: number): Score {
  const mk = () => Array.from({ length: nMeasures }, () => [] as Note[])
  return { key, time, nMeasures, voices: { S: mk(), A: mk(), T: mk(), B: mk() }, locked: new Set() }
}

export function cloneScore(s: Score): Score {
  return {
    ...s,
    voices: { S: cp(s.voices.S), A: cp(s.voices.A), T: cp(s.voices.T), B: cp(s.voices.B) },
    locked: new Set(s.locked),
  }
  function cp(v: Note[][]) { return v.map(m => m.map(n => ({ ...n }))) }
}

export const isLocked = (s: Score, v: VoiceName, m: number, onset: number) => s.locked.has(lockKey(v, m, onset))

/** all (measure, note) pairs of a voice, flattened in time order */
export function voiceNotes(s: Score, v: VoiceName): { m: number; note: Note }[] {
  const out: { m: number; note: Note }[] = []
  s.voices[v].forEach((notes, m) => notes.forEach(note => out.push({ m, note })))
  return out
}

export function noteEnd(n: Note, t: Time) { return n.onset + durBeats(n.dur, t) }

/** the note sounding in voice v at (measure m, beat b), if any */
export function noteAt(s: Score, v: VoiceName, m: number, b: number): Note | undefined {
  return s.voices[v][m]?.find(n => n.onset <= b && b < noteEnd(n, s.time))
}

/** undecided spans of a measure as [start, end) in beats */
export function gaps(s: Score, v: VoiceName, m: number): [number, number][] {
  const out: [number, number][] = []
  let cur = 0
  for (const n of s.voices[v][m]) {
    if (n.onset > cur) out.push([cur, n.onset])
    cur = Math.max(cur, noteEnd(n, s.time))
  }
  const bar = beatsPerBar(s.time)
  if (cur < bar) out.push([cur, bar])
  return out
}

export function isComplete(s: Score) {
  return VOICES.every(v => s.voices[v].every((_, m) => gaps(s, v, m).length === 0))
}

/** Insert a note, removing any unlocked notes it overlaps. Returns the removed notes. Throws if it would overlap a locked note. */
export function placeNote(s: Score, v: VoiceName, m: number, note: Note): Note[] {
  const end = note.onset + durBeats(note.dur, s.time)
  const bar = s.voices[v][m]
  const overlapping = bar.filter(n => n.onset < end && noteEnd(n, s.time) > note.onset)
  const lockedHit = overlapping.find(n => isLocked(s, v, m, n.onset))
  if (lockedHit) throw new Error(`overlaps locked note at ${lockKey(v, m, lockedHit.onset)}`)
  if (end > beatsPerBar(s.time) + 1e-9) throw new Error('note overruns the barline')
  s.voices[v][m] = [...bar.filter(n => !overlapping.includes(n)), note].sort((a, b) => a.onset - b.onset)
  return overlapping
}

// ---- pitch arithmetic (code only; Jev never does this) ----
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ACC_OFF: Record<Acc, number> = { natural: 0, sharp: 1, flat: -1 }
export const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
export function midi(n: Pick<Note, 'letter' | 'acc' | 'octave'>) {
  return 12 * (n.octave + 1) + LETTER_PC[n.letter] + ACC_OFF[n.acc]
}
export const pitchClass = (n: Pick<Note, 'letter' | 'acc'>) => ((LETTER_PC[n.letter] + ACC_OFF[n.acc]) % 12 + 12) % 12
export const letterIndex = (l: Letter) => LETTERS.indexOf(l)
/** diatonic steps between two pitches (positive = up) */
export const diatonicSteps = (a: Pick<Note, 'letter' | 'octave'>, b: Pick<Note, 'letter' | 'octave'>) =>
  (b.octave * 7 + letterIndex(b.letter)) - (a.octave * 7 + letterIndex(a.letter))

/** a copy containing only measures [from, to] (inclusive); locked keys are renumbered */
export function sliceScore(s: Score, from: number, to: number): Score {
  const out = emptyScore(s.key, s.time, to - from + 1)
  for (const v of VOICES) for (let m = from; m <= to; m++) {
    out.voices[v][m - from] = s.voices[v][m].map(n => ({ ...n }))
    for (const n of s.voices[v][m]) if (isLocked(s, v, m, n.onset)) out.locked.add(lockKey(v, m - from, n.onset))
  }
  return out
}
