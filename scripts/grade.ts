// npx tsx scripts/grade.ts runs/<file>.json  — grade a saved run's final score (or an exercise id to grade the given notes)
import { readFileSync } from 'node:fs'
import { formatReport, grade } from '@core/grader/index.ts'
import { parseKey, parseScoreBlock, parseTime } from '@core/formats/csv.ts'
import { loadExercises } from '@core/exercises/node.ts'

const arg = process.argv[2]
const run = JSON.parse(readFileSync(arg, 'utf8'))
const ex = loadExercises().find(e => e.id === run.exercise)!
const score = parseScoreBlock(run.final, parseKey(ex.keyText), parseTime(ex.timeText))
console.log(run.final, '\n')
console.log(formatReport(grade(score)))
