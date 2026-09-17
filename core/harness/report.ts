// npx tsx scripts/report.ts  — regenerate _plan/results.md from runs/index.jsonl
import { readFileSync, writeFileSync } from 'node:fs'
import type { LedgerRow } from '@experiments/lab/run.ts'

const rows: LedgerRow[] = readFileSync('runs/index.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }
const f = (x: number, d = 1) => Number.isNaN(x) ? '–' : x.toFixed(d)

const groups = new Map<string, LedgerRow[]>()
for (const r of rows) { const k = `${r.exercise}|${r.condition}|${r.decider ?? 'jev'}`; groups.set(k, [...(groups.get(k) ?? []), r]) }

let md = `# Results\n\nRegenerated ${new Date().toISOString()} from \`runs/index.jsonl\` (${rows.length} runs). Errors/warnings are grader counts on the final score; ± is one standard deviation across repeats.\n\n`
md += '| exercise | condition | decider | n | stopped | turns | errors | warnings | chord rate | pitch conf | revisions | err@complete | $/run |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n'
for (const [k, rs] of [...groups.entries()].sort()) {
  const [ex, cond, dec] = k.split('|')
  md += `| ${ex} | ${cond} | ${dec} | ${rs.length} | ${rs.filter(r => r.stopped).length}/${rs.length}${rs.some(r => r.stalled) ? ` (${rs.filter(r => r.stalled).length} stalled)` : ''} | ${f(mean(rs.map(r => r.turns)))} | ${f(mean(rs.map(r => r.errors)))} ± ${f(sd(rs.map(r => r.errors)))} | ${f(mean(rs.map(r => r.warnings)))} ± ${f(sd(rs.map(r => r.warnings)))} | ${f(100 * mean(rs.map(r => r.chordRate)), 0)}% | ${f(mean(rs.map(r => r.meanPitchConf)), 2)} | ${f(mean(rs.map(r => r.revisions)))} | ${f(mean(rs.filter(r => r.errorsAtFirstComplete !== null).map(r => r.errorsAtFirstComplete!)))} | ${f(mean(rs.map(r => r.costUsd)), 4)} |\n`
}
// error kinds across everything, by condition
const kinds = [...new Set(rows.flatMap(r => Object.keys(r.counts)))].sort()
const conds = [...new Set(rows.map(r => r.condition))]
md += `\n## Issue kinds per run, by condition (all exercises)\n\n| kind | ${conds.join(' | ')} |\n|---|${conds.map(() => '---').join('|')}|\n`
for (const k of kinds) md += `| ${k} | ${conds.map(c => f(mean(rows.filter(r => r.condition === c).map(r => r.counts[k] ?? 0)))).join(' | ')} |\n`
md += `\n## Mean confidence per step, by condition\n\n| step | ${conds.join(' | ')} |\n|---|${conds.map(() => '---').join('|')}|\n`
for (const st of ['voice', 'measure', 'beat', 'pitch', 'octave', 'duration']) md += `| ${st} | ${conds.map(c => f(mean(rows.filter(r => r.condition === c).map(r => r.meanStepConf[st])), 2)).join(' | ')} |\n`
writeFileSync('_plan/results.md', md)
console.log(md)
