import type { FormatVariant } from '@core/formats/csv.ts'
import type { FormatName } from '@core/formats/index.ts'

/** One experimental condition: every lever we vary in the prompt/state. */
export interface Condition extends FormatVariant {
  name: string
  format: FormatName // how the score is written for the model
  formatGuide: 'none' | 'brief' | 'full'
  theory: 'none' | 'exercise' | 'primer' | 'detailed'
  stepWording: 'plain' | 'contextual'
  // strategies (§5.1)
  strategy: 'free' | 'forward' | 'backward' | 'line'
  feedback: boolean // grader issues placed in state after every move
  pitchOctave: 'split' | 'merged' // one Choice for pitch+octave instead of two
  context: 'full' | 'window' // score text: whole score, or current measure ±1 once a measure is chosen
  requests: 'sequential' | 'fanout' // six sub-steps in sequence (each sees earlier answers) or one request with all six
  history: number // how many recent moves are listed in state as `recent_moves` (0 = none; S5)
}

export const BASELINE: Condition = { name: 'baseline', format: 'csv', accidentals: 'words', align: false, emptyCell: 'blank', formatGuide: 'full', theory: 'exercise', stepWording: 'contextual', strategy: 'free', feedback: false, pitchOctave: 'split', context: 'full', requests: 'sequential', history: 0 }

export const PRESETS: Condition[] = [
  BASELINE,
  { ...BASELINE, name: 'unicode', accidentals: 'unicode' },
  { ...BASELINE, name: 'aligned', align: true },
  { ...BASELINE, name: 'unicode-aligned', accidentals: 'unicode', align: true },
  { ...BASELINE, name: 'underscores', emptyCell: 'underscores' },
  { ...BASELINE, name: 'guide-brief', formatGuide: 'brief' },
  { ...BASELINE, name: 'guide-none', formatGuide: 'none' },
  { ...BASELINE, name: 'theory-none', theory: 'none' },
  { ...BASELINE, name: 'theory-primer', theory: 'primer' },
  { ...BASELINE, name: 'theory-detailed', theory: 'detailed' },
  { ...BASELINE, name: 'wording-plain', stepWording: 'plain' },
  { ...BASELINE, name: 'minimal', formatGuide: 'brief', theory: 'none', stepWording: 'plain' },
  { ...BASELINE, name: 'maximal', align: true, emptyCell: 'underscores', theory: 'detailed' },
  // strategies
  { ...BASELINE, name: 'forward', strategy: 'forward' },
  { ...BASELINE, name: 'backward', strategy: 'backward' },
  { ...BASELINE, name: 'line', strategy: 'line' },
  { ...BASELINE, name: 'feedback', feedback: true },
  { ...BASELINE, name: 'merged-pitch', pitchOctave: 'merged' },
  { ...BASELINE, name: 'forward-feedback', strategy: 'forward', feedback: true },
  { ...BASELINE, name: 'windowed', context: 'window' },
  { ...BASELINE, name: 'fanout', requests: 'fanout' },
  { ...BASELINE, name: 'maximal-merged', align: true, emptyCell: 'underscores', theory: 'detailed', pitchOctave: 'merged' },
  { ...BASELINE, name: 'history', history: 6 },
  // score formats
  { ...BASELINE, name: 'abc', format: 'abc' },
  { ...BASELINE, name: 'lilypond', format: 'lilypond' },
  { ...BASELINE, name: 'abc-backward', format: 'abc', strategy: 'backward' },
  { ...BASELINE, name: 'lilypond-backward', format: 'lilypond', strategy: 'backward' },
  { ...BASELINE, name: 'maximal-history', align: true, emptyCell: 'underscores', theory: 'detailed', history: 6 },
  { ...BASELINE, name: 'backward-history', strategy: 'backward', history: 6 },
]
export const presetByName = (n: string) => PRESETS.find(p => p.name === n) ?? BASELINE

export const THEORY_PRIMER = [
  'Rules of four-part (SATB) common-practice writing:',
  'Each chord is a triad or seventh chord built in thirds; every beat should sound as a complete chord with root, third and fifth (a seventh chord may omit the fifth). In a root-position triad double the root. Never double the leading tone (the seventh scale degree).',
  'Voice ranges: soprano C4 to G5, alto G3 to D5, tenor C3 to G4, bass E2 to C4. Keep soprano and alto within an octave of each other, and alto and tenor within an octave. Voices must not cross: soprano stays above alto, alto above tenor, tenor above bass.',
  'Avoid parallel fifths and parallel octaves between any two voices. Move the upper voices as little as possible: keep common tones, move by step where possible, and prefer contrary motion against the bass.',
  'The leading tone resolves up by step to the tonic. The seventh of a seventh chord resolves down by step. In minor keys raise the seventh scale degree in dominant chords.',
  'End with an authentic cadence: dominant (V or V7) to tonic (I or i) in root position, with the tonic in the soprano or a chord tone.',
].join(' ')

export const THEORY_DETAILED = THEORY_PRIMER + ' ' + [
  'Chord construction: a root-position triad has its root in the bass; first inversion (figure 6) has the third in the bass; second inversion (figure 6/4) has the fifth in the bass. Seventh chords: 7 is root position, 6/5 first inversion, 4/3 second inversion, 4/2 third inversion. An unfigured bass note is a root-position triad. An accidental in the figures applies to the third above the bass.',
  'Harmonizing a melody: choose chords whose members include the melody note. Use mostly I, IV, V (and ii, vi, V7); begin on the tonic chord and end V-I. Change chord on most beats; avoid repeating the same chord across a bar line.',
  'Doubling in inversions: in a first-inversion triad double the soprano note or the root; in a diminished triad double the third. In a cadential 6/4 double the bass. Spacing may be open or close, but the bass may lie more than an octave below the tenor.',
  'Melodic writing: prefer steps and small leaps; avoid augmented seconds and melodic tritones; a leap larger than a fourth should be followed by a step in the opposite direction. Voice overlap (a voice moving past where its neighbour just was) is also to be avoided.',
  'Direct (hidden) fifths and octaves between soprano and bass are avoided unless the soprano moves by step.',
].join(' ')
