import { choice, type ChoiceQuestion } from '@typesafe-ai/sdk'
import { type Option, type Step, type Turn, describeTurn } from '@core/controller/options.ts'
import type { Exercise } from '@core/exercises/load.ts'
import { FORMATS } from '@core/formats/index.ts'
import { sliceScore, type Score, VOICES, VOICE_LABEL, noteAt, beatsPerBar } from '@core/score/model.ts'
import { pitchText } from '@core/formats/csv.ts'
import { type Condition, THEORY_DETAILED, THEORY_PRIMER } from './conditions.ts'

import { TASK, TASK_FEEDBACK, TASK_HISTORY } from '@core/jev/task.ts'
export { TASK }

export interface JevState {
  task: string
  format_guide?: string
  theory_rules?: string
  exercise: { title: string; key: string; time_signature: string; instructions?: string }
  score?: string
  score_window?: string
  context?: Record<string, unknown> // framing: slice
  situation?: string // framing: narrative
  recent_moves?: string[]
  feedback?: string[]
  current_turn: Record<string, string>
}

export function buildState(ex: Exercise, score: Score, turn: Turn, c: Condition, feedback?: string[], recentMoves?: string[]): JevState {
  const st: JevState = {
    task: TASK + (c.feedback ? TASK_FEEDBACK : '') + (c.history > 0 ? TASK_HISTORY : ''),
    format_guide: FORMATS[c.format].guide(c, c.formatGuide),
    theory_rules: c.theory === 'primer' ? THEORY_PRIMER : c.theory === 'detailed' ? THEORY_DETAILED : undefined,
    exercise: { title: ex.title, key: ex.keyText, time_signature: ex.timeText, instructions: c.theory === 'none' ? undefined : ex.instructions },
    score: FORMATS[c.format].serialize(score, c),
    score_window: undefined,
    recent_moves: c.history > 0 && recentMoves?.length ? recentMoves.slice(-c.history) : undefined,
    feedback,
    current_turn: describeTurn(turn, c),
  }
  if (c.context === 'window' && turn.measure !== undefined) {
    const from = Math.max(0, turn.measure - 1), to = Math.min(score.nMeasures - 1, turn.measure + 1)
    st.score = FORMATS[c.format].serialize(sliceScore(score, from, to), c)
    st.score_window = `\`score\` shows only measures ${from + 1} to ${to + 1} of ${score.nMeasures}; its first cell is measure ${from + 1}.`
  }
  // framing (step 4): once the location is known, replace the score with a slice table or a prose description
  if (c.framing !== 'score' && turn.voice && turn.voice !== 'STOP' && turn.measure !== undefined && turn.beat !== undefined) {
    const v = turn.voice, m = turn.measure, b = turn.beat, bar = beatsPerBar(score.time)
    const at = (mm: number, bb: number) => Object.fromEntries(VOICES.map(x => { const n = noteAt(score, x, mm, bb); return [VOICE_LABEL[x].toLowerCase(), n ? (n.rest ? 'rest' : `${pitchText(n, c.accidentals)}${n.octave}`) : (x === v && mm === m && bb === b ? '?' : 'undecided')] }))
    const prevAbs = m * bar + b - 1, nextAbs = m * bar + b + 1
    const prev = prevAbs >= 0 ? at(Math.floor(prevAbs / bar), prevAbs % bar) : undefined
    const next = nextAbs < score.nMeasures * bar ? at(Math.floor(nextAbs / bar), nextAbs % bar) : undefined
    const here = at(m, b)
    delete st.score; delete st.format_guide
    if (c.framing === 'slice') st.context = { key: ex.keyText, time_signature: ex.timeText, previous_beat: prev, this_beat: here, next_beat: next, deciding: `the ${VOICE_LABEL[v].toLowerCase()} on this beat` }
    else {
      const say = (o: Record<string, string> | undefined, label: string) => o ? `${label}, ` + VOICES.map(x => `the ${VOICE_LABEL[x].toLowerCase()} ${o[VOICE_LABEL[x].toLowerCase()] === '?' ? 'is the note to decide' : o[VOICE_LABEL[x].toLowerCase()] === 'undecided' ? 'is not written yet' : `has ${o[VOICE_LABEL[x].toLowerCase()]}`}`).join(', ') + '.' : ''
      st.situation = `The key is ${ex.keyText}, in ${ex.timeText}. ${say(prev, 'On the previous beat')} ${say(here, `On this beat (measure ${m + 1}, beat ${b + 1})`)} ${say(next, 'On the following beat')} Which pitch should the ${VOICE_LABEL[v].toLowerCase()} have on this beat?`.replace(/\s+/g, ' ')
    }
  }
  for (const k of Object.keys(st) as (keyof JevState)[]) if (st[k] === undefined) delete st[k]
  if (st.exercise.instructions === undefined) delete st.exercise.instructions
  return st
}

const CONTEXTUAL: Record<Step, string> = {
  voice: 'Read `exercise` and the current `score`. Which voice do you want to write or change a note in next? Choose STOP only if every voice of `score` is complete with no undecided beats and the harmony and voice leading are correct as written.',
  measure: 'You have chosen to edit the voice named in `current_turn.voice`. In which measure of `score` do you want to write or change a note?',
  beat: 'You are editing the voice `current_turn.voice` in `current_turn.measure`. On which beat of that measure should the note begin?',
  pitch: 'You are writing a note for the voice `current_turn.voice` in `current_turn.measure` starting at `current_turn.beat`. Considering the key `exercise.key`, the other voices sounding at that moment in `score`, and the notes before and after it in the same voice, which pitch should this note be?',
  octave: 'You are writing the pitch `current_turn.pitch` for the voice `current_turn.voice` in `current_turn.measure` at `current_turn.beat`. In which octave should it be, so that it sits in a normal range for that voice and between the neighboring voices without crossing them?',
  duration: 'You are writing `current_turn.pitch` in `current_turn.octave` for the voice `current_turn.voice` in `current_turn.measure` at `current_turn.beat`. How long should the note be, given the rhythm of the other voices in that measure?',
}
const PLAIN: Record<Step, string> = {
  voice: 'Which voice do you want to edit next, or STOP if the exercise is finished?',
  measure: 'Which measure?',
  beat: 'Which beat?',
  pitch: 'Which pitch?',
  octave: 'Which octave?',
  duration: 'Which duration?',
}

const FANOUT: Record<Step, string> = {
  voice: 'Read `exercise` and the current `score`. In which voice should the next note be written or changed? Choose STOP only if every voice is complete with no undecided beats and the part-writing is correct.',
  measure: 'In which measure of `score` should the next note be written or changed?',
  beat: 'On which beat of that measure should the next note begin?',
  pitch: 'Which pitch should the next note be, given the key `exercise.key` and the other voices?',
  octave: 'In which octave should the next note be, so it sits in the range of its voice between the neighboring voices?',
  duration: 'How long should the next note be?',
}
export function buildFanoutQuestion(step: Step, options: Option[]): ChoiceQuestion {
  const criteria: Record<string, string | null> = {}
  for (const o of options) criteria[o.key] = o.description
  return choice(FANOUT[step], criteria)
}

export function buildQuestion(step: Step, options: Option[], c: Condition): ChoiceQuestion {
  const criteria: Record<string, string | null> = {}
  for (const o of options) criteria[o.key] = o.description
  return choice((c.stepWording === 'plain' ? PLAIN : CONTEXTUAL)[step], criteria)
}
