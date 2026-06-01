// Tiny request-timing utility for diagnosing slow API routes. Designed
// to be sprinkled into hot-path handlers without changing their shape:
//
//   const t = startTimer()
//   const auth = await requireAuth(); t.mark('auth')
//   const rows = await prisma.foo.findMany(...); t.mark('prisma')
//   const meta = await someExternalCall(); t.mark('external')
//   t.flush('/api/foo')
//   return ok(rows)
//
// Output (visible in Vercel function logs, filterable by grepping
// `[TIMING:`):
//
//   [TIMING:/api/foo] total=1240ms auth=12ms prisma=850ms external=180ms
//
// Phases that aren't marked still show up via `total - sum(marks)` —
// nothing slow can hide. Overhead per call is <1ms and the only side
// effect is console.error output, so leaving these in production while
// we profile is safe.

export class Timer {
  private start: number
  private last: number
  private marks: Array<[string, number]> = []

  constructor() {
    this.start = performance.now()
    this.last = this.start
  }

  /** Record time elapsed since the previous mark (or start). */
  mark(name: string) {
    const now = performance.now()
    this.marks.push([name, now - this.last])
    this.last = now
  }

  /** Emit the timing line to console.error and return total elapsed ms. */
  flush(label: string): number {
    const total = performance.now() - this.start
    const detail = this.marks
      .map(([n, t]) => `${n}=${t.toFixed(0)}ms`)
      .join(' ')
    console.error(`[TIMING:${label}] total=${total.toFixed(0)}ms ${detail}`)
    return total
  }
}

export function startTimer(): Timer {
  return new Timer()
}
