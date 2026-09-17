import { choice, type ChoiceQuestion } from '@typesafe-ai/sdk'
import { type Option, type Step, type Turn, describeTurn } from '../controller/options.ts'
import type { Exercise } from '../exercises/load.ts'
import { type FormatVariant, serializeScoreBlock } from '../score/format.ts'
import type { Score } from '../score/model.ts'

/** How the score text is to be read. Sent inside the state on every request. */
export function formatGuide(v: FormatVariant) {
  const ex = v.accidentals === 'unicode'
    ? { flat: 'A♭', sharp: 'F♯', sig: '♯ / ♭ after the letter' }
    : { flat: 'A-FLAT', sharp: 'F-SHARP', sig: '-SHARP / -FLAT after the letter' }
  return [
    'The score is a four-part chorale written as text, one row per voice: S (soprano), A (alto), T (tenor), B (bass), from highest voice to lowest.',
    'Each row starts with its voice letter. The cells after it, separated by commas, are the measures in order: the first cell is measure 1, the next is measure 2, and so on. The four rows have the same number of measures, so the Nth cell of each row is the same measure.',
    'Inside a measure, notes are listed in time order from the start of the measure, separated by spaces. Each note is PITCH-OCTAVE-DURATION.',
    `PITCH is a letter A to G with an optional accidental: ${ex.sig}. Natural notes have no accidental marker. ${ex.sharp} and ${ex.flat.replace('A', 'G')} are different spellings and are written differently.`,
    'OCTAVE is a number: 4 is the octave beginning at middle C, 5 is the octave above, 3 the octave below. C-4 is middle C; B-3 is the note just below it.',
    'DURATION is WHOLE, DOTTED-HALF, HALF, DOTTED-QUARTER, QUARTER, EIGHTH or SIXTEENTH.',
    'In figured-bass exercises a bass note may carry figures after its duration, for example G-3-QUARTER-6/4 is a G with the figures 6/4 beneath it.',
    'An underscore _ is one beat that has not been decided yet; _-EIGHTH is half a beat undecided. An empty cell is a whole measure in which nothing has been decided yet for that voice.',
    `Example in 4/4: "A, E-4-QUARTER F-4-QUARTER G-4-HALF, _ _ ${ex.flat}-4-HALF" is an alto part: measure 1 has E4 and F4 as quarter notes on beats 1 and 2, then G4 as a half note on beats 3-4; measure 2 is undecided on beats 1 and 2, then ${ex.flat}4 as a half note on beats 3-4.`,
    'Notes that start in the same character column of different rows in the same measure sound at the same time.',
  ].join(' ')
}

export const TASK = 'You are completing an undergraduate music-theory exercise in four-part (SATB) common-practice harmony. You edit the score one note at a time using a controller: choose a voice, a measure, a beat, a pitch, an octave and a duration. The note you write replaces anything you previously wrote at that place in that voice. Notes given by the exercise cannot be changed. The score already contains everything decided so far.'

export interface JevState {
  task: string
  format_guide: string
  exercise: { title: string; key: string; time_signature: string; instructions: string }
  score: string
  current_turn: Record<string, string>
}

export function buildState(ex: Exercise, score: Score, turn: Turn, v: FormatVariant): JevState {
  return {
    task: TASK,
    format_guide: formatGuide(v),
    exercise: { title: ex.title, key: ex.keyText, time_signature: ex.timeText, instructions: ex.instructions },
    score: serializeScoreBlock(score, v),
    current_turn: describeTurn(turn, v),
  }
}

const STEP_INSTRUCTIONS: Record<Step, string> = {
  voice: 'Read `exercise.instructions` and the current `score`. Which voice do you want to write or change a note in next? Choose STOP only if every voice of `score` is complete with no undecided beats and the harmony and voice leading are correct as written.',
  measure: 'You have chosen to edit the voice named in `current_turn.voice`. In which measure of `score` do you want to write or change a note?',
  beat: 'You are editing the voice `current_turn.voice` in `current_turn.measure`. On which beat of that measure should the note begin?',
  pitch: 'You are writing a note for the voice `current_turn.voice` in `current_turn.measure` starting at `current_turn.beat`. Considering the key `exercise.key`, the other voices sounding at that moment in `score`, and the notes before and after it in the same voice, which pitch should this note be?',
  octave: 'You are writing the pitch `current_turn.pitch` for the voice `current_turn.voice` in `current_turn.measure` at `current_turn.beat`. In which octave should it be, so that it sits in a normal range for that voice and between the neighboring voices without crossing them?',
  duration: 'You are writing `current_turn.pitch` in `current_turn.octave` for the voice `current_turn.voice` in `current_turn.measure` at `current_turn.beat`. How long should the note be, given the rhythm of the other voices in that measure?',
}

export function buildQuestion(step: Step, options: Option[]): ChoiceQuestion {
  const criteria: Record<string, string | null> = {}
  for (const o of options) criteria[o.key] = o.description
  return choice(STEP_INSTRUCTIONS[step], criteria)
}
