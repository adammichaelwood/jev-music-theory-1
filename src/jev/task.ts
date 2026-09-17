// Dependency-free constants shared by the app and the Cloudflare Worker (worker/shape.ts validates against them).
export const TASK = 'You are completing an undergraduate music-theory exercise in four-part (SATB) common-practice harmony. You edit the score one note at a time using a controller: choose a voice, a measure, a beat, a pitch, an octave and a duration. The note you write replaces anything you previously wrote at that place in that voice. Notes given by the exercise cannot be changed. The score already contains everything decided so far.'
export const TASK_FEEDBACK = ' `feedback` lists the problems a grader currently finds in `score`; fix them.'
export const TASK_HISTORY = ' `recent_moves` lists the notes you wrote most recently, oldest first.'
export const APP_HEADER = 'x-jev-lab' // sent by the app; the Worker requires it
export const APP_VERSION = '1'
export const MODELS = ['jev-1.13.0', 'jev-latest']
