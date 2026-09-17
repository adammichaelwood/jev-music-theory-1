// Claude as a Decider: the same Choice-shaped question Jev gets, answered with a constrained structured output.
// Per-step ("snap") mode runs at low effort so the comparison with a System One model is about knowledge, not deliberation.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Decider, Decision } from '@core/decide/types.ts'

export const ANTHROPIC_MODELS = {
  'claude-haiku': 'claude-haiku-4-5',
  'claude-sonnet': 'claude-sonnet-5',
  'claude-opus': 'claude-opus-5',
} as const
export type AnthropicName = keyof typeof ANTHROPIC_MODELS
// $/MTok input, output (Anthropic first-party rates, 2026-06)
export const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-sonnet-5': { in: 2, out: 10 }, 'claude-opus-5': { in: 5, out: 25 },
}
export function costOf(model: string, u: Anthropic.Usage) {
  const p = PRICE[model] ?? { in: 5, out: 25 }
  return (u.input_tokens * p.in + (u.cache_creation_input_tokens ?? 0) * p.in * 1.25 + (u.cache_read_input_tokens ?? 0) * p.in * 0.1 + u.output_tokens * p.out) / 1e6
}

let _client: Anthropic | undefined
export const anthropicClient = () => (_client ??= new Anthropic())

const SYSTEM = 'You are answering a multiple-choice question about a task described in the JSON state below. Pick exactly one of the listed options by its exact key. Answer with the structured output only.'

export function anthropicDecider(name: AnthropicName, opts: { effort?: 'low' | 'medium' | 'high'; thinking?: boolean } = {}): Decider {
  const model = ANTHROPIC_MODELS[name]
  const client = anthropicClient()
  return {
    name, model,
    async decide(state, instructions, options, o): Promise<Decision> {
      const keys = Object.keys(options) as [string, ...string[]]
      const schema = z.object({ choice: z.enum(keys), confidence: z.number().min(0).max(1).describe('your probability that this choice is correct') })
      const optionText = keys.map(k => options[k] ? `- ${k}: ${options[k]}` : `- ${k}`).join('\n')
      const user = `STATE:\n${JSON.stringify(state, null, 1)}\n\nQUESTION: ${instructions}\n\nOPTIONS (answer with the key exactly):\n${optionText}`
      const t0 = performance.now()
      const isHaiku = model.startsWith('claude-haiku')
      const res = await client.messages.parse({
        model, max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(schema), ...(isHaiku ? {} : { effort: opts.effort ?? 'low' }) },
        ...(isHaiku ? (opts.thinking ? { thinking: { type: 'enabled', budget_tokens: 1024 } } : {}) : (opts.thinking === false ? { thinking: { type: 'disabled' } } : {})),
      }, { signal: o?.signal })
      const out = res.parsed_output
      if (!out) throw new Error(`no structured output (stop_reason ${res.stop_reason})`)
      return {
        choice: out.choice, confidence: out.confidence,
        inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), outputTokens: res.usage.output_tokens,
        costUsd: costOf(model, res.usage), ms: Math.round(performance.now() - t0), model: res.model, raw: res.usage,
      }
    },
  }
}

/** Free-form generation (for one-shot experiments): returns text, usage and cost. Thinking on by default. */
export async function generate(name: AnthropicName, system: string, user: string, opts: { effort?: 'low' | 'medium' | 'high' | 'xhigh'; maxTokens?: number } = {}) {
  const model = ANTHROPIC_MODELS[name]
  const isHaiku = model.startsWith('claude-haiku')
  const t0 = performance.now()
  // streaming: thinking can run long, and the SDK wants streaming for large max_tokens
  const res = await anthropicClient().messages.stream({
    model, max_tokens: opts.maxTokens ?? 32000, system, messages: [{ role: 'user', content: user }],
    ...(isHaiku ? { thinking: { type: 'enabled', budget_tokens: 8000 } } : { thinking: { type: 'adaptive' }, output_config: { effort: opts.effort ?? 'medium' } }),
  }).finalMessage()
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n')
  return { text, model: res.model, stop: res.stop_reason, usage: res.usage, costUsd: costOf(model, res.usage), ms: Math.round(performance.now() - t0) }
}
