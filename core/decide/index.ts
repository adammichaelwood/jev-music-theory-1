import type { Decider } from '@core/decide/types.ts'
import { jevDecider } from '@core/decide/jev.ts'

/** deciders by name; Anthropic ones are registered lazily so the browser bundle never loads that SDK */
export async function deciderByName(name: string): Promise<Decider> {
  if (name === 'jev') return jevDecider()
  const { anthropicDecider, ANTHROPIC_MODELS } = await import('@core/decide/anthropic.ts')
  if (name in ANTHROPIC_MODELS) return anthropicDecider(name as keyof typeof ANTHROPIC_MODELS)
  if (name.endsWith('-think') && name.slice(0, -6) in ANTHROPIC_MODELS) return { ...anthropicDecider(name.slice(0, -6) as keyof typeof ANTHROPIC_MODELS, { effort: 'high', thinking: true }), name }
  throw new Error(`unknown decider ${name}`)
}
