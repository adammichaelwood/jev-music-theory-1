// Jazz chord vocabulary, voicing, and simple analysis for the "Jev plays piano" demo.
import { type Acc, type Letter, LETTERS, letterIndex, pitchClass } from '@core/score/model.ts'

export interface Root { letter: Letter; acc: Acc }
export const ROOTS: Root[] = [
  ['C', 'natural'], ['C', 'sharp'], ['D', 'flat'], ['D', 'natural'], ['E', 'flat'], ['E', 'natural'], ['F', 'natural'],
  ['F', 'sharp'], ['G', 'flat'], ['G', 'natural'], ['A', 'flat'], ['A', 'natural'], ['B', 'flat'], ['B', 'natural'],
].map(([letter, acc]) => ({ letter: letter as Letter, acc: acc as Acc }))
export const rootKey = (r: Root) => r.letter + (r.acc === 'sharp' ? '-SHARP' : r.acc === 'flat' ? '-FLAT' : '')
export const rootSymbol = (r: Root) => r.letter + (r.acc === 'sharp' ? '♯' : r.acc === 'flat' ? '♭' : '')
export const parseRootKey = (k: string): Root => ROOTS.find(r => rootKey(r) === k)!

/** quality → semitone intervals above the root (chord tones, in the order code prefers to keep them) */
export const QUALITIES: Record<string, { iv: number[]; describe: string }> = {
  'maj7': { iv: [0, 4, 7, 11], describe: 'major seventh' },
  '6': { iv: [0, 4, 7, 9], describe: 'major sixth' },
  '6/9': { iv: [0, 4, 7, 9, 14], describe: 'major six-nine' },
  'maj9': { iv: [0, 4, 7, 11, 14], describe: 'major ninth' },
  'maj7#11': { iv: [0, 4, 7, 11, 18], describe: 'major seventh sharp eleven (lydian)' },
  'm7': { iv: [0, 3, 7, 10], describe: 'minor seventh' },
  'm6': { iv: [0, 3, 7, 9], describe: 'minor sixth' },
  'm9': { iv: [0, 3, 7, 10, 14], describe: 'minor ninth' },
  'mMaj7': { iv: [0, 3, 7, 11], describe: 'minor with a major seventh' },
  '7': { iv: [0, 4, 7, 10], describe: 'dominant seventh' },
  '9': { iv: [0, 4, 7, 10, 14], describe: 'dominant ninth' },
  '13': { iv: [0, 4, 7, 10, 14, 21], describe: 'dominant thirteenth' },
  '7b9': { iv: [0, 4, 7, 10, 13], describe: 'dominant seventh flat nine' },
  '7#11': { iv: [0, 4, 7, 10, 18], describe: 'dominant seventh sharp eleven' },
  '7alt': { iv: [0, 4, 10, 13, 15, 20], describe: 'altered dominant (flat nine, sharp nine, sharp five)' },
  '7sus4': { iv: [0, 5, 7, 10], describe: 'dominant seventh with a suspended fourth' },
  'm7b5': { iv: [0, 3, 6, 10], describe: 'half-diminished (minor seventh flat five)' },
  'dim7': { iv: [0, 3, 6, 9], describe: 'diminished seventh' },
}
export const QUALITY_KEYS = Object.keys(QUALITIES)

export interface Chord { root: Root; quality: string; bassInterval: number } // bassInterval: semitones above root of the bass note
export const chordSymbol = (c: Chord) => `${rootSymbol(c.root)}${c.quality}${c.bassInterval ? '/' + toneName(c.root, c.bassInterval) : ''}`

/** spell a chord tone: letter by interval degree, accidental by semitone distance (falls back to sharp/flat of nearest letter) */
export function toneName(root: Root, semis: number): string {
  const DEG: Record<number, number> = { 0: 0, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 13: 1, 14: 1, 15: 2, 18: 3, 20: 5, 21: 5 }
  const deg = DEG[semis] ?? 0
  const letter = LETTERS[(letterIndex(root.letter) + deg) % 7]
  const want = (pitchClass(root) + semis) % 12, nat = pitchClass({ letter, acc: 'natural' })
  let d = ((want - nat) % 12 + 12) % 12; if (d > 6) d -= 12
  const acc = d === 0 ? '' : d === 1 ? '♯' : d === -1 ? '♭' : d === 2 ? '𝄪' : '𝄫'
  return letter + acc
}
export const toneKey = (root: Root, semis: number) => toneName(root, semis).replace('♯', '-SHARP').replace('♭', '-FLAT').replace('𝄪', '-DOUBLE-SHARP').replace('𝄫', '-DOUBLE-FLAT')

