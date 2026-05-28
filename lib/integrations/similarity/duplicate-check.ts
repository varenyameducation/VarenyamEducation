type PrismaLike = {
  question: {
    findMany: (args: {
      where?: Record<string, unknown>
      select?: Record<string, boolean>
      take?: number
    }) => Promise<Array<{ id: string; question_body: string }>>
  }
}

export type SimilarMatch = {
  id: string
  question_body: string
  similarity: number
}

// Optional taxonomy filter. With the M2M `question_taxonomies` table a
// question can be tagged against multiple courses, so duplicate-detection
// scope is "any candidate that shares at least one of these tags". Caller
// passes the course (or course+chapter) it cares about; we forward that to
// the `question_taxonomies.some` join.
export type FindSimilarOptions = {
  course_id?: string | null
  chapter_id?: string | null
}

// TODO: move to Postgres pg_trgm in a follow-up. JS scan is fine for the
// current question-bank volume but won't scale past ~50k questions.
const LATEX_COMMAND = /\\([a-zA-Z]+)\s*\{[^{}]*\}/g
const LATEX_INLINE_MATH = /\$+([^$]+)\$+/g
const LATEX_BACKSLASH = /\\[a-zA-Z]+/g
const NON_WORD = /[^a-z0-9 ]+/g
const COLLAPSE_WS = /\s+/g

export function normaliseForCompare(body: string): string {
  return body
    .toLowerCase()
    .replace(LATEX_COMMAND, ' $1 ')
    .replace(LATEX_INLINE_MATH, ' $1 ')
    .replace(LATEX_BACKSLASH, ' $1 '.replace('$1', ''))
    .replace(NON_WORD, ' ')
    .replace(COLLAPSE_WS, ' ')
    .trim()
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text}  `
  const grams = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3))
  }
  return grams
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const ga = trigrams(a)
  const gb = trigrams(b)
  if (ga.size === 0 || gb.size === 0) return 0
  let intersection = 0
  for (const g of ga) if (gb.has(g)) intersection++
  const union = ga.size + gb.size - intersection
  return union === 0 ? 0 : intersection / union
}

function buildWhere(options: FindSimilarOptions): Record<string, unknown> {
  const where: Record<string, unknown> = { deleted_at: null }
  if (options.course_id) {
    const some: Record<string, unknown> = { course_id: options.course_id }
    if (options.chapter_id) some.chapter_id = options.chapter_id
    where.question_taxonomies = { some }
  }
  return where
}

export async function findSimilar(
  prisma: PrismaLike,
  body: string,
  threshold = 0.9,
  options: FindSimilarOptions = {},
): Promise<SimilarMatch[]> {
  const target = normaliseForCompare(body)
  if (!target) return []

  const existing = await prisma.question.findMany({
    where: buildWhere(options),
    select: { id: true, question_body: true },
  })

  const matches: SimilarMatch[] = []
  for (const row of existing) {
    const candidate = normaliseForCompare(row.question_body)
    if (!candidate) continue
    const similarity = trigramSimilarity(target, candidate)
    if (similarity >= threshold) {
      matches.push({ id: row.id, question_body: row.question_body, similarity })
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  return matches
}

export type DuplicateChecker = (body: string) => SimilarMatch | null

// Pre-loads all candidate questions in the given taxonomy scope and returns
// a synchronous `check(body)` function that returns the single best match
// above `threshold`, or null. Use this in bulk-import paths where you'd
// otherwise call findSimilar() per parsed question — one DB round-trip
// instead of N. Also dedupes within the import itself, so two identical
// questions inside the same file don't both get inserted.
export async function createDuplicateChecker(
  prisma: PrismaLike,
  options: FindSimilarOptions = {},
  threshold = 0.9,
): Promise<DuplicateChecker> {
  const existing = await prisma.question.findMany({
    where: buildWhere(options),
    select: { id: true, question_body: true },
  })
  const candidates = existing
    .map((r) => ({
      id: r.id,
      question_body: r.question_body,
      normalized: normaliseForCompare(r.question_body),
    }))
    .filter((c) => c.normalized.length > 0)

  // Track normalised bodies we've already accepted during THIS import run so
  // two identical questions inside the same file collapse to one row.
  const seenThisRun: { id: string; question_body: string; normalized: string }[] = []

  return (body: string): SimilarMatch | null => {
    const target = normaliseForCompare(body)
    if (!target) return null

    let best: SimilarMatch | null = null
    for (const c of candidates) {
      const sim = trigramSimilarity(target, c.normalized)
      if (sim >= threshold && (!best || sim > best.similarity)) {
        best = { id: c.id, question_body: c.question_body, similarity: sim }
      }
    }
    if (best) return best

    for (const c of seenThisRun) {
      const sim = trigramSimilarity(target, c.normalized)
      if (sim >= threshold && (!best || sim > best.similarity)) {
        best = { id: c.id, question_body: c.question_body, similarity: sim }
      }
    }
    if (best) return best

    // First sighting — register so later imports in the same run dedupe
    // against it. The id is a sentinel marker; callers receive it only when
    // a later import matches it (and we want them to know it was an
    // in-run duplicate, so they can word the error differently).
    seenThisRun.push({
      id: '__in_run__',
      question_body: body,
      normalized: target,
    })
    return null
  }
}
