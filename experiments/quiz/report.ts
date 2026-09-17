// npx tsx experiments/quiz/report.ts → _plan/quiz-results.md
import { readFileSync, writeFileSync } from 'node:fs'
import type { QuizRow } from '@experiments/quiz/run.ts'
const rows: QuizRow[] = readFileSync('runs/quiz.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
const deciders = [...new Set(rows.map(r => r.decider))]
const pct = (rs: QuizRow[]) => rs.length ? `${Math.round(100 * rs.filter(r => r.correct).length / rs.length)}%` : '–'
const chance = (rs: QuizRow[]) => rs.length ? `${Math.round(100 * rs.reduce((a, r) => a + 1 / r.nOptions, 0) / rs.length)}%` : '–'
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
let md = `# Theory quiz results\n\nGenerated ${new Date().toISOString()} from \`runs/quiz.jsonl\` (${rows.length} answers). Accuracy per decider; "chance" is the mean of 1/options.\n\n`
md += `## By tier\n\n| tier | n | chance | ${deciders.join(' | ')} |\n|---|---|---|${deciders.map(() => '---').join('|')}|\n`
for (const t of [1, 2, 3, 4, 5]) { const rs = rows.filter(r => r.tier === t); md += `| ${t} | ${rs.filter(r => r.decider === deciders[0]).length} | ${chance(rs)} | ${deciders.map(d => pct(rs.filter(r => r.decider === d))).join(' | ')} |\n` }
md += `| **all** | ${rows.filter(r => r.decider === deciders[0]).length} | ${chance(rows)} | ${deciders.map(d => pct(rows.filter(r => r.decider === d))).join(' | ')} |\n`
md += `\n## By question kind\n\n| tier | kind | chance | ${deciders.join(' | ')} | Jev mean p(correct) |\n|---|---|---|${deciders.map(() => '---').join('|')}|---|\n`
const kinds = [...new Set(rows.map(r => r.kind))].sort((a, b) => rows.find(r => r.kind === a)!.tier - rows.find(r => r.kind === b)!.tier)
for (const k of kinds) { const rs = rows.filter(r => r.kind === k); const jev = rs.filter(r => r.decider === 'jev' && r.pCorrect !== null); md += `| ${rs[0].tier} | ${k} | ${chance(rs)} | ${deciders.map(d => pct(rs.filter(r => r.decider === d))).join(' | ')} | ${jev.length ? mean(jev.map(r => r.pCorrect!)).toFixed(2) : '–'} |\n` }
md += `\n## Cost and latency\n\n| decider | model | answers | total $ | $/answer | mean ms |\n|---|---|---|---|---|---|\n`
for (const d of deciders) { const rs = rows.filter(r => r.decider === d); md += `| ${d} | ${rs[0].model} | ${rs.length} | ${rs.reduce((a, r) => a + r.costUsd, 0).toFixed(4)} | ${(rs.reduce((a, r) => a + r.costUsd, 0) / rs.length).toFixed(5)} | ${Math.round(mean(rs.map(r => r.ms)))} |\n` }
writeFileSync('_plan/quiz-results.md', md); console.log(md)
