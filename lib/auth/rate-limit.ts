// In-memory sliding-window rate limiter.
// NOTE: per-instance only — Vercel multi-instance deployments share no state.
// For a coaching-institute scale (low concurrent traffic, 1–2 warm instances)
// this is sufficient. Upgrade to Upstash Redis for high-traffic production.

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

type Entry = { count: number; resetAt: number }
const store = new Map<string, Entry>()

// Purge expired entries periodically so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, WINDOW_MS)

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSecs: number } {
  const now = Date.now()
  let entry = store.get(ip)

  if (!entry || entry.resetAt < now) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSecs: 0 }
  }

  entry.count += 1
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) }
  }

  return { allowed: true, retryAfterSecs: 0 }
}
