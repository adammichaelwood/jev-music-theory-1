import { pitchText, type FormatVariant } from '@core/formats/csv.ts'
import {
  type Acc, type Dur, type Letter, type Note, type Score, type VoiceName, VOICES, VOICE_LABEL, LETTERS,
  beatsPerBar, durBeats, gaps, isComplete, isLocked, noteEnd,
} from '@core/score/model.ts'

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

export interface Option {
  key: string // the Choice criteria key Jev sees and returns
  description: string | null
  patch: Partial<Turn> // what choosing it sets on the turn
}

/** the levers optionsFor cares about (a Condition satisfies this) */
export interface ControllerOpts extends FormatVariant {
  strategy?: 'free' | 'forward' | 'backward' | 'line'
  pitchOctave?: 'split' | 'merged'
}

export const CONTROLLER_DURS: Dur[] = ['EIGHTH', 'QUARTER', 'DOTTED-QUARTER', 'HALF', 'DOTTED-HALF', 'WHOLE']
export const OCTAVES = [2, 3, 4, 5, 6]
/** all 21 spellings, letter order, flat/natural/sharp */
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

/** strategy focus: which (voice, measure, gap) the strategy allows right now; undefined = unconstrained */
interface Focus { voices: VoiceName[]; measure?: number; gap?: [number, number] }
function focusFor(s: Score, o: ControllerOpts): Focus | undefined {
  const strat = o.strategy ?? 'free'
  if (strat === 'free' || isComplete(s)) return undefined
  const bar = beatsPerBar(s.time)
  if (strat === 'line') {
    const v = (['B', 'S', 'A', 'T'] as VoiceName[]).find(v => s.voices[v].some((_, m) => gaps(s, v, m).length))
    return v ? { voices: [v] } : undefined
  }
  // forward/backward: the earliest (latest) gap anywhere; every voice with a gap there is offered
  const all: { v: VoiceName; m: number; gap: [number, number]; abs: number }[] = []
  for (const v of VOICES) for (let m = 0; m < s.nMeasures; m++) for (const g of gaps(s, v, m)) all.push({ v, m, gap: g, abs: m * bar + (strat === 'forward' ? g[0] : g[1]) })
  const pick = strat === 'forward' ? Math.min(...all.map(x => x.abs)) : Math.max(...all.map(x => x.abs))
  const hits = all.filter(x => x.abs === pick)
  return { voices: [...new Set(hits.map(x => x.v))], measure: hits[0].m, gap: hits[0].gap }
}

/** Option set for the next step. Only *mechanical* filtering (self-answered S3) plus strategy ordering constraints (§5.1). */
export function optionsFor(s: Score, t: Turn, o: ControllerOpts): { step: Step; options: Option[] } | null {
  const step = nextStep(t)
  if (step === 'done') return null
  const focus = focusFor(s, o)
  switch (step) {
    case 'voice':
      return { step, options: [
        ...VOICES.filter(v => voiceEditable(s, v) && (!focus || focus.voices.includes(v))).map(v => ({
          key: VOICE_LABEL[v], patch: { voice: v }, description: `edit the ${VOICE_LABEL[v].toLowerCase()} (row ${v} of the score)`,
        })),
        { key: 'STOP', patch: { voice: 'STOP' as const }, description: 'every voice is complete and the part-writing is correct; make no more edits' },
      ] }
    case 'measure':
      return { step, options: Array.from({ length: s.nMeasures }, (_, m) => m)
        .filter(m => measureEditable(s, t.voice as VoiceName, m) && (focus?.measure === undefined || focus.measure === m))
        .map(m => ({ key: `MEASURE ${m + 1}`, patch: { measure: m }, description: null })) }
    case 'beat': {
      const v = t.voice as VoiceName, m = t.measure!
      const positions: number[] = []
      for (let b = 0; b < beatsPerBar(s.time); b += 0.5) positions.push(b)
      const inFocus = (b: number) => !focus?.gap || focus.measure !== m || (b >= focus.gap[0] && b < focus.gap[1])
      return { step, options: positions.filter(b => beatFree(s, v, m, b) && inFocus(b)).map(b => ({ key: beatLabel(b), patch: { beat: b }, description: null })) }
    }
    case 'pitch':
      if (o.pitchOctave === 'merged')
        return { step, options: PITCHES.flatMap(p => OCTAVES.map(oc => ({ key: `${pitchText(p, o.accidentals)}-${oc}`, patch: { pitch: p, octave: oc }, description: null }))) }
      return { step, options: PITCHES.map(p => ({ key: pitchText(p, o.accidentals), patch: { pitch: p }, description: null })) }
    case 'octave':
      return { step, options: OCTAVES.map(oc => ({
        key: `OCTAVE ${oc}`, patch: { octave: oc }, description: oc === 4 ? 'the octave starting at middle C' : null,
      })) }
    case 'duration': {
      const v = t.voice as VoiceName, m = t.measure!, b = t.beat!
      const bar = beatsPerBar(s.time)
      const nextLocked = s.voices[v][m].filter(n => isLocked(s, v, m, n.onset) && n.onset > b).map(n => n.onset)
      const limit = Math.min(bar, ...nextLocked) - b
      return { step, options: CONTROLLER_DURS.filter(d => durBeats(d, s.time) <= limit + 1e-9).map(d => ({
        key: d, patch: { duration: d }, description: durDescription(d, s),
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
