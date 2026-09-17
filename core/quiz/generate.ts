// Generated music-theory quiz: every question's answer is computed by code, so the bank is unlimited and ungameable.
// Tiers: 1 fundamentals · 2 intervals/triads · 3 harmony in a key · 4 four-voice judgments · 5 chromatic harmony.
import { pitchText, parseKey } from '@core/formats/csv.ts'
import { keyAccidental, identifyChord, grade } from '@core/grader/index.ts'
import { type Acc, type Key, type Letter, type Note, LETTERS, letterIndex, midi, pitchClass, emptyScore, type VoiceName, VOICES } from '@core/score/model.ts'

export interface Question {
  id: string
  tier: 1 | 2 | 3 | 4 | 5
  kind: string
  state: Record<string, unknown> | string
  instructions: string
  options: Record<string, string | null>
  answer: string
}

// ---- deterministic RNG ----
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1))
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  return { next, pick, int, shuffle }
}
type R = ReturnType<typeof rng>

// ---- pitch helpers ----
type P = { letter: Letter; acc: Acc }
const P = (letter: Letter, acc: Acc = 'natural'): P => ({ letter, acc })
const ACC_N: Record<Acc, number> = { flat: -1, natural: 0, sharp: 1 }
const ALL_PITCHES: P[] = LETTERS.flatMap(l => (['flat', 'natural', 'sharp'] as Acc[]).map(a => P(l, a)))
const name = (p: P) => pitchText(p)
const withOct = (p: P, o: number) => `${name(p)}${o}`
/** pitch `steps` letters above p with the given semitone distance, or null if it needs a double accidental */
function transpose(p: P, steps: number, semis: number): P | null {
  const letter = LETTERS[(letterIndex(p.letter) + steps) % 7]
  const octaveCarry = Math.floor((letterIndex(p.letter) + steps) / 7)
  const target = (pitchClass(p) + semis) % 12
  const natural = (pitchClass(P(letter)) + 12 * octaveCarry) % 12
  let d = ((target - natural) % 12 + 12) % 12; if (d > 6) d -= 12
  if (Math.abs(d) > 1) return null
  return P(letter, d === 1 ? 'sharp' : d === -1 ? 'flat' : 'natural')
}
const INTERVALS: { name: string; steps: number; semis: number }[] = [
  { name: 'minor second', steps: 1, semis: 1 }, { name: 'major second', steps: 1, semis: 2 }, { name: 'minor third', steps: 2, semis: 3 }, { name: 'major third', steps: 2, semis: 4 },
  { name: 'perfect fourth', steps: 3, semis: 5 }, { name: 'augmented fourth', steps: 3, semis: 6 }, { name: 'diminished fifth', steps: 4, semis: 6 }, { name: 'perfect fifth', steps: 4, semis: 7 },
  { name: 'minor sixth', steps: 5, semis: 8 }, { name: 'major sixth', steps: 5, semis: 9 }, { name: 'minor seventh', steps: 6, semis: 10 }, { name: 'major seventh', steps: 6, semis: 11 }, { name: 'perfect octave', steps: 7, semis: 12 },
]
const KEYS = ['C major', 'G major', 'D major', 'A major', 'E major', 'B major', 'F major', 'B-flat major', 'E-flat major', 'A-flat major', 'D-flat major',
  'A minor', 'E minor', 'B minor', 'F-sharp minor', 'D minor', 'G minor', 'C minor', 'F minor', 'C-sharp minor'].map(k => ({ text: k, key: parseKey(k) }))
const degreePitch = (key: Key, deg: number, raise = false): P => {
  const letter = LETTERS[(letterIndex(key.tonic) + deg - 1) % 7]
  const acc = keyAccidental(letter, key)
  return raise ? P(letter, acc === 'flat' ? 'natural' : 'sharp') : P(letter, acc)
}
const DEGREE_NAMES = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading tone']
const SIG: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 }
const sigOf = (key: Key) => {
  const rel = key.mode === 'major' ? P(key.tonic, key.acc) : transpose(P(key.tonic, key.acc), 2, 3)!
  return SIG[rel.letter + (rel.acc === 'sharp' ? '#' : rel.acc === 'flat' ? 'b' : '')]
}
const sigText = (n: number) => n === 0 ? 'no sharps or flats' : `${Math.abs(n)} ${n > 0 ? 'sharp' : 'flat'}${Math.abs(n) > 1 ? 's' : ''}`
const NUMERALS_MAJ = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], NUMERALS_MIN = ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°']
/** diatonic triad on a degree (harmonic minor for V and vii°) */
function triadOn(key: Key, deg: number): P[] {
  const raise = key.mode === 'minor' && (deg === 5 || deg === 7)
  const third = ((deg + 1) % 7) + 1, fifth = ((deg + 3) % 7) + 1
  return [degreePitch(key, deg), degreePitch(key, third, raise && deg === 5), degreePitch(key, fifth, false)].map((p, i) => (i === 0 && raise && deg === 7) ? degreePitch(key, 7, true) : p)
}
const opts = (keys: string[], descr: Record<string, string> = {}) => Object.fromEntries(keys.map(k => [k, descr[k] ?? null]))
const PITCH_OPTS = opts(ALL_PITCHES.map(name))

