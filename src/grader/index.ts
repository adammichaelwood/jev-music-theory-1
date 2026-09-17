import { pitchText } from '../score/format.ts'
import {
  type Acc, type Letter, type Note, type Score, type VoiceName, VOICES, VOICE_LABEL, LETTERS,
  beatsPerBar, gaps, letterIndex, midi, noteAt, pitchClass, voiceNotes,
} from '../score/model.ts'

export type Severity = 'error' | 'warn' | 'info'
export interface Issue { kind: string; severity: Severity; m: number; beat: number; voices?: VoiceName[]; text: string }
export interface Moment {
  m: number; beat: number; abs: number
  notes: Partial<Record<VoiceName, Note>>
  chord?: ChordId
  issues: Issue[]
}
export interface ChordId {
  root: { letter: Letter; acc: Acc }
  quality: string // 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant 7th' | ...
  inversion: number // 0 root, 1 first, 2 second, 3 third
  numeral: string // e.g. V7, ii6, vii°
  complete: boolean
  missing: string[] // 'third' | 'fifth'
  spelled: boolean // letters stack in thirds from the root
  pcs: number[]
}
export interface Report {
  complete: boolean
  moments: Moment[]
  issues: Issue[]
  counts: Record<string, number>
  errors: number
  warnings: number
}

const RANGE: Record<VoiceName, [number, number]> = { S: [60, 81], A: [55, 74], T: [48, 67], B: [40, 60] } // C4-A5, G3-D5, C3-G4, E2-C4

