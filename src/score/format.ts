import {
  type Acc, type Dur, DURS, type Key, type Letter, type Note, type Score, type Time, type VoiceName,
  VOICES, beatUnitDur, beatsPerBar, durBeats, emptyScore, gaps, lockKey, noteEnd,
} from './model.ts'

export interface FormatVariant {
  accidentals: 'words' | 'unicode'
  align: boolean
  emptyCell?: 'blank' | 'underscores' // how a fully undecided measure is written
}
export const DEFAULT_VARIANT: FormatVariant = { accidentals: 'words', align: false, emptyCell: 'blank' }

// ---------- pitch / key text ----------
export function pitchText(n: Pick<Note, 'letter' | 'acc'>, v: FormatVariant['accidentals'] = 'words') {
  if (n.acc === 'natural') return n.letter
  if (v === 'unicode') return n.letter + (n.acc === 'sharp' ? '♯' : '♭')
  return `${n.letter}-${n.acc.toUpperCase()}`
}
/** "A-FLAT" | "A♭" | "Ab" | "A#" → { letter, acc } */
export function parsePitch(s: string): { letter: Letter; acc: Acc } | null {
  const m = /^([A-G])(?:-?(SHARP|FLAT)|([♯#])|([♭b]))?$/i.exec(s.trim())
  if (!m) return null
  const letter = m[1].toUpperCase() as Letter
  const acc: Acc = m[2] ? (m[2].toUpperCase() === 'SHARP' ? 'sharp' : 'flat') : m[3] ? 'sharp' : m[4] ? 'flat' : 'natural'
  return { letter, acc }
}
export function keyText(k: Key) {
  const acc = k.acc === 'natural' ? '' : k.acc === 'sharp' ? '-sharp' : '-flat'
  return `${k.tonic}${acc} ${k.mode}`
}
export function parseKey(s: string): Key {
  const m = /^([A-G])\s*(?:-?\s*(sharp|flat)|([♯#])|([♭b]))?\s+(major|minor)$/i.exec(s.trim())
  if (!m) throw new Error(`bad key: ${s}`)
  const acc: Acc = m[2] ? (m[2].toLowerCase() === 'sharp' ? 'sharp' : 'flat') : m[3] ? 'sharp' : m[4] ? 'flat' : 'natural'
  return { tonic: m[1].toUpperCase() as Letter, acc, mode: m[5].toLowerCase() as Key['mode'] }
}
export function parseTime(s: string): Time {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s.trim())
  if (!m) throw new Error(`bad time signature: ${s}`)
  return { num: +m[1], den: +m[2] }
}

// ---------- figures ----------
const figOut = (f: string, v: FormatVariant['accidentals']) =>
  v === 'unicode' ? f.replace(/#/g, '♯').replace(/b/g, '♭').replace(/n/g, '♮') : f
const figIn = (f: string) => f.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/♮/g, 'n')

// ---------- tokens ----------
export function noteToken(n: Note, v: FormatVariant['accidentals'] = 'words') {
  if (n.rest) return `REST-${n.dur}`
  const base = `${pitchText(n, v)}-${n.octave}-${n.dur}`
  return n.figures ? `${base}-${figOut(n.figures, v)}` : base
}

const DUR_RE = DURS.join('|')
/** parse one token at `onset`; returns note or gap length in beats */
export function parseToken(tok: string, onset: number, t: Time): { note?: Note; gapBeats?: number } {
  if (tok === '_') return { gapBeats: durBeats(beatUnitDur(t), t) }
  let m = new RegExp(`^_-(${DUR_RE})$`).exec(tok)
  if (m) return { gapBeats: durBeats(m[1] as Dur, t) }
  m = new RegExp(`^REST-(${DUR_RE})$`).exec(tok)
  if (m) return { note: { letter: 'C', acc: 'natural', octave: 4, dur: m[1] as Dur, onset, rest: true } }
  m = new RegExp(`^(.+?)-(\\d)-(${DUR_RE})(?:-(.+))?$`).exec(tok)
  if (!m) throw new Error(`bad token: ${tok}`)
  const p = parsePitch(m[1])
  if (!p) throw new Error(`bad pitch in token: ${tok}`)
  const note: Note = { ...p, octave: +m[2], dur: m[3] as Dur, onset }
  if (m[4]) note.figures = figIn(m[4])
  return { note }
}

// ---------- score block ----------
/** Parse the CSV rows into a Score. All parsed notes are marked locked when `lock` is true. */
export function parseScoreBlock(text: string, key: Key, time: Time, lock = true): Score {
  const rows = text.split('\n').map(r => r.trim()).filter(Boolean)
  const byVoice = new Map<VoiceName, string[]>()
  for (const row of rows) {
    const cells = row.split(',').map(c => c.trim())
    const v = cells.shift()?.toUpperCase() as VoiceName
    if (!VOICES.includes(v)) throw new Error(`bad voice label: ${v}`)
    byVoice.set(v, cells)
  }
  const nMeasures = Math.max(...[...byVoice.values()].map(c => c.length))
  const s = emptyScore(key, time, nMeasures)
  for (const v of VOICES) {
    const cells = byVoice.get(v) ?? []
    cells.forEach((cell, m) => {
      let onset = 0
      for (const tok of cell.split(/\s+/).filter(Boolean)) {
        const r = parseToken(tok, onset, time)
        if (r.gapBeats !== undefined) { onset += r.gapBeats; continue }
        const n = r.note!
        s.voices[v][m].push(n)
        if (lock) s.locked.add(lockKey(v, m, n.onset))
        onset = noteEnd(n, time)
      }
      if (onset > beatsPerBar(time) + 1e-9) throw new Error(`${v} measure ${m + 1} overfull (${onset} beats)`)
    })
  }
  return s
}

/** tokens for one measure of one voice, gaps included, each with its onset */
function measureTokens(s: Score, v: VoiceName, m: number, acc: FormatVariant['accidentals'], emptyCell: FormatVariant['emptyCell'] = 'blank'): { tok: string; onset: number; len: number }[] {
  const notes = s.voices[v][m]
  if (notes.length === 0 && emptyCell === 'blank') return []
  const out: { tok: string; onset: number; len: number }[] = []
  const unit = durBeats(beatUnitDur(s.time), s.time)
  for (const [a, b] of gaps(s, v, m)) {
    // fill a gap left to right: snap to the next beat boundary first, then whole `_` units, then the remainder
    let cur = a
    while (b - cur > 1e-9) {
      const toBoundary = unit - (cur % unit)
      const room = Math.min(b - cur, toBoundary < 1e-9 ? unit : toBoundary)
      if (Math.abs(cur % unit) < 1e-9 && b - cur >= unit - 1e-9) { out.push({ tok: '_', onset: cur, len: unit }); cur += unit; continue }
      const d = DURS.find(d => durBeats(d, s.time) <= room + 1e-9)
      if (!d) throw new Error(`gap of ${room} beats not expressible`)
      const len = durBeats(d, s.time)
      out.push({ tok: `_-${d}`, onset: cur, len }); cur += len
    }
  }
  for (const n of notes) out.push({ tok: noteToken(n, acc), onset: n.onset, len: durBeats(n.dur, s.time) })
  return out.sort((x, y) => x.onset - y.onset)
}

export function serializeScoreBlock(s: Score, variant: FormatVariant = DEFAULT_VARIANT): string {
  const cells: Record<VoiceName, string[]> = { S: [], A: [], T: [], B: [] }
  for (let m = 0; m < s.nMeasures; m++) {
    const toks = Object.fromEntries(VOICES.map(v => [v, measureTokens(s, v, m, variant.accidentals, variant.emptyCell)])) as Record<VoiceName, ReturnType<typeof measureTokens>>
    if (!variant.align) {
      for (const v of VOICES) cells[v].push(toks[v].map(t => t.tok).join(' '))
      continue
    }
    // column alignment: every distinct onset in the bar is a slot; a token spans the slots it covers
    const onsets = [...new Set(VOICES.flatMap(v => toks[v].map(t => t.onset)))].sort((a, b) => a - b)
    const width = onsets.map(() => 0)
    const slotsOf = (t: { onset: number; len: number }) => {
      const i0 = onsets.indexOf(t.onset)
      let i1 = i0
      while (i1 + 1 < onsets.length && onsets[i1 + 1] < t.onset + t.len - 1e-9) i1++
      return [i0, i1]
    }
    // widths: single-slot tokens first, then widen last slot of multi-slot tokens if needed
    for (const v of VOICES) for (const t of toks[v]) { const [i0, i1] = slotsOf(t); if (i0 === i1) width[i0] = Math.max(width[i0], t.tok.length + 1) }
    for (const v of VOICES) for (const t of toks[v]) {
      const [i0, i1] = slotsOf(t)
      if (i0 === i1) continue
      const have = width.slice(i0, i1 + 1).reduce((a, b) => a + b, 0)
      if (have < t.tok.length + 1) width[i1] += t.tok.length + 1 - have
    }
    const total = width.reduce((a, b) => a + b, 0)
    for (const v of VOICES) {
      let line = ''
      for (const t of toks[v]) {
        const start = width.slice(0, slotsOf(t)[0]).reduce((a, b) => a + b, 0)
        line = line.padEnd(start) + t.tok
      }
      cells[v].push(line.padEnd(total).trimEnd().padEnd(total - 1)) // pad so ',' separators line up across rows
    }
  }
  return VOICES.map(v => `${v}, ${cells[v].join(', ')}`.trimEnd()).join('\n')
}
