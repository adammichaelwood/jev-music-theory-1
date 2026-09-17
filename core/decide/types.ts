// A Decider answers one Choice-shaped question: given a state and named options, pick one.
export interface Decision {
  choice: string
  probabilities?: Record<string, number> // Jev gives a full distribution; LLMs at most a stated confidence
  confidence?: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  ms: number
  model: string
  raw?: unknown
}
export interface Decider {
  name: string // 'jev' | 'claude-haiku' | ...
  model: string
  decide(state: unknown, instructions: string, options: Record<string, string | null>, opts?: { signal?: AbortSignal }): Promise<Decision>
}
