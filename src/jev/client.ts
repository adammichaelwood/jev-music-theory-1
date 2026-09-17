import { TypeSafeClient } from '@typesafe-ai/sdk'

export const MODEL = 'jev-1.13.0' // pinned (D12)

// Browser: relative baseURL → Vite proxy (or a deployed Worker) injects the key.
// Node (harness/smoke): real key from env.
export function makeClient(opts: { baseURL?: string; apiKey?: string } = {}) {
  const inBrowser = typeof window !== 'undefined'
  return new TypeSafeClient({
    apiKey: opts.apiKey ?? (inBrowser ? 'proxy' : undefined),
    baseURL: opts.baseURL ?? (inBrowser ? `${window.location.origin}/api` : undefined),
    defaultModel: MODEL,
    dangerouslyAllowBrowser: inBrowser,
    timeout: 30000,
  })
}
