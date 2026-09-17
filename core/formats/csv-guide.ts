import type { FormatVariant } from '@core/formats/csv.ts'

/** How the score text is to be read. Sent inside the state on every request. */
export function csvGuide(v: FormatVariant, level: 'none' | 'brief' | 'full' = 'full') {
  if (level === 'none') return undefined
  const ex = v.accidentals === 'unicode'
    ? { flat: 'A♭', sharp: 'F♯', sig: '♯ / ♭ after the letter' }
    : { flat: 'A-FLAT', sharp: 'F-SHARP', sig: '-SHARP / -FLAT after the letter' }
  const brief = [
    'The score is a four-part chorale as text: one row per voice (S soprano, A alto, T tenor, B bass), each row a comma-separated list of measures, each measure a space-separated list of notes in time order.',
    `A note is PITCH-OCTAVE-DURATION, e.g. ${ex.flat}-4-HALF is ${ex.flat} in the octave of middle C, lasting a half note. An underscore _ is one undecided beat; an empty measure is entirely undecided.`,
  ]
  if (level === 'brief') return brief.join(' ')
  return [
    'The score is a four-part chorale written as text, one row per voice: S (soprano), A (alto), T (tenor), B (bass), from highest voice to lowest.',
    'Each row starts with its voice letter. The cells after it, separated by commas, are the measures in order: the first cell is measure 1, the next is measure 2, and so on. The four rows have the same number of measures, so the Nth cell of each row is the same measure.',
    'Inside a measure, notes are listed in time order from the start of the measure, separated by spaces. Each note is PITCH-OCTAVE-DURATION.',
    `PITCH is a letter A to G with an optional accidental: ${ex.sig}. Natural notes have no accidental marker. ${ex.sharp} and ${ex.flat.replace('A', 'G')} are different spellings and are written differently.`,
    'OCTAVE is a number: 4 is the octave beginning at middle C, 5 is the octave above, 3 the octave below. C-4 is middle C; B-3 is the note just below it.',
    'DURATION is WHOLE, DOTTED-HALF, HALF, DOTTED-QUARTER, QUARTER, EIGHTH or SIXTEENTH.',
    'In figured-bass exercises a bass note may carry figures after its duration, for example G-3-QUARTER-6/4 is a G with the figures 6/4 beneath it.',
    v.emptyCell === 'underscores' ? 'An underscore _ is one beat that has not been decided yet; _-EIGHTH is half a beat undecided. A measure written entirely as underscores is a measure in which nothing has been decided yet for that voice.' : 'An underscore _ is one beat that has not been decided yet; _-EIGHTH is half a beat undecided. An empty cell is a whole measure in which nothing has been decided yet for that voice.',
    `Example in 4/4: "A, E-4-QUARTER F-4-QUARTER G-4-HALF, _ _ ${ex.flat}-4-HALF" is an alto part: measure 1 has E4 and F4 as quarter notes on beats 1 and 2, then G4 as a half note on beats 3-4; measure 2 is undecided on beats 1 and 2, then ${ex.flat}4 as a half note on beats 3-4.`,
    v.align ? 'Notes that start in the same character column of different rows in the same measure sound at the same time.' : null,
  ].filter(Boolean).join(' ')
}

