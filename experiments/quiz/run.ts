// Theory quiz: npx tsx experiments/quiz/run.ts [--decider jev,claude-haiku] [--seed 1] [--per 6] [--kinds a,b] [--jobs 4]
// Appends one row per (decider, question) to runs/quiz.jsonl; experiments/quiz/report.ts summarizes.
import 'dotenv/config'
import { appendFileSync, mkdirSync } from 'node:fs'
import { deciderByName } from '@core/decide/index.ts'
import { generate, KINDS, type Question } from '@core/quiz/generate.ts'

const args = process.argv.slice(2)
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const deciders = opt('decider', 'jev').split(',')
const seed = +opt('seed', '1'), per = +opt('per', '6'), jobs = +opt('jobs', '4')
const kinds = opt('kinds', '') ? opt('kinds', '').split(',') : KINDS
const questions = generate(seed, per, kinds)
mkdirSync('runs', { recursive: true })

export interface QuizRow {
  decider: string; model: string; seed: number; id: string; kind: string; tier: number
  correct: boolean; choice: string; answer: string; pCorrect: number | null; confidence: number | null; nOptions: number
  inputTokens: number; outputTokens: number; costUsd: number; ms: number
}

for (const dname of deciders) {
  const d = await deciderByName(dname)
  const queue = [...questions]
  const rows: QuizRow[] = []
  await Promise.all(Array.from({ length: jobs }, async () => {
    for (;;) {
      const q = queue.shift(); if (!q) return
      try {
        const r = await d.decide(q.state, q.instructions, q.options)
        const row: QuizRow = { decider: d.name, model: r.model, seed, id: q.id, kind: q.kind, tier: q.tier, correct: r.choice === q.answer, choice: r.choice, answer: q.answer,
          pCorrect: r.probabilities ? (r.probabilities[q.answer] ?? 0) : null, confidence: r.confidence ?? null, nOptions: Object.keys(q.options).length,
          inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, ms: r.ms }
        rows.push(row); appendFileSync('runs/quiz.jsonl', JSON.stringify(row) + '\n')
      } catch (e) { console.error(`FAILED ${dname} ${q.id}: ${e}`) }
    }
  }))
  const acc = rows.filter(r => r.correct).length / rows.length
  const byTier = [1, 2, 3, 4, 5].map(t => { const rs = rows.filter(r => r.tier === t); return `T${t} ${rs.length ? Math.round(100 * rs.filter(r => r.correct).length / rs.length) : '-'}%` }).join(' · ')
  console.log(`${dname} (${d.model}): ${rows.length} questions · accuracy ${(100 * acc).toFixed(0)}% · ${byTier} · $${rows.reduce((a, r) => a + r.costUsd, 0).toFixed(4)}`)
}
