// The presentation of a score to a model is a plugin: how it is written, and how that writing is explained.
import type { Key, Score, Time } from '@core/score/model.ts'
import { type FormatVariant, parseScoreBlock, serializeScoreBlock } from '@core/formats/csv.ts'
import { csvGuide } from '@core/formats/csv-guide.ts'
import { scoreToAbc } from '@core/formats/abc.ts'
import { parseLilypond, scoreToLilypond } from '@core/formats/lilypond.ts'

export type FormatName = 'csv' | 'abc' | 'lilypond'
export type GuideLevel = 'none' | 'brief' | 'full'

export interface ScoreFormat {
  name: FormatName
  serialize(score: Score, v: FormatVariant): string
  guide(v: FormatVariant, level: GuideLevel): string | undefined
  /** parse a model-written score (for one-shot generation); undefined = not supported */
  parse?(text: string, key: Key, time: Time): Score
}

const ABC_BRIEF = 'The score is in ABC notation, one voice per [V:] line (SOPRANO, ALTO, TENOR, BASS). L:1/8 means the unit note length is an eighth: a note letter followed by 2 is a quarter note, 4 a half note, 8 a whole note, no number an eighth. Bars are separated by |. An x with a number is an undecided span of that length: nothing has been written there yet.'
const ABC_FULL = ABC_BRIEF + ' Pitch letters give the octave by case and marks: uppercase C is C4 (middle C), C, with a comma is C3, C,, is C2, lowercase c is C5, and c\' with an apostrophe is C6; each comma lowers an octave and each apostrophe raises one. Accidentals are written before the letter: ^ is sharp, _ is flat, = is natural; a written accidental applies to that pitch for the rest of the bar, and notes without one follow the key signature in the K: field. Example: "[V:A] G2 A2 B4 | x4 c4 |" is an alto part: measure 1 has G4 and A4 as quarter notes then B4 as a half note; measure 2 is undecided for two beats, then C5 as a half note.'
const LY_BRIEF = 'The score is in LilyPond notation: one variable per voice (soprano, alto, tenor, bass), each a list of notes with bars separated by |. A note is a pitch name followed by a duration number: 1 whole, 2 half, 4 quarter, 8 eighth, 16 sixteenth, with a dot for dotted values. An s with a duration is an undecided span of that length: nothing has been written there yet.'
const LY_FULL = LY_BRIEF + ' Pitch names are lowercase letters with absolute octave marks: c is C3, c\' (one apostrophe) is C4 (middle C), c\'\' is C5, and c, (one comma) is C2. Accidentals are suffixes: is for sharp (fis), es for flat (bes, aes). Example: "alto = { g\'4 a\'4 b\'2 | s2 c\'\'2 | }" is an alto part: measure 1 has G4 and A4 as quarter notes then B4 as a half note; measure 2 is undecided for two beats, then C5 as a half note.'

export const FORMATS: Record<FormatName, ScoreFormat> = {
  csv: {
    name: 'csv',
    serialize: (s, v) => serializeScoreBlock(s, v),
    guide: (v, level) => csvGuide(v, level),
    parse: (text, key, time) => parseScoreBlock(text, key, time, false),
  },
  abc: {
    name: 'abc',
    serialize: s => scoreToAbc(s, '', { unit: 8, forModel: true }).abc,
    guide: (_v, level) => level === 'none' ? undefined : level === 'brief' ? ABC_BRIEF : ABC_FULL,
  },
  lilypond: {
    name: 'lilypond',
    serialize: s => scoreToLilypond(s),
    guide: (_v, level) => level === 'none' ? undefined : level === 'brief' ? LY_BRIEF : LY_FULL,
    parse: parseLilypond,
  },
}
