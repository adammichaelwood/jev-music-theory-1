# Chorale CSV format — grammar

## Exercise file (`exercises/*.md`)

```
---
title: Harmonize a soprano line
type: melody          # melody | figured-bass | completion | soprano-bass | free
difficulty: 1         # 1 (easy) … 5 (advanced)
key: E-flat major     # "<Letter>[-flat|-sharp] major|minor"
time: 4/4
---
Instruction text in Markdown. Shown to the human and sent to Jev verbatim.

```score
S, E-FLAT-5-QUARTER F-5-QUARTER G-5-HALF, A-FLAT-5-QUARTER G-5-QUARTER F-5-HALF
A, , 
T, ,
B, E-FLAT-3-QUARTER-5/3 _ _ _, 
```
```

Everything in the score block at load time is **given** (locked). Empty
cells / `_` are undecided.

## Score block

- One row per voice, in order `S, A, T, B`. First cell is the voice label.
- Cells are measures, separated by `,`. Whitespace around cells is ignored.
- A cell is a whitespace-separated sequence of tokens read left to right from
  the start of the measure. Each token advances the cursor by its duration.
- **Empty cell** = whole measure undecided.

### Tokens

| Token | Meaning |
|-------|---------|
| `PITCH-OCTAVE-DURATION` | a note, e.g. `A-FLAT-5-QUARTER`, `F-SHARP-3-HALF` |
| `PITCH-OCTAVE-DURATION-FIGURES` | bass note with figured-bass figures, e.g. `G-3-QUARTER-6/4` |
| `REST-DURATION` | a sounding rest (given only; never offered to Jev) |
| `_` | one **beat** undecided (beat = time-signature denominator; dotted quarter in compound meter) |
| `_-DURATION` | an undecided span of another length, e.g. `_-EIGHTH` |

- `PITCH`: letter `A`–`G`, optional accidental. Two spellings, selected by
  the format variant: **words** `C-SHARP`, `D-FLAT`; **unicode** `C♯`, `D♭`.
  Naturals carry no accidental marker. Parser also accepts `#`/`b`.
  Enharmonics are distinct (`G-FLAT` ≠ `F-SHARP`); `E-SHARP`, `C-FLAT` etc. are valid.
- `OCTAVE`: scientific pitch notation, `C-4` = middle C. Controller offers 2–6.
- `DURATION`: `WHOLE`, `DOTTED-HALF`, `HALF`, `DOTTED-QUARTER`, `QUARTER`,
  `EIGHTH`, `SIXTEENTH`. Controller offers a subset (see main.md §3).
- `FIGURES`: stacked figures top-to-bottom separated by `/`: `6`, `6/4`,
  `6/5`, `4/2`, `7`, `#`, `#6`, `b6`, `n`, `6/#`. Unicode variant uses `♯♭♮`.
- No ties, no triplets, no grace notes in v1.

### Format variants (serializer options)

- `accidentals: 'words' | 'unicode'`
- `align: boolean` — pad tokens with spaces so that notes sounding at the
  same moment start in the same character column across the four rows.
  Cells may then contain runs of spaces; the parser ignores them.

Example, `align: true`:

```
S, C-5-QUARTER   D-5-QUARTER   E-5-HALF,       F-5-WHOLE
A, E-4-QUARTER   F-4-QUARTER   G-4-HALF,       A-4-WHOLE
T, G-3-HALF                    C-4-HALF,       C-4-WHOLE
B, C-3-QUARTER   B-2-QUARTER   C-3-HALF,       F-3-WHOLE
```

## Internal model

`Note { letter, acc: 'natural'|'sharp'|'flat', octave, dur, onset (beats from
bar start), figures?, rest? }`. Gaps are *not* stored; they're derived from
onsets/durations when serializing. Lock state lives in `Score.locked`, a set of
`"S:3:2"` keys (voice:measure-index:onset).