// ---- generators ----
type Gen = (r: R, i: number) => Question | null
const G: Record<string, { tier: Question['tier']; gen: Gen }> = {
  'key-signature': { tier: 1, gen: (r, i) => { const k = r.pick(KEYS); return { id: `ks${i}`, tier: 1, kind: 'key-signature', state: { key: k.text }, instructions: 'How many sharps or flats are in the key signature of `key`?', options: opts([0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7].map(sigText)), answer: sigText(sigOf(k.key)) } } },
  'scale-degree': { tier: 1, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 7); return { id: `sd${i}`, tier: 1, kind: 'scale-degree', state: { key: k.text, degree: DEGREE_NAMES[d - 1] }, instructions: 'Which pitch is the `degree` of the key `key`?' + (k.key.mode === 'minor' ? ' (Use the raised leading tone in minor.)' : ''), options: PITCH_OPTS, answer: name(degreePitch(k.key, d, k.key.mode === 'minor' && d === 7)) } } },
  'interval-above': { tier: 1, gen: (r, i) => { for (let t = 0; t < 20; t++) { const p = r.pick(ALL_PITCHES), iv = r.pick(INTERVALS); const q = transpose(p, iv.steps, iv.semis); if (q) return { id: `ia${i}`, tier: 1, kind: 'interval-above', state: { pitch: name(p), interval: iv.name }, instructions: 'Which pitch is the `interval` above `pitch`? Spell it correctly for that interval.', options: PITCH_OPTS, answer: name(q) } } return null } },
  'interval-name': { tier: 2, gen: (r, i) => { for (let t = 0; t < 20; t++) { const p = r.pick(ALL_PITCHES), iv = r.pick(INTERVALS), o = r.int(3, 4); const q = transpose(p, iv.steps, iv.semis); if (!q) continue; const o2 = o + Math.floor((letterIndex(p.letter) + iv.steps) / 7); return { id: `in${i}`, tier: 2, kind: 'interval-name', state: { lower: withOct(p, o), upper: withOct(q, o2) }, instructions: 'What is the interval from `lower` up to `upper`?', options: opts(INTERVALS.map(x => x.name)), answer: iv.name } } return null } },
  'triad-quality': { tier: 2, gen: (r, i) => { for (let t = 0; t < 20; t++) { const root = r.pick(ALL_PITCHES), q = r.pick(['major', 'minor', 'diminished', 'augmented'] as const); const [t3, t5] = q === 'major' ? [4, 7] : q === 'minor' ? [3, 7] : q === 'diminished' ? [3, 6] : [4, 8]; const a = transpose(root, 2, t3), b = transpose(root, 4, t5); if (!a || !b) continue; const ps = r.shuffle([root, a, b]); return { id: `tq${i}`, tier: 2, kind: 'triad-quality', state: { pitches: ps.map(name).join(' ') }, instructions: 'The three pitches in `pitches` form a triad (in some order). What is its quality?', options: opts(['major', 'minor', 'diminished', 'augmented']), answer: q } } return null } },
  'triad-root': { tier: 2, gen: (r, i) => { for (let t = 0; t < 20; t++) { const root = r.pick(ALL_PITCHES), q = r.pick(['major', 'minor'] as const); const a = transpose(root, 2, q === 'major' ? 4 : 3), b = transpose(root, 4, 7); if (!a || !b) continue; const ps = r.shuffle([root, a, b]); if (ps[0] === root) [ps[0], ps[1]] = [ps[1], ps[0]]; return { id: `tr${i}`, tier: 2, kind: 'triad-root', state: { pitches: ps.map(name).join(' ') }, instructions: 'The pitches in `pitches`, listed from lowest to highest, form a triad in some inversion. Which pitch is its root?', options: opts(ps.map(name)), answer: name(root) } } return null } },
  'roman-numeral': { tier: 3, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 7); const tri = triadOn(k.key, d); const inv = r.int(0, 2); const ordered = [...tri.slice(inv), ...tri.slice(0, inv)]; const nums = k.key.mode === 'major' ? NUMERALS_MAJ : NUMERALS_MIN; return { id: `rn${i}`, tier: 3, kind: 'roman-numeral', state: { key: k.text, chord: ordered.map(name).join(' ') + ' (lowest to highest)' }, instructions: 'In the key `key`, which Roman numeral names the chord `chord`? Ignore the inversion.', options: opts(nums), answer: nums[d - 1] } } },
  'inversion': { tier: 3, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 7); const tri = triadOn(k.key, d); const inv = r.int(0, 2); const bass = tri[inv]; const others = r.shuffle(tri.filter(p => p !== bass)); return { id: `iv${i}`, tier: 3, kind: 'inversion', state: { key: k.text, bass: name(bass), upper_voices: others.map(name).join(' ') }, instructions: 'A triad in `key` has `bass` in the bass and `upper_voices` above it. What is its inversion?', options: opts(['root position', 'first inversion', 'second inversion'], { 'root position': 'the root is in the bass (figures 5/3)', 'first inversion': 'the third is in the bass (figure 6)', 'second inversion': 'the fifth is in the bass (figures 6/4)' }), answer: ['root position', 'first inversion', 'second inversion'][inv] } } },
  'figured-bass': { tier: 3, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 7), inv = r.int(0, 2); const tri = triadOn(k.key, d); const fig = ['5/3', '6', '6/4'][inv]; const nums = k.key.mode === 'major' ? NUMERALS_MAJ : NUMERALS_MIN; return { id: `fb${i}`, tier: 3, kind: 'figured-bass', state: { key: k.text, bass_note: name(tri[inv]), figures: fig }, instructions: 'In `key`, a bass note `bass_note` carries the figures `figures`. Which Roman numeral is the chord?', options: opts(nums), answer: nums[d - 1] } } },
  'seventh-of-v7': { tier: 3, gen: (r, i) => { const k = r.pick(KEYS); return { id: `sv${i}`, tier: 3, kind: 'seventh-of-v7', state: { key: k.text }, instructions: 'Which pitch is the chordal seventh of the dominant seventh chord (V7) in `key`?', options: PITCH_OPTS, answer: name(degreePitch(k.key, 4)) } } },
  'tendency-resolution': { tier: 3, gen: (r, i) => { const k = r.pick(KEYS), which = r.pick(['leading tone', 'chordal seventh'] as const); const from = which === 'leading tone' ? degreePitch(k.key, 7, k.key.mode === 'minor') : degreePitch(k.key, 4); const to = which === 'leading tone' ? degreePitch(k.key, 1) : degreePitch(k.key, 3); return { id: `tr${i}`, tier: 3, kind: 'tendency-resolution', state: { key: k.text, chord: 'V7', tone: `${name(from)} (the ${which})` }, instructions: 'In `key`, the `chord` chord resolves to the tonic triad. The voice holding `tone` should move to which pitch?', options: PITCH_OPTS, answer: name(to) } } },
  'parallels': { tier: 4, gen: (r, i) => { // two consecutive root-position triads in four voices; ask what the grader finds
    for (let t = 0; t < 40; t++) {
      const k = r.pick(KEYS); const d1 = r.int(1, 7), d2 = r.int(1, 7); if (d1 === d2) continue
      const son = (d: number) => { const tri = triadOn(k.key, d); const b = tri[0]; const ups = [r.pick(tri), r.pick(tri), r.pick(tri)]; return { B: { ...b, octave: 3 }, T: { ...ups[0], octave: r.int(3, 4) }, A: { ...ups[1], octave: 4 }, S: { ...ups[2], octave: r.int(4, 5) } } }
      const s1 = son(d1), s2 = son(d2)
      const fix = (x: Record<VoiceName, Note & { octave: number }>) => { for (const v of ['T', 'A', 'S'] as VoiceName[]) { const below = v === 'T' ? x.B : v === 'A' ? x.T : x.A; while (midi(x[v]) <= midi(below)) x[v].octave++ } return x }
      const a = fix(s1 as never), b = fix(s2 as never)
      const sc = emptyScore(k.key, { num: 2, den: 4 }, 1)
      for (const v of VOICES) sc.voices[v][0] = [{ ...a[v], dur: 'QUARTER', onset: 0 }, { ...b[v], dur: 'QUARTER', onset: 1 }]
      const rep = grade(sc); const p5 = rep.issues.some(x => x.kind === 'parallel-fifths'), p8 = rep.issues.some(x => x.kind === 'parallel-octaves')
      if (p5 && p8) continue
      const show = (x: typeof a) => VOICES.map(v => `${v}: ${withOct(x[v], x[v].octave)}`).join(', ')
      return { id: `pl${i}`, tier: 4, kind: 'parallels', state: { key: k.text, first_chord: show(a), second_chord: show(b) }, instructions: 'Four voices (S soprano, A alto, T tenor, B bass) move from `first_chord` to `second_chord`. Do any two voices move in parallel perfect fifths or parallel octaves?', options: opts(['parallel fifths', 'parallel octaves', 'neither'], { 'parallel fifths': 'some pair of voices forms a perfect fifth (or compound fifth) in both chords and both voices move', 'parallel octaves': 'some pair of voices forms an octave or unison in both chords and both voices move', neither: 'no parallel fifths or octaves' }), answer: p5 ? 'parallel fifths' : p8 ? 'parallel octaves' : 'neither' }
    } return null } },
  'doubling': { tier: 4, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 6); const tri = triadOn(k.key, d); const dbl = r.int(0, 2); const voices = r.shuffle([tri[0], tri[1], tri[2], tri[dbl]]); return { id: `db${i}`, tier: 4, kind: 'doubling', state: { key: k.text, chord: voices.map(name).join(' '), root: name(tri[0]) }, instructions: 'The four voices of a root-position triad in `key` sound the pitches `chord` (any order). The chord\'s root is `root`. Which chord member is doubled?', options: opts(['the root', 'the third', 'the fifth']), answer: ['the root', 'the third', 'the fifth'][dbl] } } },
  'spacing-crossing': { tier: 4, gen: (r, i) => { const k = r.pick(KEYS), d = r.int(1, 7); const tri = triadOn(k.key, d); const kind = r.pick(['voice crossing', 'spacing', 'none'] as const); const S = { ...r.pick(tri), octave: 5 }, A = { ...r.pick(tri), octave: 4 }, T = { ...r.pick(tri), octave: 3 }, B = { ...tri[0], octave: 2 }; if (midi(T) <= midi(B)) T.octave = 3; if (kind === 'voice crossing') { A.octave = 5; while (midi(A) <= midi(S)) A.octave++ } else if (kind === 'spacing') { A.octave = 3; while (midi(S) - midi(A) <= 12) A.octave-- ; while (midi(A) <= midi(T)) T.octave-- } else { while (midi(A) >= midi(S)) A.octave--; while (midi(S) - midi(A) > 12) A.octave++; while (midi(A) <= midi(T)) T.octave--; while (midi(A) - midi(T) > 12) T.octave++ } const state = { key: k.text, soprano: withOct(S, S.octave), alto: withOct(A, A.octave), tenor: withOct(T, T.octave), bass: withOct(B, B.octave) }; return { id: `sp${i}`, tier: 4, kind: 'spacing-crossing', state, instructions: 'A four-voice chord has `soprano`, `alto`, `tenor` and `bass`. Which voice-leading fault, if any, does it show?', options: opts(['voice crossing', 'spacing', 'none'], { 'voice crossing': 'an upper voice is written below the voice beneath it (e.g. alto above soprano)', spacing: 'soprano and alto, or alto and tenor, are more than an octave apart', none: 'no crossing and no spacing fault' }), answer: kind } } },
  'cadence-type': { tier: 4, gen: (r, i) => { const k = r.pick(KEYS); const nums = k.key.mode === 'major' ? NUMERALS_MAJ : NUMERALS_MIN; const c = r.pick([['V', 'I', 'authentic cadence'], ['V7', 'I', 'authentic cadence'], ['IV', 'I', 'plagal cadence'], ['ii', 'V', 'half cadence'], ['I', 'V', 'half cadence'], ['V', 'vi', 'deceptive cadence'], ['IV', 'V', 'half cadence']]); const tr = (n: string) => n === 'I' ? nums[0] : n === 'IV' ? nums[3] : n === 'ii' ? nums[1] : n === 'vi' ? nums[5] : n; return { id: `cd${i}`, tier: 4, kind: 'cadence-type', state: { key: k.text, progression: `${tr(c[0])} → ${tr(c[1])}` }, instructions: 'In `key`, a phrase ends with the chord progression `progression`. What type of cadence is this?', options: opts(['authentic cadence', 'plagal cadence', 'half cadence', 'deceptive cadence']), answer: c[2] } } },
  'secondary-dominant': { tier: 5, gen: (r, i) => { for (let t = 0; t < 20; t++) { const k = r.pick(KEYS); const target = r.pick([2, 4, 5, 6]); const tt = degreePitch(k.key, target); const root = transpose(tt, 4, 7)!; const chord = [root, transpose(root, 2, 4), transpose(root, 4, 7), transpose(root, 6, 10)]; if (chord.some(p => !p)) continue; const right = chord.map(p => name(p!)).join(' '); const nums = k.key.mode === 'major' ? NUMERALS_MAJ : NUMERALS_MIN; const distract = new Set<string>(); while (distract.size < 4) { const alt = chord.map(p => ({ ...p! })); const j = r.int(0, 3); alt[j].acc = r.pick(['flat', 'natural', 'sharp'] as Acc[]); const s = alt.map(name).join(' '); if (s !== right) distract.add(s) } return { id: `sd${i}`, tier: 5, kind: 'secondary-dominant', state: { key: k.text, chord: `V7/${nums[target - 1]}` }, instructions: 'In `key`, which pitches (root, third, fifth, seventh) make up the secondary dominant `chord`?', options: opts(r.shuffle([right, ...distract])), answer: right } } return null } },
  'enharmonic': { tier: 5, gen: (r, i) => { const p = r.pick(ALL_PITCHES.filter(x => x.acc !== 'natural' || ['B', 'C', 'E', 'F'].includes(x.letter))); const eq = ALL_PITCHES.filter(x => pitchClass(x) === pitchClass(p) && !(x.letter === p.letter && x.acc === p.acc)); if (!eq.length) return null; const answer = name(eq[0]); return { id: `en${i}`, tier: 5, kind: 'enharmonic', state: { pitch: name(p) }, instructions: 'Which pitch is enharmonically equivalent to `pitch` (the same key on the piano, spelled with a different letter)?', options: PITCH_OPTS, answer } } },
  'neapolitan': { tier: 5, gen: (r, i) => { for (let t = 0; t < 20; t++) { const k = r.pick(KEYS); const root = transpose(degreePitch(k.key, 1), 1, 1); if (!root) continue; const chord = [root, transpose(root, 2, 4), transpose(root, 4, 7)]; if (chord.some(p => !p)) continue; const right = chord.map(p => name(p!)).join(' '); const distract = new Set<string>(); while (distract.size < 4) { const alt = chord.map(p => ({ ...p! })); alt[r.int(0, 2)].acc = r.pick(['flat', 'natural', 'sharp'] as Acc[]); const s = alt.map(name).join(' '); if (s !== right) distract.add(s) } return { id: `np${i}`, tier: 5, kind: 'neapolitan', state: { key: k.text }, instructions: 'Which pitches (root, third, fifth) make up the Neapolitan chord (♭II) in `key`?', options: opts(r.shuffle([right, ...distract])), answer: right } } return null } },
  'augmented-sixth': { tier: 5, gen: (r, i) => { for (let t = 0; t < 20; t++) { const k = r.pick(KEYS); const six = transpose(degreePitch(k.key, 1), 5, 8), four = transpose(degreePitch(k.key, 1), 3, 6); if (!six || !four) continue; const bass = six, top = four; const right = `${name(bass)} and ${name(top)}`; const alts = new Set<string>(); const cands = [transpose(bass, 5, 9), transpose(bass, 5, 8), transpose(bass, 6, 10), transpose(bass, 4, 7)].filter(Boolean) as P[]; for (const c of cands) { const s = `${name(bass)} and ${name(c)}`; if (s !== right) alts.add(s) } if (alts.size < 2) continue; return { id: `a6${i}`, tier: 5, kind: 'augmented-sixth', state: { key: k.text }, instructions: 'In `key`, an augmented sixth chord is built on the lowered sixth scale degree in the bass. Which two pitches form its augmented sixth interval (bass and the note an augmented sixth above it)?', options: opts(r.shuffle([right, ...alts])), answer: right } } return null } },
}
void identifyChord; void ACC_N

export const KINDS = Object.keys(G)
export function generate(seed: number, perKind: number, kinds = KINDS): Question[] {
  const out: Question[] = []
  for (const kind of kinds) {
    const r = rng(seed * 1000 + KINDS.indexOf(kind))
    let made = 0, tries = 0
    while (made < perKind && tries++ < perKind * 10) { const q = G[kind].gen(r, made); if (q && q.answer in q.options) { out.push(q); made++ } }
  }
  return out
}
