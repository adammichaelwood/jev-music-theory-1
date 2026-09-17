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
