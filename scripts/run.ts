// Headless harness.
//   npx tsx scripts/run.ts [--ex 001,002] [--cond baseline,unicode] [--repeats 3] [--max 60] [--quiet]
// Writes runs/<stamp>-<ex>-<cond>-r<n>.json and appends a row to runs/index.jsonl.
import 'dotenv/config'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { formatReport, grade, type Report } from '../src/grader/index.ts'
import { makeClient } from '../src/jev/client.ts'
import { PRESETS, presetByName, type Condition } from '../src/jev/conditions.ts'
import { runLoop, type TurnRecord } from '../src/jev/turn.ts'
import { serializeScoreBlock } from '../src/score/format.ts'
import type { Score } from '../src/score/model.ts'
import { loadExercises } from './exercises.ts'
import type { Exercise } from '../src/exercises/load.ts'

const args = process.argv.slice(2)
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const quiet = args.includes('--quiet')
const exIds = opt('ex', '001').split(',')
const conds = opt('cond', 'baseline') === 'all' ? PRESETS : opt('cond', 'baseline').split(',').map(presetByName)
const repeats = +opt('repeats', '1')
const maxTurns = +opt('max', '60')

const all = loadExercises()
const exercises = exIds.map(id => all.find(e => e.id.startsWith(id))).filter((e): e is Exercise => !!e)
const client = makeClient()
mkdirSync('runs', { recursive: true })

export interface LedgerRow {
  stamp: string; file: string; exercise: string; condition: string; repeat: number
  turns: number; stopped: boolean; capped: boolean; tokens: number; costUsd: number; modelMs: number; wallMs: number
  complete: boolean; errors: number; warnings: number; counts: Record<string, number>
  chordRate: number // fraction of moments identified as a triad/7th chord
  meanPitchConf: number; meanStepConf: Record<string, number>
  revisions: number // turns that replaced an earlier Jev note
  chords: string[]
}

const top = (p: Record<string, number>) => Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')

async function one(ex: Exercise, cond: Condition, rep: number): Promise<LedgerRow> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const turns: TurnRecord[] = []
  let final: Score = ex.score, tokens = 0, modelMs = 0, stopped = false, capped = false
  const t0 = performance.now()
  if (!quiet) console.log(`\n# ${ex.id} · ${cond.name} · repeat ${rep}`)
  for await (const ev of runLoop(client, ex, ex.score, { condition: cond, maxTurns })) {
    if (ev.type === 'step') {
      tokens += ev.rec.inputTokens; modelMs += ev.rec.ms
      if (!quiet) console.log(`  ${ev.rec.step.padEnd(8)} → ${ev.rec.choice.padEnd(10)} conf ${ev.rec.confidence.toFixed(2)}  [${top(ev.rec.probabilities)}]  ${ev.rec.ms}ms`)
    } else if (ev.type === 'move') {
      turns.push(ev.rec); final = ev.score
      if (!quiet) console.log(`turn ${ev.rec.n}: ${ev.rec.steps.map(s => s.choice).join(' / ')}${ev.rec.removed?.length ? '  (replaced)' : ''}\n` + serializeScoreBlock(final, cond).replace(/^/gm, '    '))
    } else if (ev.type === 'stop') { turns.push(ev.rec); stopped = true; if (!quiet) console.log(`turn ${ev.rec.n}: STOP`) }
    else { capped = true; if (!quiet) console.log('hit max turns') }
  }
  const wallMs = Math.round(performance.now() - t0)
  const report: Report = grade(final)
  const steps = turns.flatMap(t => t.steps)
  const meanStepConf: Record<string, number> = {}
  for (const st of ['voice', 'measure', 'beat', 'pitch', 'octave', 'duration']) {
    const xs = steps.filter(s => s.step === st).map(s => s.confidence)
    meanStepConf[st] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
  }
  const file = `runs/${stamp}-${ex.id}-${cond.name}-r${rep}.json`
  const row: LedgerRow = {
    stamp, file, exercise: ex.id, condition: cond.name, repeat: rep,
    turns: turns.length, stopped, capped, tokens, costUsd: tokens * 0.042 / 1e6, modelMs, wallMs,
    complete: report.complete, errors: report.errors, warnings: report.warnings, counts: report.counts,
    chordRate: report.moments.length ? report.moments.filter(m => m.chord && m.chord.quality !== 'root only').length / report.moments.length : 0,
    meanPitchConf: meanStepConf.pitch, meanStepConf,
    revisions: turns.filter(t => t.removed?.length).length,
    chords: report.moments.map(m => m.chord?.numeral ?? '?'),
  }
  writeFileSync(file, JSON.stringify({ exercise: ex.id, condition: cond, repeat: rep, turns, final: serializeScoreBlock(final, cond), report, row }, null, 1))
  appendFileSync('runs/index.jsonl', JSON.stringify(row) + '\n')
  console.log(`${ex.id} · ${cond.name} · r${rep}: ${turns.length} turns${stopped ? ' STOP' : capped ? ' CAPPED' : ''} · ${report.errors} err / ${report.warnings} warn · chords ${(row.chordRate * 100).toFixed(0)}% · pitch conf ${row.meanPitchConf.toFixed(2)} · $${row.costUsd.toFixed(4)}`)
  if (!quiet) console.log(formatReport(report))
  return row
}

for (const ex of exercises) for (const cond of conds) for (let r = 1; r <= repeats; r++) await one(ex, cond, r)
