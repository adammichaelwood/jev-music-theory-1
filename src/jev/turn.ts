import type { TypeSafeClient } from '@typesafe-ai/sdk'
import { type Option, type Step, type Turn, optionsFor, turnToNote } from '../controller/options.ts'
import type { Exercise } from '../exercises/load.ts'
import type { Condition } from './conditions.ts'
import { type Note, type Score, cloneScore, placeNote, type VoiceName } from '../score/model.ts'
import { grade } from '../grader/index.ts'
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

export async function* runLoop(client: TypeSafeClient, ex: Exercise, start: Score, opts: LoopOptions): AsyncGenerator<LoopEvent, void> {
  let score = start
  const max = opts.maxTurns ?? 150
  for (let n = 1; n <= max; n++) {
    const turn: Turn = {}
    const steps: StepRecord[] = []
    for (;;) {
      const o = optionsFor(score, turn, opts.condition)
      if (!o) break
      const state = buildState(ex, score, turn, opts.condition, opts.condition.feedback ? feedbackFor(score) : undefined)
      const q = buildQuestion(o.step, o.options, opts.condition)
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
      Object.assign(turn, chosen.patch)
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
