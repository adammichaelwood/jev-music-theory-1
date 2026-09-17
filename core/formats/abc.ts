import {
  type Acc, type Dur, type Letter, type Note, type Score, type VoiceName, VOICES, VOICE_LABEL, LETTERS, beatsPerBar, durBeats, gaps, DURS, midi,
} from '@core/score/model.ts'

// ABC unit length = 1/16
const DUR_16: Record<Dur, number> = { WHOLE: 16, 'DOTTED-HALF': 12, HALF: 8, 'DOTTED-QUARTER': 6, QUARTER: 4, EIGHTH: 2, SIXTEENTH: 1 }
const CLEF: Record<VoiceName, string> = { S: 'treble', A: 'treble', T: 'bass', B: 'bass' }

export type NoteRef = { v: VoiceName; m: number; onset: number }
export interface AbcOut {
  abc: string
  /** startChar in `abc` of each note token → which note it is */
  refs: Map<number, NoteRef>
}

// key signature: which letters carry which accidental
const SHARP_ORDER: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']
const MAJOR_SHARPS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 }
export function keySig(s: Score): Record<Letter, Acc> {
  const { tonic, acc, mode } = s.key
  let name = tonic + (acc === 'sharp' ? '#' : acc === 'flat' ? 'b' : '')
  if (mode === 'minor') {
    // relative major = tonic + minor third
    const i = (LETTERS.indexOf(tonic) + 2) % 7
    const rel = LETTERS[i]
    const relPc = (midi({ letter: tonic, acc, octave: 4 }) + 3) % 12
    const relNat = midi({ letter: rel, acc: 'natural', octave: 4 }) % 12
    const diff = ((relPc - relNat + 12) % 12)
    name = rel + (diff === 1 ? '#' : diff === 11 ? 'b' : '')
  }
  const n = MAJOR_SHARPS[name]
  if (n === undefined) throw new Error(`unsupported key ${name}`)
  const out = Object.fromEntries(LETTERS.map(l => [l, 'natural'])) as Record<Letter, Acc>
  if (n > 0) SHARP_ORDER.slice(0, n).forEach(l => (out[l] = 'sharp'))
  if (n < 0) FLAT_ORDER.slice(0, -n).forEach(l => (out[l] = 'flat'))
  return out
}
export function abcKeyName(s: Score) {
  const { tonic, acc, mode } = s.key
  return tonic + (acc === 'sharp' ? '#' : acc === 'flat' ? 'b' : '') + (mode === 'minor' ? 'm' : '')
}

function abcPitch(n: Note, accText: string) {
  // ABC: C = middle C (C4); c = C5; commas/apostrophes shift octaves
  let s = n.octave >= 5 ? n.letter.toLowerCase() : n.letter
  const o = n.octave >= 5 ? n.octave - 5 : 4 - n.octave
  s += n.octave >= 5 ? "'".repeat(o) : ','.repeat(o)
  return accText + s
}
const ACC_ABC: Record<Acc, string> = { natural: '=', sharp: '^', flat: '_' }

export function scoreToAbc(s: Score, title = '', opts: { unit?: 8 | 16; forModel?: boolean } = {}): AbcOut {
  const U = opts.unit ?? 16
  const D = (d: Dur) => DUR_16[d] * U / 16
  const ks = keySig(s)
  const refs = new Map<number, NoteRef>()
  const header = [
    'X:1', title ? `T:${title}` : null, `M:${s.time.num}/${s.time.den}`, `L:1/${U}`, opts.forModel ? null : 'Q:1/4=72', `K:${abcKeyName(s)}`,
    ...(opts.forModel ? [] : ['%%score (S A) (T B)', '%%stretchlast 1', '%%barsperstaff 4']),
    ...VOICES.map(v => `V:${v} clef=${CLEF[v]}${opts.forModel ? ` name="${VOICE_LABEL[v]}"` : ''}`),
  ].filter(Boolean).join('\n') + '\n'
  let abc = header
  for (const v of VOICES) {
    abc += `[V:${v}] `
    for (let m = 0; m < s.nMeasures; m++) {
      // items: notes + invisible rests for gaps, in onset order
      const items: { onset: number; text?: string; note?: Note }[] = s.voices[v][m].map(note => ({ onset: note.onset, note }))
      for (const [a, b] of gaps(s, v, m)) {
        let cur = a
        while (b - cur > 1e-9) {
          const d = DURS.find(d => durBeats(d, s.time) <= b - cur + 1e-9)!
          items.push({ onset: cur, text: `x${D(d)}` }); cur += durBeats(d, s.time)
        }
      }
      items.sort((x, y) => x.onset - y.onset)
      const touched = new Set<Letter>() // letters that carried an explicit accidental earlier in this bar
      for (const it of items) {
        if (!it.note) { abc += it.text + ' '; continue }
        const n = it.note
        let tok: string
        if (n.rest) tok = `z${D(n.dur)}`
        else {
          const need = n.acc !== ks[n.letter] || touched.has(n.letter)
          if (n.acc !== ks[n.letter]) touched.add(n.letter)
          tok = abcPitch(n, need ? ACC_ABC[n.acc] : '') + D(n.dur)
          if (n.figures) tok = `"_${n.figures}"` + tok
        }
        refs.set(abc.length, { v, m, onset: n.onset })
        abc += tok + ' '
      }
      abc += '| '
    }
    abc += '\n'
  }
  void beatsPerBar
  return { abc, refs }
}
