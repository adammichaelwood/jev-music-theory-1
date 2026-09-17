// Headless harness: npx tsx scripts/run.ts [exerciseId] [--unicode] [--align] [--max N]
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { makeClient } from '../src/jev/client.ts'
import { runLoop, type TurnRecord } from '../src/jev/turn.ts'
import { serializeScoreBlock, type FormatVariant } from '../src/score/format.ts'
import { loadExercises } from './exercises.ts'

const args = process.argv.slice(2)
const id = args.find(a => !a.startsWith('--')) ?? '001'
const variant: FormatVariant = { accidentals: args.includes('--unicode') ? 'unicode' : 'words', align: args.includes('--align') }
const maxTurns = +(args[args.indexOf('--max') + 1] || 40)

const ex = loadExercises().find(e => e.id.startsWith(id))!
console.log(`# ${ex.title}  [${variant.accidentals}${variant.align ? ', aligned' : ''}] max ${maxTurns}`)
console.log(serializeScoreBlock(ex.score, variant), '\n')

const client = makeClient()
const turns: TurnRecord[] = []
let final = ex.score
let tokens = 0, ms = 0
const top = (p: Record<string, number>) => Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')

for await (const ev of runLoop(client, ex, ex.score, { variant, maxTurns })) {
  if (ev.type === 'step') {
    tokens += ev.rec.inputTokens; ms += ev.rec.ms
    console.log(`  ${ev.rec.step.padEnd(8)} → ${ev.rec.choice.padEnd(10)} conf ${ev.rec.confidence.toFixed(2)}  [${top(ev.rec.probabilities)}]  ${ev.rec.ms}ms`)
  } else if (ev.type === 'move') {
    turns.push(ev.rec); final = ev.score
    console.log(`turn ${ev.rec.n}: ${Object.values(ev.rec.steps.map(s => s.choice)).join(' / ')}${ev.rec.removed?.length ? `  (replaced ${ev.rec.removed.length})` : ''}`)
    console.log(serializeScoreBlock(final, variant).split('\n').map(l => '    ' + l).join('\n'))
  } else if (ev.type === 'stop') { turns.push(ev.rec); console.log(`turn ${ev.rec.n}: STOP`) }
  else console.log('hit max turns')
}
console.log(`\n${turns.length} turns, ${tokens} input tokens (~$${(tokens * 0.042 / 1e6).toFixed(4)}), ${(ms / 1000).toFixed(1)}s of model time`)
mkdirSync('runs', { recursive: true })
const out = `runs/${new Date().toISOString().replace(/[:.]/g, '-')}-${ex.id}.json`
writeFileSync(out, JSON.stringify({ exercise: ex.id, variant, turns, final: serializeScoreBlock(final, variant) }, null, 1))
console.log('saved', out)
