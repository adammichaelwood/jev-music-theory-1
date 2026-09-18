// Does this request body look like one this app would send? Returns null if OK, else a reason.
// Only the app's own prompt shapes pass, so the site key can't be borrowed as a general TypeSafe relay.
import { MODELS, PIANO_TASK, TASK } from '@core/jev/task.ts'

const KEY_RES = [
  /^(SOPRANO|ALTO|TENOR|BASS|STOP)$/,
  /^MEASURE \d{1,2}$/,
  /^(BEAT|AND OF) \d{1,2}$/,
  /^[A-G](-SHARP|-FLAT|-DOUBLE-SHARP|-DOUBLE-FLAT|♯|♭)?(-[2-6])?$/, // pitch, merged pitch-octave, chord root or bass tone
  /^(maj7|6|6\/9|maj9|maj7#11|m7|m6|m9|mMaj7|7|9|13|7b9|7#11|7alt|7sus4|m7b5|dim7)$/, // chord qualities (piano)
  /^OCTAVE [2-6]$/,
  /^(WHOLE|DOTTED-HALF|HALF|DOTTED-QUARTER|QUARTER|EIGHTH|SIXTEENTH)$/,
]
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

export function checkShape(raw: string): string | null {
  if (raw.length > 60_000) return 'body too large'
  let body: unknown
  try { body = JSON.parse(raw) } catch { return 'not JSON' }
  if (!isObj(body)) return 'not an object'
  if (body.model !== undefined && !MODELS.includes(String(body.model))) return 'unexpected model'
  const st = body.state
  if (!isObj(st)) return 'state must be an object'
  if (typeof st.task !== 'string') return 'unexpected task'
  const piano = st.task === PIANO_TASK
  if (!piano && !st.task.startsWith(TASK)) return 'unexpected task'
  if (piano) {
    if (typeof st.vibe !== 'string' || st.vibe.length > 1_000) return 'unexpected vibe'
    if (!Array.isArray(st.played) || st.played.length > 64) return 'unexpected played'
  } else {
    if (st.score !== undefined && (typeof st.score !== 'string' || st.score.length > 8_000)) return 'unexpected score'
    if (!isObj(st.exercise) || typeof st.exercise.key !== 'string') return 'unexpected exercise'
  }
  const allowedState = new Set(piano ? ['task', 'vibe', 'played', 'chords_so_far', 'current'] : ['task', 'format_guide', 'theory_rules', 'exercise', 'score', 'score_window', 'context', 'situation', 'recent_moves', 'feedback', 'current_turn'])
  for (const k of Object.keys(st)) if (!allowedState.has(k)) return `unexpected state field ${k}`
  const qs = body.questions
  if (!isObj(qs)) return 'questions must be an object'
  const names = Object.keys(qs)
  if (names.length < 1 || names.length > 6) return 'unexpected question count'
  for (const n of names) {
    const q = qs[n]
    if (!isObj(q) || q.type !== 'choice') return 'only choice questions'
    if (typeof q.instructions !== 'string' || q.instructions.length > 800) return 'unexpected instructions'
    if (!isObj(q.criteria)) return 'criteria must be an object'
    const keys = Object.keys(q.criteria)
    if (keys.length < 1 || keys.length > 110) return 'unexpected option count'
    for (const k of keys) {
      if (!KEY_RES.some(re => re.test(k))) return `unexpected option ${k}`
      const d = q.criteria[k]
      if (d !== null && (typeof d !== 'string' || d.length > 200)) return 'unexpected option description'
    }
  }
  return null
}
