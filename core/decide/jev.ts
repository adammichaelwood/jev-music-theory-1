import { choice, type TypeSafeClient } from '@typesafe-ai/sdk'
import { MODEL, makeClient } from '@core/jev/client.ts'
import type { Decider, Decision } from '@core/decide/types.ts'

export const JEV_USD_PER_MTOK = 0.042 // input; output is free

export function jevDecider(client: TypeSafeClient = makeClient()): Decider {
  return {
    name: 'jev', model: MODEL,
    async decide(state, instructions, options, o): Promise<Decision> {
      const t0 = performance.now()
      const res = await client.systemOne({ state: state as never, questions: { pick: choice(instructions, options) } }, { signal: o?.signal })
      const a = res.answers.pick
      return {
        choice: a.choice, probabilities: a.probabilities as Record<string, number>, confidence: a.confidence,
        inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: res.usage.input_tokens * JEV_USD_PER_MTOK / 1e6,
        ms: Math.round(performance.now() - t0), model: res.model,
      }
    },
  }
}
