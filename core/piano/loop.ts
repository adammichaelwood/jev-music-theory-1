// "Jev plays piano": root → quality → bass, three sequential Choice calls per chord; code voices and plays it.
import type { Decider, Decision } from '@core/decide/types.ts'
import { PIANO_TASK } from '@core/jev/task.ts'
import { type Chord, type Root, type Voicing, QUALITIES, QUALITY_KEYS, ROOTS, bassOptions, chordSymbol, classifyTransition, estimateKey, parseRootKey, rootKey, voice } from '@core/piano/chords.ts'

export type PianoStep = 'root' | 'quality' | 'bass'
export interface PianoStepRecord { step: PianoStep; options: Record<string, string | null>; decision: Decision }
export interface ChordRecord { n: number; chord: Chord; symbol: string; voicing: Voicing; steps: PianoStepRecord[]; transition: string | null; keyEstimate: string; costUsd: number; ms: number }
export type PianoEvent = { type: 'step'; n: number; rec: PianoStepRecord; partial: Partial<Chord> } | { type: 'chord'; rec: ChordRecord }

export interface PianoOptions { vibe: string; historyLength?: number; maxChords?: number; signal?: AbortSignal }

export const DEFAULT_VIBE = 'A slow, mellow late-night solo piano improvisation with rich jazz harmony. Let the harmony wander, surprise occasionally, and come home now and then.'

const Q_ROOT = 'Choose the root of the next chord.'
const Q_QUALITY = 'The next chord\'s root is `current.root`. Choose its quality.'
const Q_BASS = 'The next chord is `current.root` `current.quality`. Choose which chord tone the left hand plays in the bass.'

export async function* pianoLoop(decider: Decider, opts: PianoOptions): AsyncGenerator<PianoEvent, void> {
  const played: Chord[] = []
  let prevVoicing: Voicing | null = null
  const max = opts.maxChords ?? Infinity
  for (let n = 1; n <= max; n++) {
    if (opts.signal?.aborted) return
    const partial: Partial<Chord> = {}
    const steps: PianoStepRecord[] = []
    const state = () => ({
      task: PIANO_TASK, vibe: opts.vibe,
      played: played.slice(-(opts.historyLength ?? 24)).map(chordSymbol),
      chords_so_far: played.length,
      current: { ...(partial.root ? { root: rootKey(partial.root) } : {}), ...(partial.quality ? { quality: partial.quality } : {}) },
    })
    const ask = async (step: PianoStep, instructions: string, options: Record<string, string | null>) => {
      const decision = await decider.decide(state(), instructions, options, { signal: opts.signal })
      const rec = { step, options, decision }; steps.push(rec); return rec
    }
    const r = await ask('root', Q_ROOT, Object.fromEntries(ROOTS.map(x => [rootKey(x), null])))
    partial.root = parseRootKey(r.decision.choice)
    yield { type: 'step', n, rec: r, partial: { ...partial } }
    const q = await ask('quality', Q_QUALITY, Object.fromEntries(QUALITY_KEYS.map(k => [k, QUALITIES[k].describe])))
    partial.quality = q.decision.choice
    yield { type: 'step', n, rec: q, partial: { ...partial } }
    const bo = bassOptions(partial.root, partial.quality)
    const b = await ask('bass', Q_BASS, Object.fromEntries(bo.map(x => [x.key, x.description])))
    const chosen = bo.find(x => x.key === b.decision.choice) ?? bo[0]
    const chord: Chord = { root: partial.root as Root, quality: partial.quality, bassInterval: chosen.semis }
    yield { type: 'step', n, rec: b, partial: { ...chord } }
    const voicing = voice(chord, prevVoicing)
    const prev = played[played.length - 1]
    played.push(chord); prevVoicing = voicing
    yield { type: 'chord', rec: { n, chord, symbol: chordSymbol(chord), voicing, steps, transition: prev ? classifyTransition(prev, chord) : null, keyEstimate: estimateKey(played), costUsd: steps.reduce((a, s) => a + s.decision.costUsd, 0), ms: steps.reduce((a, s) => a + s.decision.ms, 0) } }
  }
}

/** rolling statistics over a chord stream */
export function streamStats(recs: ChordRecord[]) {
  const n = recs.length
  const transitions = recs.map(r => r.transition).filter((t): t is string => !!t)
  const count = (pred: (t: string) => boolean) => transitions.filter(pred).length
  const uniq = new Set(recs.map(r => r.symbol)).size
  const keys = recs.map(r => r.keyEstimate)
  const keyChanges = keys.filter((k, i) => i > 0 && k !== keys[i - 1]).length
  const qualities: Record<string, number> = {}
  for (const r of recs) qualities[r.chord.quality] = (qualities[r.chord.quality] ?? 0) + 1
  return {
    chords: n, distinct: uniq, repeats: count(t => t === 'repeat'),
    functional: count(t => /V → I|ii → V|iiø → V|tritone sub/.test(t)), fifthDown: count(t => t === 'down a fifth' || /→/.test(t)),
    chromatic: count(t => t === 'chromatic'), thirdRelation: count(t => t === 'third relation'), other: count(t => t === 'other' || t === 'tritone' || t === 'step' || t === 'up a fifth'),
    keyChanges, qualities, inversions: recs.filter(r => r.chord.bassInterval !== 0).length,
    costUsd: recs.reduce((a, r) => a + r.costUsd, 0), msPerChord: n ? recs.reduce((a, r) => a + r.ms, 0) / n : 0,
  }
}