// ---- chord templates (semitones above root) ----
const TEMPLATES: { q: string; iv: number[]; sym: (deg: string) => string }[] = [
  { q: 'major', iv: [0, 4, 7], sym: d => d.toUpperCase() },
  { q: 'minor', iv: [0, 3, 7], sym: d => d.toLowerCase() },
  { q: 'diminished', iv: [0, 3, 6], sym: d => d.toLowerCase() + '°' },
  { q: 'augmented', iv: [0, 4, 8], sym: d => d.toUpperCase() + '+' },
  { q: 'dominant 7th', iv: [0, 4, 7, 10], sym: d => d.toUpperCase() + '7' },
  { q: 'minor 7th', iv: [0, 3, 7, 10], sym: d => d.toLowerCase() + '7' },
  { q: 'half-diminished 7th', iv: [0, 3, 6, 10], sym: d => d.toLowerCase() + 'ø7' },
  { q: 'diminished 7th', iv: [0, 3, 6, 9], sym: d => d.toLowerCase() + '°7' },
  { q: 'major 7th', iv: [0, 4, 7, 11], sym: d => d.toUpperCase() + 'maj7' },
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const INV_FIG = [['', '7'], ['6', '6/5'], ['6/4', '4/3'], ['', '4/2']]

/** scale-degree number (1-7) of a letter in the key, by letter distance from tonic */
const degreeOf = (letter: Letter, key: Score['key']) => ((letterIndex(letter) - letterIndex(key.tonic) + 7) % 7) + 1
/** the diatonic pitch class of a degree in the key (natural minor; raised 7 handled separately) */

export function identifyChord(notes: Note[], key: Score['key']): ChordId | undefined {
  const sounding = notes.filter(n => !n.rest)
  if (sounding.length < 2) return undefined
  const pcs = [...new Set(sounding.map(pitchClass))]
  const bass = sounding.reduce((a, b) => (midi(a) < midi(b) ? a : b))
  if (pcs.length === 1) { // everyone on the same pitch class: call it a root-only chord so doubling checks can complain
    const deg = degreeOf(bass.letter, key)
    return { root: { letter: bass.letter, acc: bass.acc }, quality: 'root only', inversion: 0, numeral: ROMAN[deg - 1], complete: false, missing: ['third', 'fifth'], spelled: true, pcs }
  }
  let best: { t: (typeof TEMPLATES)[number]; rootPc: number; covered: number; missing: string[] } | undefined
  for (const t of TEMPLATES) for (const rootPc of pcs) {
    const chordPcs = t.iv.map(i => (rootPc + i) % 12)
    if (!pcs.every(p => chordPcs.includes(p))) continue
    const missing: string[] = []
    if (!pcs.includes(chordPcs[1])) missing.push('third')
    if (!pcs.includes(chordPcs[2])) missing.push('fifth')
    if (t.iv.length === 4 && !pcs.includes(chordPcs[3])) continue // a "7th chord" without its 7th is just a triad
    if (missing.includes('third') && missing.includes('fifth')) continue
    const covered = pcs.length - missing.length
    const better = !best || covered > best.covered || (covered === best.covered && missing.length < best.missing.length)
      || (covered === best.covered && missing.length === best.missing.length && t.iv.length < best.t.iv.length)
    if (better) best = { t, rootPc, covered, missing }
  }
  if (!best) return undefined
  // root spelling: prefer a sounding note with that pc whose letter makes the others stack in thirds
  const rootNotes = sounding.filter(n => pitchClass(n) === best!.rootPc)
  const stacks = (root: Note) => sounding.every(n => ((letterIndex(n.letter) - letterIndex(root.letter) + 7) % 7) % 2 === 0)
  const root = rootNotes.find(stacks) ?? rootNotes[0]
  const spelled = stacks(root)
  const chordPcs = best.t.iv.map(i => (best!.rootPc + i) % 12)
  const inversion = Math.max(0, chordPcs.indexOf(pitchClass(bass)))
  const deg = degreeOf(root.letter, key)
  let numeral = best.t.sym(ROMAN[deg - 1])
  // chromatic root: mark with the accidental relative to the key's diatonic degree
  const diatonicAcc = keyAccidental(root.letter, key)
  if (root.acc !== diatonicAcc && !(key.mode === 'minor' && deg === 7 && root.acc === raise(diatonicAcc)))
    numeral = accMark(root.acc, diatonicAcc) + numeral
  const fig = INV_FIG[inversion][best.t.iv.length === 4 ? 1 : 0]
  if (fig) numeral = numeral.replace(/7$/, '') + fig
  return { root: { letter: root.letter, acc: root.acc }, quality: best.t.q, inversion, numeral, complete: best.missing.length === 0, missing: best.missing, spelled, pcs }
}

const raise = (a: Acc): Acc => (a === 'flat' ? 'natural' : 'sharp')
const accMark = (a: Acc, base: Acc) => (ACC_N[a] > ACC_N[base] ? '♯' : '♭')
const ACC_N: Record<Acc, number> = { flat: -1, natural: 0, sharp: 1 }
/** accidental a letter carries in the key signature */
export function keyAccidental(letter: Letter, key: Score['key']): Acc {
  const tonicPc = pitchClass({ letter: key.tonic, acc: key.acc })
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  const deg = degreeOf(letter, key) - 1
  const want = (tonicPc + steps[deg]) % 12
  const nat = pitchClass({ letter, acc: 'natural' })
  const d = ((want - nat + 12) % 12)
  return d === 0 ? 'natural' : d === 1 ? 'sharp' : d === 11 ? 'flat' : 'natural'
}
const leadingTone = (key: Score['key']) => {
  const letter = LETTERS[(letterIndex(key.tonic) + 6) % 7]
  const acc = key.mode === 'major' ? keyAccidental(letter, key) : raise(keyAccidental(letter, key))
  return { letter, acc }
}
const samePitchClass = (a: Note, b: { letter: Letter; acc: Acc }) => pitchClass(a) === pitchClass(b)

export function grade(s: Score): Report {
  const issues: Issue[] = []
  const bar = beatsPerBar(s.time)
  const push = (i: Issue) => issues.push(i)

  // completeness
  let complete = true
  for (const v of VOICES) for (let m = 0; m < s.nMeasures; m++) for (const [a, b] of gaps(s, v, m)) {
    complete = false
    push({ kind: 'incomplete', severity: 'error', m, beat: a, voices: [v], text: `${VOICE_LABEL[v]} m${m + 1} beats ${a + 1}–${b} undecided` })
  }

  // moments = every onset anywhere
  const absOnsets = new Set<number>()
  for (const v of VOICES) for (const { m, note } of voiceNotes(s, v)) absOnsets.add(m * bar + note.onset)
  const moments: Moment[] = [...absOnsets].sort((a, b) => a - b).map(abs => {
    const m = Math.floor(abs / bar), beat = abs - m * bar
    const notes: Moment['notes'] = {}
    for (const v of VOICES) { const n = noteAt(s, v, m, beat); if (n && !n.rest) notes[v] = n }
    return { m, beat, abs, notes, issues: [] }
  })
  const at = (mo: Moment, v: VoiceName) => mo.notes[v]
  const lt = leadingTone(s.key)

  for (const mo of moments) {
    const loc = { m: mo.m, beat: mo.beat }
    // range
    for (const v of VOICES) {
      const n = at(mo, v); if (!n || n.onset !== mo.beat) continue
      const [lo, hi] = RANGE[v], p = midi(n)
      if (p < lo || p > hi) push({ ...loc, kind: 'range', severity: 'warn', voices: [v], text: `${VOICE_LABEL[v]} ${pitchText(n)}${n.octave} out of range` })
    }
    // crossing + spacing
    for (let i = 0; i < 3; i++) {
      const hi = VOICES[i], lo = VOICES[i + 1], a = at(mo, hi), b = at(mo, lo)
      if (!a || !b) continue
      if (midi(a) < midi(b)) push({ ...loc, kind: 'crossing', severity: 'error', voices: [hi, lo], text: `${VOICE_LABEL[hi]} below ${VOICE_LABEL[lo]}` })
      else if (i < 2 && midi(a) - midi(b) > 12) push({ ...loc, kind: 'spacing', severity: 'warn', voices: [hi, lo], text: `${VOICE_LABEL[hi]}–${VOICE_LABEL[lo]} more than an octave apart` })
    }
    // chord
    const sounding = VOICES.map(v => at(mo, v)).filter((n): n is Note => !!n)
    mo.chord = identifyChord(sounding, s.key)
    if (sounding.length >= 3) {
      if (!mo.chord) push({ ...loc, kind: 'non-chord', severity: 'error', text: `sonority ${sounding.map(n => pitchText(n)).join(' ')} is not a triad or seventh chord` })
      else {
        if (!mo.chord.spelled) push({ ...loc, kind: 'spelling', severity: 'warn', text: `${mo.chord.numeral} spelled ${sounding.map(n => pitchText(n)).join(' ')} — not stacked in thirds` })
        if (mo.chord.missing.includes('third') && sounding.length === 4) push({ ...loc, kind: 'doubling', severity: 'warn', text: `${mo.chord.numeral} has no third` })
        const lts = sounding.filter(n => samePitchClass(n, lt))
        if (lts.length > 1) push({ ...loc, kind: 'doubling', severity: 'error', text: 'doubled leading tone' })
        // figured bass compliance
        const bassNote = at(mo, 'B')
        if (bassNote?.figures !== undefined) {
          const want = figInversion(bassNote.figures)
          if (want !== undefined && want !== mo.chord.inversion)
            push({ ...loc, kind: 'figures', severity: 'error', text: `figures ${bassNote.figures} call for inversion ${want}, chord ${mo.chord.numeral} is in inversion ${mo.chord.inversion}` })
          if (/7|6\/5|4\/3|4\/2/.test(bassNote.figures) && mo.chord.pcs.length < 4 && sounding.length === 4)
            push({ ...loc, kind: 'figures', severity: 'warn', text: `figures ${bassNote.figures} call for a seventh chord` })
        }
      }
    }
  }

  // motion between consecutive moments
  for (let i = 1; i < moments.length; i++) {
    const p = moments[i - 1], c = moments[i], loc = { m: c.m, beat: c.beat }
    const moved = (v: VoiceName) => { const a = at(p, v), b = at(c, v); return a && b && b.onset === c.beat && midi(a) !== midi(b) }
    // parallels
    for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
      const v1 = VOICES[x], v2 = VOICES[y]
      if (!moved(v1) || !moved(v2)) continue
      const a1 = at(p, v1)!, a2 = at(p, v2)!, b1 = at(c, v1)!, b2 = at(c, v2)!
      const i1 = ((midi(a1) - midi(a2)) % 12 + 12) % 12, i2 = ((midi(b1) - midi(b2)) % 12 + 12) % 12
      const dir1 = Math.sign(midi(b1) - midi(a1)), dir2 = Math.sign(midi(b2) - midi(a2))
      if (i1 === i2 && (i1 === 7 || i1 === 0) && dir1 === dir2)
        push({ ...loc, kind: i1 === 7 ? 'parallel-fifths' : 'parallel-octaves', severity: 'error', voices: [v1, v2], text: `parallel ${i1 === 7 ? 'fifths' : 'octaves'} ${VOICE_LABEL[v1]}–${VOICE_LABEL[v2]}` })
      else if ((i2 === 7 || i2 === 0) && dir1 === dir2 && v1 === 'S' && v2 === 'B' && Math.abs(midi(b1) - midi(a1)) > 2)
        push({ ...loc, kind: 'hidden', severity: 'warn', voices: [v1, v2], text: `direct ${i2 === 7 ? 'fifth' : 'octave'} between outer voices with soprano leap` })
    }
    // overlap
    for (let x = 0; x < 3; x++) {
      const hi = VOICES[x], lo = VOICES[x + 1]
      if (moved(hi) && at(p, lo) && midi(at(c, hi)!) < midi(at(p, lo)!)) push({ ...loc, kind: 'overlap', severity: 'warn', voices: [hi, lo], text: `${VOICE_LABEL[hi]} moves below where ${VOICE_LABEL[lo]} was` })
      if (moved(lo) && at(p, hi) && midi(at(c, lo)!) > midi(at(p, hi)!)) push({ ...loc, kind: 'overlap', severity: 'warn', voices: [hi, lo], text: `${VOICE_LABEL[lo]} moves above where ${VOICE_LABEL[hi]} was` })
    }
    // melodic intervals
    for (const v of VOICES) {
      if (!moved(v)) continue
      const a = at(p, v)!, b = at(c, v)!, semis = Math.abs(midi(b) - midi(a))
      const steps = Math.abs((b.octave * 7 + letterIndex(b.letter)) - (a.octave * 7 + letterIndex(a.letter)))
      if (semis > 12) push({ ...loc, kind: 'leap', severity: 'warn', voices: [v], text: `${VOICE_LABEL[v]} leaps more than an octave` })
      else if (steps === 1 && semis === 3) push({ ...loc, kind: 'aug2', severity: 'warn', voices: [v], text: `${VOICE_LABEL[v]} augmented second` })
      else if (steps === 4 && semis === 6) push({ ...loc, kind: 'tritone', severity: 'warn', voices: [v], text: `${VOICE_LABEL[v]} melodic tritone` })
    }
    // tendency tones: leading tone in a dominant-function chord; chordal seventh
    if (p.chord && (p.chord.numeral.startsWith('V') || p.chord.numeral.startsWith('vii'))) {
      for (const v of VOICES) {
        const a = at(p, v), b = at(c, v)
        if (!a || !b || !samePitchClass(a, lt)) continue
        if (b.onset !== c.beat) continue
        const up = midi(b) - midi(a)
        const tonicNext = c.chord?.numeral.replace(/[^A-Za-z]/g, '').toLowerCase() === 'i'
        if (tonicNext && up !== 1 && (v === 'S' || v === 'B')) push({ ...loc, kind: 'leading-tone', severity: 'error', voices: [v], text: `${VOICE_LABEL[v]} leading tone does not resolve up to tonic` })
        else if (tonicNext && up !== 1) push({ ...loc, kind: 'leading-tone', severity: 'info', voices: [v], text: `${VOICE_LABEL[v]} (inner) leading tone does not resolve up` })
      }
    }
    if (p.chord && p.chord.pcs.length === 4) {
      const seventhPc = (pitchClass(p.chord.root) + (p.chord.quality.includes('major 7') ? 11 : p.chord.quality === 'diminished 7th' ? 9 : 10)) % 12
      for (const v of VOICES) {
        const a = at(p, v), b = at(c, v)
        if (!a || !b || pitchClass(a) !== seventhPc || b.onset !== c.beat) continue
        const d = midi(b) - midi(a)
        if (!(d === -1 || d === -2) && c.chord && c.chord.numeral !== p.chord.numeral)
          push({ ...loc, kind: 'seventh', severity: 'error', voices: [v], text: `${VOICE_LABEL[v]} chordal seventh does not resolve down by step` })
      }
    }
  }

  // final chord
  const last = moments[moments.length - 1]
  if (last?.chord && last.chord.numeral.replace(/[^A-Za-z]/g, '').toLowerCase() !== 'i')
    push({ m: last.m, beat: last.beat, kind: 'cadence', severity: 'warn', text: `final chord is ${last.chord.numeral}, not tonic` })

  for (const i of issues) { const mo = moments.find(x => x.m === i.m && x.beat === i.beat); mo?.issues.push(i) }
  const counts: Record<string, number> = {}
  for (const i of issues) counts[i.kind] = (counts[i.kind] ?? 0) + 1
  return {
    complete, moments, issues, counts,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warn').length,
  }
}

function figInversion(f: string): number | undefined {
  const g = f.replace(/[#bn♯♭♮]/g, '')
  if (g === '' || g === '5' || g === '5/3' || g === '7' || g === '7/5/3') return 0
  if (g === '6' || g === '6/3' || g === '6/5' || g === '6/5/3') return 1
  if (g === '6/4' || g === '4/3' || g === '6/4/3') return 2
  if (g === '4/2' || g === '2' || g === '6/4/2') return 3
  return undefined
}

export const formatReport = (r: Report) =>
  [
    `${r.complete ? 'complete' : 'INCOMPLETE'} · ${r.errors} errors · ${r.warnings} warnings`,
    'chords: ' + r.moments.map(m => `${m.m + 1}.${m.beat + 1} ${m.chord?.numeral ?? '?'}`).join('  '),
    ...r.issues.map(i => `  [${i.severity}] m${i.m + 1} b${i.beat + 1}: ${i.text}`),
  ].join('\n')
