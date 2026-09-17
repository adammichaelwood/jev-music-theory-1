// Convert a Bach chorale (Humdrum **kern, bach-370-chorales layout: bass tenor alto soprano) into an exercise.
//   npx tsx scripts/kern2ex.ts chor001.krn --phrases 1 --given S,B --id 010 --difficulty 2 [--title "..."]
// Takes the first N phrases (fermata-delimited). Pickup measures are padded with given rests.
import { readFileSync, writeFileSync } from 'node:fs'
import type { Dur, Note, VoiceName } from '../src/score/model.ts'
import { noteToken } from '../src/score/format.ts'

const args = process.argv.slice(2)
const file = args[0]
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const phrases = +opt('phrases', '1')
const given = opt('given', 'S').split(',') as VoiceName[]
const id = opt('id', '900')
const difficulty = +opt('difficulty', '3')

const lines = readFileSync(file, 'utf8').split('\n')
const meta: Record<string, string> = {}
const ENT: Record<string, string> = { '&uuml;': 'ü', '&ouml;': 'ö', '&auml;': 'ä', '&szlig;': 'ß', '&Uuml;': 'Ü', '&Ouml;': 'Ö', '&Auml;': 'Ä' }
for (const l of lines) { const m = /^!!!(\w+)(?:@@?\w+)?:\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].replace(/&\w+;/g, e => ENT[e] ?? e) }
let key = '', time = ''
for (const l of lines) {
  const m = /^\*([A-Ga-g][#-]?):/.exec(l); if (m && !key) key = m[1]
  const t = /^\*M(\d+)\/(\d+)/.exec(l); if (t && !time) time = `${t[1]}/${t[2]}`
}
const [tnum, tden] = time.split('/').map(Number)
const keyText = `${key[0].toUpperCase()}${key.includes('#') ? '-sharp' : key.includes('-') ? '-flat' : ''} ${key[0] === key[0].toUpperCase() ? 'major' : 'minor'}`

const DUR: Record<string, Dur> = { '1': 'WHOLE', '2.': 'DOTTED-HALF', '2': 'HALF', '4.': 'DOTTED-QUARTER', '4': 'QUARTER', '8': 'EIGHTH', '16': 'SIXTEENTH' }
const BEATS: Record<Dur, number> = { WHOLE: 4, 'DOTTED-HALF': 3, HALF: 2, 'DOTTED-QUARTER': 1.5, QUARTER: 1, EIGHTH: 0.5, SIXTEENTH: 0.25 }
const beats = (d: Dur) => BEATS[d] * tden / 4

const ORDER: VoiceName[] = ['B', 'T', 'A', 'S']
// measures[v][m] = notes; measure index -1 = pickup
const measures: Record<VoiceName, Map<number, Note[]>> = { S: new Map(), A: new Map(), T: new Map(), B: new Map() }
const cursor: Record<VoiceName, number> = { S: 0, A: 0, T: 0, B: 0 }
let m = -1, fermatas = 0, stop = false
for (const l of lines) {
  if (stop) break
  if (l.startsWith('!') || l.startsWith('*')) continue
  if (l.startsWith('=')) { m++; for (const v of ORDER) cursor[v] = 0; continue }
  const cells = l.split('\t')
  let sawFermata = false
  cells.forEach((cell, i) => {
    const v = ORDER[i]
    if (cell === '.' || cell === '') return
    if (/[\[\]_]/.test(cell)) throw new Error(`tie in ${v} measure ${m + 1}: ${cell}`)
    const dm = /^(\d+\.?)/.exec(cell); const pm = /([A-Ga-g]+)([#\-n]*)/.exec(cell)
    if (!dm || !pm) throw new Error(`cannot parse ${cell}`)
    const dur = DUR[dm[1]]; if (!dur) throw new Error(`duration ${dm[1]}`)
    const letters = pm[1], acc = pm[2].includes('#') ? 'sharp' : pm[2].includes('-') ? 'flat' : 'natural'
    const letter = letters[0].toUpperCase() as Note['letter']
    const octave = letters[0] === letters[0].toLowerCase() ? 3 + letters.length : 4 - letters.length
    const note: Note = { letter, acc, octave, dur, onset: cursor[v] }
    if (!measures[v].has(m)) measures[v].set(m, [])
    measures[v].get(m)!.push(note)
    cursor[v] += beats(dur)
    if (cell.includes(';')) sawFermata = true
  })
  if (sawFermata) { fermatas++; if (fermatas >= phrases) stop = true }
}
// pad the pickup measure (index -1) with leading rests so it becomes a full measure 1
const hasPickup = ORDER.some(v => measures[v].has(-1))
const barBeats = tnum
const restTokens = (n: number, prefix = 'REST') => {
  const out: string[] = []
  if (prefix === '_') { while (n >= 1 - 1e-9) { out.push('_'); n -= 1 } }
  for (const d of ['WHOLE', 'DOTTED-HALF', 'HALF', 'DOTTED-QUARTER', 'QUARTER', 'EIGHTH', 'SIXTEENTH'] as Dur[]) while (n >= beats(d) - 1e-9) { out.push(prefix === '_' ? (beats(d) === 1 ? '_' : `_-${d}`) : `${prefix}-${d}`); n -= beats(d) }
  return out
}
// where the excerpt ends inside the last measure (max over given voices)
const endBeat = Math.max(...ORDER.map(v => (measures[v].get(m) ?? []).reduce((a, n) => Math.max(a, n.onset + beats(n.dur)), 0)))
const rows: string[] = []
for (const v of ['S', 'A', 'T', 'B'] as VoiceName[]) {
  const cells: string[] = []
  const first = hasPickup ? -1 : 0
  for (let mi = first; mi <= m; mi++) {
    const notes = measures[v].get(mi) ?? []
    const lead = mi === -1 ? barBeats - notes.reduce((a, n) => a + beats(n.dur), 0) : 0 // pickup padding (same for every voice)
    const pickupLead = mi === -1 ? barBeats - Math.min(...ORDER.map(u => barBeats - (measures[u].get(-1) ?? []).reduce((a, n) => a + beats(n.dur), 0))) : 0
    void lead
    const tail = mi === m ? barBeats - endBeat : 0
    let toks: string[]
    if (given.includes(v)) toks = [...restTokens(mi === -1 ? barBeats - pickupLead : 0), ...notes.map(n => noteToken(n)), ...restTokens(tail)]
    else toks = [...restTokens(mi === -1 ? barBeats - pickupLead : 0), ...restTokens(barBeats - (mi === -1 ? barBeats - pickupLead : 0) - tail, '_'), ...restTokens(tail)]
    cells.push(toks.join(' '))
  }
  rows.push(`${v}, ${cells.join(', ')}`.trimEnd())
}
const title = opt('title', `Bach chorale ${meta.SCT ?? file}${meta.OTL ? ' "' + meta.OTL + '"' : ''}, phrase${phrases > 1 ? 's 1–' + phrases : ' 1'} (${given.length === 1 ? 'harmonize the melody' : 'soprano + bass given'})`)
const missing = (['S', 'A', 'T', 'B'] as VoiceName[]).filter(v => !given.includes(v))
const names: Record<VoiceName, string> = { S: 'soprano', A: 'alto', T: 'tenor', B: 'bass' }
const instr = given.length === 1
  ? `Harmonize the given ${names[given[0]]} melody from a chorale in four voices, adding ${missing.map(v => names[v]).join(', ')}. Use chords of ${keyText}${keyText.endsWith('minor') ? ', raising the leading tone in dominant chords' : ''}, mostly one chord per beat, ending each phrase with a cadence. Follow standard SATB voice-leading: no parallel fifths or octaves, no voice crossing, keep the upper voices within an octave of their neighbors, resolve the leading tone up and chordal sevenths down. Eighth notes in the melody may be treated as passing tones or given their own chords.`
  : `The ${given.map(v => names[v]).join(' and ')} of a chorale phrase are given. Add the ${missing.map(v => names[v]).join(' and ')} so that every beat is a complete chord consistent with the given outer voices, following standard SATB voice-leading: no parallel fifths or octaves, no voice crossing, keep the upper voices within an octave of their neighbors, and resolve the leading tone up and chordal sevenths down. Eighth notes in the given voices may be passing tones.`
const md = `---
title: ${title}
type: ${given.length === 1 ? 'melody' : 'completion'}
difficulty: ${difficulty}
key: ${keyText}
time: ${time}
source: ${file.split('/').pop()} (Bach, public domain; Humdrum kern from craigsapp/bach-370-chorales)
---
${instr}

\`\`\`score
${rows.join('\n')}
\`\`\`
`
const out = `exercises/${id}-${file.split('/').pop()!.replace('.krn', '')}-${given.join('').toLowerCase()}-p${phrases}.md`
writeFileSync(out, md)
console.log(out); console.log(md)
