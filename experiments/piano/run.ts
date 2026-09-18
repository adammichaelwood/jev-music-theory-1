// Headless: npx tsx experiments/piano/run.ts [--n 60] [--decider jev] [--vibe "..."] [--sample] [--repeats-ok]
import 'dotenv/config'
import { appendFileSync, mkdirSync } from 'node:fs'
import { deciderByName } from '@core/decide/index.ts'
import { DEFAULT_VIBE, pianoLoop, streamStats, type ChordRecord } from '@core/piano/loop.ts'
const args = process.argv.slice(2)
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const n = +opt('n', '40'), vibe = opt('vibe', DEFAULT_VIBE)
const d = await deciderByName(opt('decider', 'jev'))
const recs: ChordRecord[] = []
for await (const ev of pianoLoop(d, { vibe, maxChords: n, sample: args.includes('--sample'), temperature: +opt('temp', '0.5'), noRepeat: !args.includes('--repeats-ok') })) {
  if (ev.type !== 'chord') continue
  recs.push(ev.rec)
  const top = (s: typeof ev.rec.steps[number]) => s.decision.probabilities ? Object.entries(s.decision.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => `${k} ${(p * 100).toFixed(0)}%`).join(', ') : `${s.decision.choice} (conf ${s.decision.confidence?.toFixed(2)})`
  console.log(`${String(ev.rec.n).padStart(3)} ${ev.rec.symbol.padEnd(12)} ${(ev.rec.transition ?? '').padEnd(24)} ${ev.rec.keyEstimate.padEnd(9)} bass ${ev.rec.voicing.bass} rh ${ev.rec.voicing.upper.join(' ')}   root[${top(ev.rec.steps[0])}] quality[${top(ev.rec.steps[1])}]`)
}
const stats = streamStats(recs)
console.log(JSON.stringify(stats))
mkdirSync('runs', { recursive: true })
appendFileSync('runs/piano.jsonl', JSON.stringify({ stamp: new Date().toISOString(), decider: d.name, model: d.model, vibe, sample: args.includes('--sample'), noRepeat: !args.includes('--repeats-ok'), chords: recs.map(r => r.symbol), stats }) + '\n')