/** bass options for a chord: root, 3rd, 5th, 7th (the tones with a defined inversion) */
export function bassOptions(root: Root, quality: string): { key: string; semis: number; description: string }[] {
  const iv = QUALITIES[quality].iv
  const names: Record<number, string> = { 0: 'root position', 3: 'first inversion (third in the bass)', 4: 'first inversion (third in the bass)', 5: 'fourth in the bass', 6: 'fifth in the bass', 7: 'second inversion (fifth in the bass)', 9: 'sixth in the bass', 10: 'third inversion (seventh in the bass)', 11: 'third inversion (seventh in the bass)' }
  return iv.filter(s => s < 12).map(s => ({ key: toneKey(root, s), semis: s, description: names[s] ?? '' }))
}

// ---- voicing ----
export interface Voicing { bass: number; upper: number[] } // MIDI numbers
const RH_LO = 60, RH_HI = 79 // C4..G5 for the top of the right hand cluster
/** basic block-chord voicing: bass low, right hand = 3rd/7th (guide tones) + one or two colour tones, each moved to the nearest available tone */
export function voice(c: Chord, prev: Voicing | null): Voicing {
  const rootPc = pitchClass(c.root)
  const iv = QUALITIES[c.quality].iv
  const bassPc = (rootPc + c.bassInterval) % 12
  // bass in octave 2–3, nearest to previous bass (default ~E2..D3 band)
  const bassTarget = prev ? prev.bass : 43
  let bass = 36 + ((bassPc - 36) % 12 + 12) % 12 // lowest >= C2
  while (bass + 12 <= 55 && Math.abs(bass + 12 - bassTarget) < Math.abs(bass - bassTarget)) bass += 12
  if (bass < 38) bass += 12
  // right hand: the guide tones plus the highest extensions, 3–4 notes
  const third = iv.find(x => x === 3 || x === 4 || x === 5), seventh = iv.find(x => x === 10 || x === 11 || x === 9)
  const colours = iv.filter(x => x !== 0 && x !== third && x !== seventh && x !== 7).slice(-2)
  const wanted = [third, seventh, ...colours].filter((x): x is number => x !== undefined)
  if (wanted.length < 3) wanted.push(7)
  const pcs = wanted.map(x => (rootPc + x) % 12)
  const prevUpper = prev?.upper ?? [64, 67, 71]
  const upper: number[] = []
  for (const pc of pcs) {
    // nearest pitch of this class to any previous upper voice, within band
    const cands: number[] = []; for (let m = RH_LO; m <= RH_HI; m++) if (m % 12 === pc) cands.push(m)
    const best = cands.sort((a, b) => Math.min(...prevUpper.map(p => Math.abs(p - a))) - Math.min(...prevUpper.map(p => Math.abs(p - b))))[0]
    if (best !== undefined && !upper.includes(best)) upper.push(best)
  }
  upper.sort((a, b) => a - b)
  // avoid a minor-ninth clash between bass and the lowest RH note
  if (upper.length && upper[0] - bass < 7) { const u = upper.shift()!; upper.push(u + 12); upper.sort((a, b) => a - b) }
  return { bass, upper }
}

// ---- analysis of a chord stream ----
export const FIFTH_DOWN = (a: Chord, b: Chord) => (pitchClass(a.root) - pitchClass(b.root) + 12) % 12 === 7
export function classifyTransition(a: Chord, b: Chord): string {
  const d = (pitchClass(b.root) - pitchClass(a.root) + 12) % 12
  const dom = (q: string) => /^(7|9|13|7b9|7#11|7alt|7sus4)$/.test(q)
  const min = (q: string) => /^(m7|m9|m6|mMaj7)$/.test(q)
  const maj = (q: string) => /^(maj7|6|6\/9|maj9|maj7#11)$/.test(q)
  if (d === 0 && a.quality === b.quality) return 'repeat'
  if (d === 0) return 'same root, new quality'
  if (d === 5 && dom(a.quality) && (maj(b.quality) || min(b.quality))) return 'V → I'
  if (d === 5 && min(a.quality) && dom(b.quality)) return 'ii → V'
  if (d === 5) return 'down a fifth'
  if (d === 1 && dom(a.quality)) return 'tritone sub resolving'
  if (d === 11 || d === 1) return 'chromatic'
  if (d === 2 && a.quality === 'm7b5' && dom(b.quality)) return 'iiø → V'
  if (d === 3 || d === 4 || d === 8 || d === 9) return 'third relation'
  if (d === 7) return 'up a fifth'
  if (d === 2 || d === 10) return 'step'
  if (d === 6) return 'tritone'
  return 'other'
}
/** crude key estimate: the major key whose diatonic set covers the most recent chord tones */
export function estimateKey(chords: Chord[]): string {
  const counts = new Array(12).fill(0)
  chords.slice(-8).forEach((c, i) => { const w = 1 + i / 8; for (const s of QUALITIES[c.quality].iv) counts[(pitchClass(c.root) + s) % 12] += w })
  const MAJ = [0, 2, 4, 5, 7, 9, 11]
  let best = 0, bestScore = -1
  for (let k = 0; k < 12; k++) { const sc = MAJ.reduce((a, d) => a + counts[(k + d) % 12], 0); if (sc > bestScore) { bestScore = sc; best = k } }
  return ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'][best] + ' major'
}
