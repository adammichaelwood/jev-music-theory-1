import { pitchText, type FormatVariant } from '../score/format.ts'
import {
  type Acc, type Dur, type Letter, type Note, type Score, type VoiceName, VOICES, VOICE_LABEL, LETTERS,
  beatsPerBar, durBeats, gaps, isLocked, noteEnd,
} from '../score/model.ts'

export type Step = 'voice' | 'measure' | 'beat' | 'pitch' | 'octave' | 'duration'
export const STEPS: Step[] = ['voice', 'measure', 'beat', 'pitch', 'octave', 'duration']

export interface Turn {
  voice?: VoiceName | 'STOP'
  measure?: number // 0-based
  beat?: number // onset in beats, 0-based
  pitch?: { letter: Letter; acc: Acc }
  octave?: number
  duration?: Dur
}

export interface Option<T = unknown> {
  key: string // the Choice criteria key Jev sees and returns
  description: string | null
  value: T
}

export const CONTROLLER_DURS: Dur[] = ['EIGHTH', 'QUARTER', 'DOTTED-QUARTER', 'HALF', 'DOTTED-HALF', 'WHOLE']
export const OCTAVES = [2, 3, 4, 5, 6]
/** all 21 spellings, chromatic order, flats before sharps within a pair */
export const PITCHES: { letter: Letter; acc: Acc }[] = (() => {
  const out: { letter: Letter; acc: Acc }[] = []
  for (const letter of LETTERS) for (const acc of ['flat', 'natural', 'sharp'] as Acc[]) out.push({ letter, acc })
  return out
})()

export function nextStep(t: Turn): Step | 'done' {
  if (t.voice === undefined) return 'voice'
  if (t.voice === 'STOP') return 'done'
  if (t.measure === undefined) return 'measure'
  if (t.beat === undefined) return 'beat'
  if (t.pitch === undefined) return 'pitch'
  if (t.octave === undefined) return 'octave'
  if (t.duration === undefined) return 'duration'
  return 'done'
}

const voiceEditable = (s: Score, v: VoiceName) => s.voices[v].some((_, m) => measureEditable(s, v, m))
const measureEditable = (s: Score, v: VoiceName, m: number) =>
  gaps(s, v, m).length > 0 || s.voices[v][m].some(n => !isLocked(s, v, m, n.onset))
/** is beat position b in (v, m) free of locked notes? */
const beatFree = (s: Score, v: VoiceName, m: number, b: number) =>
  !s.voices[v][m].some(n => isLocked(s, v, m, n.onset) && n.onset <= b && b < noteEnd(n, s.time))

export function beatLabel(b: number) {
  const whole = Math.floor(b), frac = b - whole
  return frac === 0 ? `BEAT ${whole + 1}` : `AND OF ${whole + 1}`
}

/** Option set for the next step. Only *mechanical* filtering (self-answered S3). */
export function optionsFor(s: Score, t: Turn, variant: FormatVariant): { step: Step; options: Option[] } | null {
  const step = nextStep(t)
  if (step === 'done') return null
  switch (step) {
    case 'voice':
      return { step, options: [
        ...VOICES.filter(v => voiceEditable(s, v)).map(v => ({
          key: VOICE_LABEL[v], value: v, description: `edit the ${VOICE_LABEL[v].toLowerCase()} (row ${v} of the score)`,
        })),
        { key: 'STOP', value: 'STOP', description: 'every voice is complete and the part-writing is correct; make no more edits' },
      ] }
    case 'measure':
      return { step, options: Array.from({ length: s.nMeasures }, (_, m) => m)
        .filter(m => measureEditable(s, t.voice as VoiceName, m))
        .map(m => ({ key: `MEASURE ${m + 1}`, value: m, description: null })) }
    case 'beat': {
      const v = t.voice as VoiceName, m = t.measure!
      const positions: number[] = []
      for (let b = 0; b < beatsPerBar(s.time); b += 0.5) positions.push(b)
      return { step, options: positions.filter(b => beatFree(s, v, m, b)).map(b => ({ key: beatLabel(b), value: b, description: null })) }
    }
    case 'pitch':
      return { step, options: PITCHES.map(p => ({ key: pitchText(p, variant.accidentals), value: p, description: null })) }
    case 'octave':
      return { step, options: OCTAVES.map(o => ({
        key: `OCTAVE ${o}`, value: o, description: o === 4 ? 'the octave starting at middle C' : null,
      })) }
    case 'duration': {
      const v = t.voice as VoiceName, m = t.measure!, b = t.beat!
      const bar = beatsPerBar(s.time)
      const nextLocked = s.voices[v][m].filter(n => isLocked(s, v, m, n.onset) && n.onset > b).map(n => n.onset)
      const limit = Math.min(bar, ...nextLocked) - b
      return { step, options: CONTROLLER_DURS.filter(d => durBeats(d, s.time) <= limit + 1e-9).map(d => ({
        key: d, value: d, description: durDescription(d, s),
      })) }
    }
  }
}

function durDescription(d: Dur, s: Score) {
  const b = durBeats(d, s.time)
  const name = d.toLowerCase().replace('-', ' ') + ' note'
  return `a ${name} (${b === 1 ? 'one beat' : `${b} beats`} in ${s.time.num}/${s.time.den})`
}

export function turnToNote(t: Turn): Note {
  return { ...t.pitch!, octave: t.octave!, dur: t.duration!, onset: t.beat! }
}

/** human-readable summary of a (partial) turn, also used inside Jev's state */
export function describeTurn(t: Turn, variant: FormatVariant): Record<string, string> {
  const out: Record<string, string> = {}
  if (t.voice !== undefined) out.voice = t.voice === 'STOP' ? 'STOP' : VOICE_LABEL[t.voice]
  if (t.measure !== undefined) out.measure = `MEASURE ${t.measure + 1}`
  if (t.beat !== undefined) out.beat = beatLabel(t.beat)
  if (t.pitch !== undefined) out.pitch = pitchText(t.pitch, variant.accidentals)
  if (t.octave !== undefined) out.octave = `OCTAVE ${t.octave}`
  if (t.duration !== undefined) out.duration = t.duration
  return out
}
