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

export async function findSimilar(
  prisma: PrismaLike,
  body: string,
  threshold = 0.9,
): Promise<SimilarMatch[]> {
  const target = normaliseForCompare(body)
  if (!target) return []

  const existing = await prisma.question.findMany({
    where: { deleted_at: null },
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
