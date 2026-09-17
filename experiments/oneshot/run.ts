// One-shot: a Claude model writes the whole completed score in one reply; we parse and grade it.
//   npx tsx experiments/oneshot/run.ts [--ex 001,002] [--model claude-haiku,claude-sonnet,claude-opus] [--format csv,lilypond] [--repeats 2] [--effort high]
import 'dotenv/config'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { generate, type AnthropicName } from '@core/decide/anthropic.ts'
import { loadExercises } from '@core/exercises/node.ts'
import { FORMATS, type FormatName } from '@core/formats/index.ts'
import { serializeScoreBlock } from '@core/formats/csv.ts'
import { grade } from '@core/grader/index.ts'
import { BASELINE } from '@core/loop/conditions.ts'
import { TASK } from '@core/jev/task.ts'
import { VOICES, lockKey, midi } from '@core/score/model.ts'

const args = process.argv.slice(2)
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const exIds = opt('ex', '001,002,003,012').split(',')
const models = opt('model', 'claude-haiku,claude-sonnet,claude-opus').split(',') as AnthropicName[]
const formats = opt('format', 'csv,lilypond').split(',') as FormatName[]
const repeats = +opt('repeats', '1')
const effort = opt('effort', 'medium') as 'low' | 'medium' | 'high' | 'xhigh'
const exercises = loadExercises().filter(e => exIds.some(id => e.id.startsWith(id)))
mkdirSync('runs/oneshot', { recursive: true })

export interface OneshotRow {
  stamp: string; model: string; modelName: string; exercise: string; format: string; repeat: number; effort: string
  parsed: boolean; complete: boolean; givenChanged: number; errors: number; warnings: number; chordRate: number; counts: Record<string, number>
  inputTokens: number; outputTokens: number; costUsd: number; ms: number; stop: string | null; file: string
}

for (const ex of exercises) for (const fmt of formats) for (const m of models) for (let r = 1; r <= repeats; r++) {
  const F = FORMATS[fmt]
  const system = `${TASK.replace(/You edit the score one note at a time[^.]*\./, 'You write the complete score in one reply.')} Keep every note the exercise gives exactly as it is. Fill every undecided position so that all four voices are complete. Reply with the completed score only, in the same ${fmt.toUpperCase()} format as the input, inside a \`\`\`score fence, and nothing else.`
  const user = `FORMAT:\n${F.guide(BASELINE, 'full')}\n\nEXERCISE: ${ex.title}\nKEY: ${ex.keyText}\nTIME SIGNATURE: ${ex.timeText}\nINSTRUCTIONS: ${ex.instructions}\n\nSCORE:\n${F.serialize(ex.score, BASELINE)}`
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let g
  try { g = await generate(m, system, user, { effort }) } catch (e) { console.error(`FAILED ${ex.id} ${fmt} ${m}: ${e}`); continue }
  const fence = /```(?:score|lilypond|csv|abc)?\n([\s\S]*?)```/.exec(g.text)
  const body = (fence ? fence[1] : g.text).trim()
  let row: OneshotRow
  const file = `runs/oneshot/${stamp}-${ex.id}-${fmt}-${m}-r${r}.json`
  try {
    const score = F.parse!(body, ex.score.key, ex.score.time)
    if (score.nMeasures !== ex.score.nMeasures) throw new Error(`wrong bar count ${score.nMeasures}`)
    // given notes: restore them so the grader sees the exercise as posed; count how many the model altered
    let givenChanged = 0
    for (const v of VOICES) ex.score.voices[v].forEach((notes, mi) => notes.forEach(n => {
      const got = score.voices[v][mi].find(x => x.onset === n.onset)
      if (!got || midi(got) !== midi(n) || got.dur !== n.dur) givenChanged++
      score.locked.add(lockKey(v, mi, n.onset))
    }))
    const rep = grade(score)
    row = { stamp, model: g.model, modelName: m, exercise: ex.id, format: fmt, repeat: r, effort, parsed: true, complete: rep.complete, givenChanged, errors: rep.errors, warnings: rep.warnings,
      chordRate: rep.moments.length ? rep.moments.filter(x => x.chord && x.chord.quality !== 'root only').length / rep.moments.length : 0, counts: rep.counts,
      inputTokens: g.usage.input_tokens, outputTokens: g.usage.output_tokens, costUsd: g.costUsd, ms: g.ms, stop: g.stop, file }
    writeFileSync(file, JSON.stringify({ row, text: g.text, final: serializeScoreBlock(score), report: rep }, null, 1))
  } catch (e) {
    row = { stamp, model: g.model, modelName: m, exercise: ex.id, format: fmt, repeat: r, effort, parsed: false, complete: false, givenChanged: 0, errors: NaN, warnings: NaN, chordRate: 0, counts: {},
      inputTokens: g.usage.input_tokens, outputTokens: g.usage.output_tokens, costUsd: g.costUsd, ms: g.ms, stop: g.stop, file }
    writeFileSync(file, JSON.stringify({ row, text: g.text, parseError: String(e) }, null, 1))
  }
  appendFileSync('runs/oneshot.jsonl', JSON.stringify(row) + '\n')
  console.log(`${ex.id} · ${fmt} · ${m} · r${r}: ${row.parsed ? `${row.complete ? 'complete' : 'INCOMPLETE'} · ${row.errors} err / ${row.warnings} warn · chords ${Math.round(100 * row.chordRate)}% · given changed ${row.givenChanged}` : 'PARSE FAILED'} · ${g.usage.output_tokens} out tok · $${g.costUsd.toFixed(4)} · ${(g.ms / 1000).toFixed(1)}s`)
}
