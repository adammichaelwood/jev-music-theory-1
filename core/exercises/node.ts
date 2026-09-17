// Node-side exercise loader for the harness / smoke scripts.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Exercise, parseExercise } from '@core/exercises/load.ts'

export function loadExercises(dir = join(import.meta.dirname, '..', '..', 'exercises')): Exercise[] {
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    .map(f => parseExercise(f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')))
}
