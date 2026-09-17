import { load as yamlLoad } from 'js-yaml'
import { parseKey, parseScoreBlock, parseTime } from '@core/formats/csv.ts'
import type { Score } from '@core/score/model.ts'

export interface Exercise {
  id: string
  title: string
  type: string
  difficulty: number
  keyText: string
  timeText: string
  instructions: string
  scoreText: string
  score: Score
}

export function parseExercise(id: string, md: string): Exercise {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (!fm) throw new Error(`${id}: missing front matter`)
  const meta = yamlLoad(fm[1]) as Record<string, unknown>
  const body = md.slice(fm[0].length)
  const sb = /```score\n([\s\S]*?)```/.exec(body)
  if (!sb) throw new Error(`${id}: missing score block`)
  const instructions = body.replace(sb[0], '').trim()
  const keyText = String(meta.key), timeText = String(meta.time)
  const score = parseScoreBlock(sb[1], parseKey(keyText), parseTime(timeText))
  return {
    id, title: String(meta.title ?? id), type: String(meta.type ?? 'free'),
    difficulty: Number(meta.difficulty ?? 1), keyText, timeText, instructions, scoreText: sb[1].trim(), score,
  }
}

