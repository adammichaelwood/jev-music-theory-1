import { type Exercise, parseExercise } from './load.ts'

// Vite: bundle every exercise file as raw text (browser only; Node uses scripts/exercises.ts)
const files = import.meta.glob('../../exercises/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const EXERCISES: Exercise[] = Object.entries(files)
  .map(([path, md]) => parseExercise(path.split('/').pop()!.replace(/\.md$/, ''), md))
  .sort((a, b) => a.id.localeCompare(b.id))
