// Cloudflare Worker: forwards this app's requests to api.typesafe.ai.
//  - Bring-your-own-key: an Authorization header other than "Bearer proxy" is passed through untouched, no limits.
//  - Otherwise the site key (secret TYPESAFE_API_KEY) is used, subject to per-IP and global daily caps (Durable Object).
//  - Every request must come from an allowed Origin, carry the app header, and match the app's request shape.
import { DurableObject } from 'cloudflare:workers'
import { APP_HEADER } from '@core/jev/task.ts'
import { checkShape } from './shape.ts'

export interface Env {
  TYPESAFE_API_KEY: string
  LIMITER: DurableObjectNamespace<Limiter>
  ALLOWED_ORIGINS: string // comma-separated
  PER_IP_DAILY: string
  GLOBAL_DAILY: string
}
const UPSTREAM = 'https://api.typesafe.ai'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': `Authorization, Content-Type, ${APP_HEADER}, X-TypeSafe-SDK, X-TypeSafe-Runtime, X-TypeSafe-Retry-Count`,
      'Access-Control-Expose-Headers': 'x-jev-remaining, x-typesafe-request-id, retry-after',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin',
    }
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (!allowed.includes(origin)) return reply(403, { error: 'origin not allowed' })
    if (!req.headers.get(APP_HEADER)) return reply(403, { error: 'missing app header' })

    const url = new URL(req.url)
    if (!(url.pathname === '/v1/systemone' && req.method === 'POST') && !(url.pathname === '/v1/models' && req.method === 'GET'))
      return reply(404, { error: 'not found' })

    const auth = req.headers.get('Authorization') ?? ''
    const userKey = auth.startsWith('Bearer ') && auth !== 'Bearer proxy' ? auth : null
    let body = ''
    if (req.method === 'POST') {
      body = await req.text()
      const bad = checkShape(body)
      if (bad) return reply(400, { error: `request does not look like the Jev Chorale Lab app: ${bad}` })
    }
    let remaining = -1
    if (!userKey) {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
      const stub = env.LIMITER.getByName('global')
      const r = await stub.hit(ip, +env.PER_IP_DAILY, +env.GLOBAL_DAILY)
      if (!r.ok) return reply(429, { error: r.reason, remaining: 0 })
      remaining = r.remaining
    }
    const upstream = await fetch(UPSTREAM + url.pathname, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Authorization: userKey ?? `Bearer ${env.TYPESAFE_API_KEY}` },
      body: req.method === 'POST' ? body : undefined,
    })
    const headers = new Headers(cors)
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
    for (const h of ['retry-after', 'x-typesafe-request-id']) { const v = upstream.headers.get(h); if (v) headers.set(h, v) }
    if (!userKey) headers.set('x-jev-remaining', String(remaining))
    return new Response(upstream.body, { status: upstream.status, headers })
  },
} satisfies ExportedHandler<Env>

/** Daily request counters, per IP and global, reset by UTC day. One instance ("global") for the whole site. */
export class Limiter extends DurableObject {
  async hit(ip: string, perIp: number, global: number): Promise<{ ok: boolean; remaining: number; reason?: string }> {
    const day = new Date().toISOString().slice(0, 10)
    const gk = `g:${day}`, ik = `i:${day}:${ip}`
    const [g, i] = await Promise.all([this.ctx.storage.get<number>(gk), this.ctx.storage.get<number>(ik)])
    const gn = (g ?? 0) + 1, inn = (i ?? 0) + 1
    if (gn > global) return { ok: false, remaining: 0, reason: 'the demo has used its daily budget; try again tomorrow or use your own TypeSafe API key' }
    if (inn > perIp) return { ok: false, remaining: 0, reason: 'you have used today\'s demo allowance from this address; use your own TypeSafe API key to continue' }
    await this.ctx.storage.put({ [gk]: gn, [ik]: inn })
    if (Math.random() < 0.01) void this.sweep(day) // occasionally drop old days
    return { ok: true, remaining: Math.min(perIp - inn, global - gn) }
  }
  private async sweep(today: string) {
    const all = await this.ctx.storage.list<number>()
    const old = [...all.keys()].filter(k => !k.includes(today))
    if (old.length) await this.ctx.storage.delete(old)
  }
}
