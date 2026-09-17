import type { TypeSafeClient } from '@typesafe-ai/sdk'
import type { Decider } from '@core/decide/types.ts'
import { makeClient } from '@core/jev/client.ts'
import { type Option, type Step, type Turn, optionsFor, turnToNote } from '@core/controller/options.ts'
import type { Exercise } from '@core/exercises/load.ts'
import type { Condition } from './conditions.ts'
import { type Note, type Score, cloneScore, placeNote, type VoiceName } from '@core/score/model.ts'
import { grade } from '@core/grader/index.ts'
import { type JevState, buildFanoutQuestion, buildQuestion, buildState } from './prompt.ts'
import { CONTROLLER_DURS, OCTAVES, PITCHES, beatLabel } from '@core/controller/options.ts'
import { VOICES, VOICE_LABEL, beatsPerBar, durBeats, isLocked, noteEnd } from '@core/score/model.ts'
import { pitchText, serializeScoreBlock } from '@core/formats/csv.ts'
import { codeLocation } from '@core/controller/policy.ts'
import { isComplete } from '@core/score/model.ts'

export interface StepRecord {
  step: Step
  options: Option[]
  choice: string
  confidence: number
  probabilities: Record<string, number>
  ms: number
  inputTokens: number
  outputTokens?: number
  costUsd: number
  model: string
  state: JevState
  instructions: string
}
export interface TurnRecord {
  n: number
  steps: StepRecord[]
  turn: Turn
  note?: Note
  removed?: Note[]
  stopped?: boolean
  invalid?: string // fanout: the assembled move was mechanically impossible
}

export type LoopEvent =
  | { type: 'step'; turnN: number; rec: StepRecord; partial: Turn }
  | { type: 'move'; rec: TurnRecord; score: Score }
  | { type: 'stop'; rec: TurnRecord }
  | { type: 'invalid'; rec: TurnRecord }
  | { type: 'stalled'; rec: TurnRecord }
  | { type: 'cap' }

export interface LoopOptions {
  maxTurns?: number
  client?: TypeSafeClient // only for requests: 'fanout' (Jev multi-question request)
  stallAfter?: number // end the run when the same score state recurs this many times (default 3; 0 = never)
  condition: Condition
  signal?: AbortSignal
}

/** Runs Jev turns as an async generator. Caller owns pacing (await next() when ready). */
/** grader issues as plain sentences — what is wrong, never what to do (strategy `feedback`) */
export function feedbackFor(score: Score): string[] {
  const r = grade(score)
  const lines = r.issues.filter(i => i.severity !== 'info').map(i => `measure ${i.m + 1}, beat ${i.beat + 1}: ${i.text}`)
  return lines.length ? lines.slice(0, 40) : ['no problems found']
}

export async function* runLoop(decider: Decider, ex: Exercise, start: Score, opts: LoopOptions): AsyncGenerator<LoopEvent, void> {
  if (opts.condition.requests === 'fanout') return yield* runLoopFanout(opts.client ?? makeClient(), ex, start, opts)
  let score = start
  const max = opts.maxTurns ?? 150
  const seen = new Map<string, number>()
  const recent: string[] = []
  for (let n = 1; n <= max; n++) {
    const turn: Turn = {}
    const steps: StepRecord[] = []
    if (opts.condition.location === 'code') { // code picks where (and how long); the model picks only the note; done when complete
      if (isComplete(score)) return
      const loc = codeLocation(score, opts.condition.strategy === 'backward' ? 'backward' : 'forward')
      if (!loc) return
      const { duration, ...where } = loc
      Object.assign(turn, where)
      ;(turn as Turn & { _dur?: typeof duration })._dur = duration
    }
    for (;;) {
      const o = optionsFor(score, turn, opts.condition)
      if (o?.step === 'duration' && (turn as Turn & { _dur?: Turn['duration'] })._dur) { turn.duration = (turn as Turn & { _dur?: Turn['duration'] })._dur; continue }
      if (!o) break
      const state = buildState(ex, score, turn, opts.condition, opts.condition.feedback ? feedbackFor(score) : undefined, recent)
      const q = buildQuestion(o.step, o.options, opts.condition)
      const criteria = Object.fromEntries(o.options.map(x => [x.key, x.description]))
      const a = await decider.decide(state, String(q.instructions), criteria, { signal: opts.signal })
      const rec: StepRecord = {
        step: o.step, options: o.options, choice: a.choice, confidence: a.confidence ?? NaN,
        probabilities: a.probabilities ?? { [a.choice]: 1 }, ms: a.ms,
        inputTokens: a.inputTokens, outputTokens: a.outputTokens, costUsd: a.costUsd, model: a.model, state, instructions: String(q.instructions),
      }
      steps.push(rec)
      const chosen = o.options.find(x => x.key === a.choice)
      if (!chosen) throw new Error(`Jev chose "${a.choice}" which is not an option`)
      Object.assign(turn, chosen.patch)
      yield { type: 'step', turnN: n, rec, partial: { ...turn } }
    }
    const trec: TurnRecord = { n, steps, turn }
    if (turn.voice === 'STOP') { trec.stopped = true; yield { type: 'stop', rec: trec }; return }
    score = cloneScore(score)
    const note = turnToNote(turn)
    trec.removed = placeNote(score, turn.voice as VoiceName, turn.measure!, note)
    trec.note = note
    recent.push(describeMove(trec, opts.condition))
    yield { type: 'move', rec: trec, score }
    const key = serializeScoreBlock(score, opts.condition)
    const k = (seen.get(key) ?? 0) + 1
    seen.set(key, k)
    if ((opts.stallAfter ?? 3) > 0 && k >= (opts.stallAfter ?? 3)) { yield { type: 'stalled', rec: trec }; return }
  }
  yield { type: 'cap' }
}

