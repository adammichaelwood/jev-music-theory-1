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
export interface Voicing { bass: number; lh: number[]; rh: number[] } // MIDI numbers; lh = two tones above the bass, rh = four
const nearest = (pc: number, target: number, lo: number, hi: number, taken: number[] = []) => {
  const c: number[] = []; for (let m = lo; m <= hi; m++) if (m % 12 === pc && !taken.includes(m)) c.push(m)
  return c.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]
}
/** open voicing: bass low; two left-hand tones at least a fifth above it; four right-hand tones spread over C4–C6, no two closer than a third */
export function voice(c: Chord, prev: Voicing | null): Voicing {
  const rootPc = pitchClass(c.root)
  const iv = QUALITIES[c.quality].iv
  const pcOf = (s: number) => (rootPc + s) % 12
  const third = iv.find(x => x === 3 || x === 4 || x === 5), seventh = iv.find(x => x === 10 || x === 11) ?? iv.find(x => x === 9)
  const fifth = iv.find(x => x === 6 || x === 7 || x === 8), exts = iv.filter(x => x >= 12)
  // bass: nearest octave of the bass tone to the previous bass, within E2..D3
  const bassPc = pcOf(c.bassInterval)
  let bass = nearest(bassPc, prev?.bass ?? 43, 40, 52)!
  // left hand: two tones a fifth or more above the bass — prefer 7th and 3rd (guide tones), else 5th, else root
  const lhWant = [seventh, third, fifth, 0].filter((x): x is number => x !== undefined).map(pcOf).filter(pc => pc !== bassPc).slice(0, 2)
  const lh: number[] = []
  lhWant.forEach((pc, i) => { const t = prev?.lh[i] ?? bass + 10 + i * 5; const m = nearest(pc, t, bass + 7, bass + 22, lh); if (m !== undefined) lh.push(m) })
  lh.sort((a, b) => a - b)
  if (lh.length === 2 && lh[1] - lh[0] < 3) lh[1] = nearest(lh[1] % 12, lh[1] + 12, lh[0] + 3, bass + 24, lh) ?? lh[1]
  // right hand: 3rd, 7th, an extension (or the 5th), and the root or 5th — stacked upward from a bottom note near the
  // previous right hand, each next tone at least a third above the last, so the four notes spread over an octave or more
  const rhPcs = [...new Set([third, seventh, exts[exts.length - 1] ?? fifth, fifth !== undefined && exts.length ? fifth : 0, fifth, 0].filter((x): x is number => x !== undefined).map(pcOf))].slice(0, 4)
  const lo = Math.max(60, (lh[lh.length - 1] ?? bass) + 3)
  const bottomTarget = Math.max(lo, Math.min(prev?.rh[0] ?? 63, 70))
  // try every stacking order; keep the one with the smallest span that starts nearest the previous bottom note
  const perms = (xs: number[]): number[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]))
  let rh: number[] = [], best = Infinity
  for (const order of perms(rhPcs)) {
    const bottom = nearest(order[0], bottomTarget, lo, lo + 11)!
    const stack = [bottom]
    for (const pc of order.slice(1)) { const cur = stack[stack.length - 1]; let d = (pc - cur % 12 + 12) % 12; if (d < 3) d += 12; stack.push(cur + d) }
    const score = (stack[stack.length - 1] - stack[0]) + Math.abs(bottom - bottomTarget) * 0.5 + (stack[stack.length - 1] > 86 ? 50 : 0)
    if (score < best) { best = score; rh = stack }
  }
  rh.sort((a, b) => a - b)
  return { bass, lh, rh }
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
