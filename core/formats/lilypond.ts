// LilyPond presentation of a score (absolute pitches, `s` spacer rests for undecided beats).
import { type Acc, type Dur, type Score, VOICES, VOICE_LABEL, durBeats, gaps, DURS } from '@core/score/model.ts'

const DUR_LY: Record<Dur, string> = { WHOLE: '1', 'DOTTED-HALF': '2.', HALF: '2', 'DOTTED-QUARTER': '4.', QUARTER: '4', EIGHTH: '8', SIXTEENTH: '16' }
const ACC_LY: Record<Acc, string> = { natural: '', sharp: 'is', flat: 'es' }
export const lyPitch = (n: { letter: string; acc: Acc; octave: number }) => {
  const o = n.octave - 3 // c = C3, c' = C4
  return n.letter.toLowerCase() + ACC_LY[n.acc] + (o > 0 ? "'".repeat(o) : ','.repeat(-o))
}
export const lyKey = (s: Score) => `\\key ${s.key.tonic.toLowerCase()}${ACC_LY[s.key.acc]} \\${s.key.mode}`

export function scoreToLilypond(s: Score): string {
  const lines = [`\\version "2.24.0"`, `global = { ${lyKey(s)} \\time ${s.time.num}/${s.time.den} }`]
  for (const v of VOICES) {
    const bars: string[] = []
    for (let m = 0; m < s.nMeasures; m++) {
      const items: { onset: number; text: string }[] = s.voices[v][m].map(n => ({ onset: n.onset, text: n.rest ? `r${DUR_LY[n.dur]}` : lyPitch(n) + DUR_LY[n.dur] }))
      for (const [a, b] of gaps(s, v, m)) {
        let cur = a
        while (b - cur > 1e-9) { const d = DURS.find(d => durBeats(d, s.time) <= b - cur + 1e-9)!; items.push({ onset: cur, text: `s${DUR_LY[d]}` }); cur += durBeats(d, s.time) }
      }
      bars.push(items.sort((x, y) => x.onset - y.onset).map(i => i.text).join(' '))
    }
    lines.push(`${VOICE_LABEL[v].toLowerCase()} = { ${bars.join(' | ')} | }`)
  }
  lines.push(`\\score { << \\new Staff << \\global \\new Voice { \\voiceOne \\soprano } \\new Voice { \\voiceTwo \\alto } >> \\new Staff << \\global \\clef bass \\new Voice { \\voiceOne \\tenor } \\new Voice { \\voiceTwo \\bass } >> >> }`)
  return lines.join('\n')
}

// ---- parser for the subset above (absolute pitches, s/r rests, | bars) — used to read model-written scores ----
import type { Key, Note, Time } from '@core/score/model.ts'
import { emptyScore, LETTERS, beatsPerBar } from '@core/score/model.ts'
const DUR_FROM: Record<string, Dur> = { '1': 'WHOLE', '2.': 'DOTTED-HALF', '2': 'HALF', '4.': 'DOTTED-QUARTER', '4': 'QUARTER', '8': 'EIGHTH', '16': 'SIXTEENTH' }
export function parseLilypond(text: string, key: Key, time: Time): Score {
  const voices: Record<string, string> = {}
  for (const m of text.matchAll(/\b(soprano|alto|tenor|bass)\s*=\s*\{([^}]*)\}/g)) voices[m[1]] = m[2]
  const bars = (body: string) => body.replace(/\\[a-zA-Z]+/g, ' ').split('|').map(b => b.trim()).filter((b, i, a) => b || i < a.length - 1)
  const nBars = Math.max(...Object.values(voices).map(v => bars(v).length))
  const s = emptyScore(key, time, nBars)
  const bar = beatsPerBar(time)
  for (const [vn, body] of Object.entries(voices)) {
    const v = vn[0].toUpperCase() as 'S' | 'A' | 'T' | 'B'
    bars(body).forEach((b, m) => {
      let onset = 0
      let lastDur: Dur = 'QUARTER'
      for (const tok of b.split(/\s+/).filter(Boolean)) {
        const mm = /^([a-gsr])(is|es|isis|eses)?([',]*)(\d+\.?)?$/.exec(tok)
        if (!mm) continue
        const dur: Dur | undefined = mm[4] ? DUR_FROM[mm[4]] : lastDur; if (!dur) continue
        lastDur = dur
        if (mm[1] === 's') { onset += durBeats(dur, time); continue }
        const letter = mm[1].toUpperCase() as Note['letter']
        if (mm[1] === 'r') { s.voices[v][m].push({ letter: 'C', acc: 'natural', octave: 4, dur, onset, rest: true }); onset += durBeats(dur, time); continue }
        if (!LETTERS.includes(letter)) continue
        const acc: Acc = mm[2] === 'is' ? 'sharp' : mm[2] === 'es' ? 'flat' : 'natural'
        const ups = (mm[3].match(/'/g) ?? []).length, downs = (mm[3].match(/,/g) ?? []).length
        const note: Note = { letter, acc, octave: 3 + ups - downs, dur, onset }
        if (onset + durBeats(dur, time) <= bar + 1e-9) s.voices[v][m].push(note)
        onset += durBeats(dur, time)
      }
    })
  }
  return s
}
