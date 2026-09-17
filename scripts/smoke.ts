// npx tsx scripts/smoke.ts  — one Choice question, direct to the API via SDK.
import 'dotenv/config'
import { choice } from '@typesafe-ai/sdk'
import { makeClient } from '../src/jev/client.ts'

const client = makeClient()
const t0 = performance.now()
const r = await client.systemOne({
  state: { key: 'A minor', description: 'the leading tone of `key`' },
  questions: {
    pitch: choice('Which pitch is `description`?', {
      'G': null, 'G-SHARP': null, 'A-FLAT': null, 'A': null, 'B': null, 'C': null,
    }),
  },
})
console.log(r.model, `${Math.round(performance.now() - t0)}ms`, r.usage)
console.log(r.answers.pitch.choice, r.answers.pitch.probabilities)
