import { TypeSafeClient } from '@typesafe-ai/sdk'
import { APP_HEADER, APP_VERSION } from './task.ts'

export const MODEL = 'jev-1.13.0' // pinned (D12)
export const KEY_STORAGE = 'jev.apiKey'

/** the user's own TypeSafe key, if they entered one (browser only; stored in localStorage) */
export function userApiKey(): string | null {
  try { return localStorage.getItem(KEY_STORAGE) } catch { return null }
}
export function setUserApiKey(k: string | null) {
  try { k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE) } catch { /* private mode */ }
}

// Browser: baseURL is the deployed Worker (VITE_API_BASE) or the Vite dev proxy at /api. Either injects/forwards the key.
// "Bearer proxy" means "no user key — use the site's key (subject to the Worker's daily caps)".
// Node (harness/smoke): real key from env, direct to the API.
export function makeClient(opts: { baseURL?: string; apiKey?: string } = {}) {
  const inBrowser = typeof window !== 'undefined'
  const base = inBrowser ? (import.meta.env.VITE_API_BASE || `${window.location.origin}/api`) : undefined
  return new TypeSafeClient({
    apiKey: opts.apiKey ?? (inBrowser ? (userApiKey() || 'proxy') : undefined),
    baseURL: opts.baseURL ?? base,
    defaultModel: MODEL,
    dangerouslyAllowBrowser: inBrowser,
    defaultHeaders: { [APP_HEADER]: APP_VERSION },
    timeout: 30000,
    retry: { maxRetries: 8, backoffInitialMs: 1000, backoffMaxMs: 30000, httpStatuses: new Set([408, 500, 502, 503, 504, 529]) },
  })
}

/** human-readable error, surfacing the Worker's limit messages */
export function describeError(e: unknown): string {
  const b = (e as { body?: { error?: string; detail?: { message?: string } } })?.body
  return b?.error ?? b?.detail?.message ?? String(e)
}