function describeMove(t: TurnRecord, c: Condition) {
  const n = t.note!, tn = t.turn
  const what = `${VOICE_LABEL[tn.voice as VoiceName]} measure ${tn.measure! + 1} ${beatLabel(n.onset).toLowerCase()}: ${pitchText(n, c.accidentals)}-${n.octave}-${n.dur}`
  const rep = t.removed?.length ? ` (replacing ${t.removed.map(r => `${pitchText(r, c.accidentals)}-${r.octave}-${r.dur}`).join(', ')})` : ''
  return `turn ${t.n}: wrote ${what}${rep}`
}

/** One request per turn with all six questions; none sees the others' answers. Mechanically impossible moves are logged and skipped. */
async function* runLoopFanout(client: TypeSafeClient, ex: Exercise, start: Score, opts: LoopOptions): AsyncGenerator<LoopEvent, void> {
  let score = start
  const c = opts.condition
  const max = opts.maxTurns ?? 150
  for (let n = 1; n <= max; n++) {
    const state = buildState(ex, score, {}, c, c.feedback ? feedbackFor(score) : undefined)
    const editable = VOICES.filter(v => s_editable(score, v))
    const optionSets: Record<Step, Option[]> = {
      voice: [...editable.map(v => ({ key: VOICE_LABEL[v], patch: { voice: v }, description: `edit the ${VOICE_LABEL[v].toLowerCase()} (row ${v} of the score)` })), { key: 'STOP', patch: { voice: 'STOP' as const }, description: 'every voice is complete and the part-writing is correct; make no more edits' }],
      measure: Array.from({ length: score.nMeasures }, (_, m) => ({ key: `MEASURE ${m + 1}`, patch: { measure: m }, description: null })),
      beat: Array.from({ length: beatsPerBar(score.time) * 2 }, (_, i) => i / 2).map(b => ({ key: beatLabel(b), patch: { beat: b }, description: null })),
      pitch: PITCHES.map(p => ({ key: pitchText(p, c.accidentals), patch: { pitch: p }, description: null })),
      octave: OCTAVES.map(o => ({ key: `OCTAVE ${o}`, patch: { octave: o }, description: o === 4 ? 'the octave starting at middle C' : null })),
      duration: CONTROLLER_DURS.map(d => ({ key: d, patch: { duration: d }, description: null })),
    }
    const questions = Object.fromEntries((Object.keys(optionSets) as Step[]).map(st => [st, buildFanoutQuestion(st, optionSets[st])]))
    const t0 = performance.now()
    const res = await client.systemOne({ state: state as unknown as Record<string, never>, questions }, { signal: opts.signal })
    const ms = Math.round(performance.now() - t0)
    const turn: Turn = {}
    const steps: StepRecord[] = []
    for (const st of Object.keys(optionSets) as Step[]) {
      const a = res.answers[st] as { choice: string; confidence: number; probabilities: Record<string, number> }
      const chosen = optionSets[st].find(o => o.key === a.choice)!
      Object.assign(turn, chosen.patch)
      const rec: StepRecord = { step: st, options: optionSets[st], choice: a.choice, confidence: a.confidence, probabilities: a.probabilities, ms, inputTokens: st === 'voice' ? res.usage.input_tokens : 0, costUsd: st === 'voice' ? res.usage.input_tokens * 0.042 / 1e6 : 0, model: res.model, state, instructions: String(questions[st].instructions) }
      steps.push(rec)
      yield { type: 'step', turnN: n, rec, partial: { ...turn } }
    }
    const trec: TurnRecord = { n, steps, turn }
    if (turn.voice === 'STOP') { trec.stopped = true; yield { type: 'stop', rec: trec }; return }
    const v = turn.voice as VoiceName, m = turn.measure!, b = turn.beat!
    const end = b + durBeats(turn.duration!, score.time)
    const hitsLocked = score.voices[v][m].some(nn => isLocked(score, v, m, nn.onset) && nn.onset < end && noteEnd(nn, score.time) > b)
    if (hitsLocked || end > beatsPerBar(score.time) + 1e-9) {
      trec.invalid = hitsLocked ? 'overlaps a given note' : 'overruns the barline'
      yield { type: 'invalid', rec: trec }
      continue
    }
    score = cloneScore(score)
    const note = turnToNote(turn)
    trec.removed = placeNote(score, v, m, note)
    trec.note = note
    yield { type: 'move', rec: trec, score }
  }
  yield { type: 'cap' }
}
const s_editable = (s: Score, v: VoiceName) => s.voices[v].some((notes, m) => notes.some(n => !isLocked(s, v, m, n.onset)) || notes.reduce((a, n) => a + durBeats(n.dur, s.time), 0) < beatsPerBar(s.time))
