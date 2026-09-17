import type { TypeSafeClient } from '@typesafe-ai/sdk'
import { type Option, type Step, type Turn, optionsFor, turnToNote } from '../controller/options.ts'
import type { Exercise } from '../exercises/load.ts'
import type { FormatVariant } from '../score/format.ts'
import { type Note, type Score, cloneScore, placeNote, type VoiceName } from '../score/model.ts'
import { type JevState, buildQuestion, buildState } from './prompt.ts'

export interface StepRecord {
  step: Step
  options: Option[]
  choice: string
  confidence: number
  probabilities: Record<string, number>
  ms: number
  inputTokens: number
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
}

export type LoopEvent =
  | { type: 'step'; turnN: number; rec: StepRecord; partial: Turn }
  | { type: 'move'; rec: TurnRecord; score: Score }
  | { type: 'stop'; rec: TurnRecord }
  | { type: 'cap' }

export interface LoopOptions {
  maxTurns?: number
  variant: FormatVariant
  signal?: AbortSignal
}

/** Runs Jev turns as an async generator. Caller owns pacing (await next() when ready). */
export async function* runLoop(client: TypeSafeClient, ex: Exercise, start: Score, opts: LoopOptions): AsyncGenerator<LoopEvent, void> {
  let score = start
  const max = opts.maxTurns ?? 150
  for (let n = 1; n <= max; n++) {
    const turn: Turn = {}
    const steps: StepRecord[] = []
    for (;;) {
      const o = optionsFor(score, turn, opts.variant)
      if (!o) break
      const state = buildState(ex, score, turn, opts.variant)
      const q = buildQuestion(o.step, o.options)
      const t0 = performance.now()
      const res = await client.systemOne({ state: state as unknown as Record<string, never>, questions: { pick: q } }, { signal: opts.signal })
      const a = res.answers.pick
      const rec: StepRecord = {
        step: o.step, options: o.options, choice: a.choice, confidence: a.confidence,
        probabilities: a.probabilities as Record<string, number>, ms: Math.round(performance.now() - t0),
        inputTokens: res.usage.input_tokens, model: res.model, state, instructions: String(q.instructions),
      }
      steps.push(rec)
      const chosen = o.options.find(x => x.key === a.choice)
      if (!chosen) throw new Error(`Jev chose "${a.choice}" which is not an option`)
      ;(turn as Record<string, unknown>)[o.step] = chosen.value
      yield { type: 'step', turnN: n, rec, partial: { ...turn } }
    }
    const trec: TurnRecord = { n, steps, turn }
    if (turn.voice === 'STOP') { trec.stopped = true; yield { type: 'stop', rec: trec }; return }
    score = cloneScore(score)
    const note = turnToNote(turn)
    trec.removed = placeNote(score, turn.voice as VoiceName, turn.measure!, note)
    trec.note = note
    yield { type: 'move', rec: trec, score }
  }
  yield { type: 'cap' }
}
