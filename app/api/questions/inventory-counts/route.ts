import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import {
  DIFFICULTY_VALUES,
  inventoryCountsQuerySchema,
} from '@/lib/api/tests'

// Read repeated `chapter_ids` / `topic_ids` query params into a string[].
function readArrayParam(url: URL, name: string): string[] | undefined {
  const values = url.searchParams.getAll(name)
  if (values.length === 0) return undefined
  // Allow comma-separated single value as well: ?chapter_ids=a,b,c
  return values.flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const parsed = inventoryCountsQuerySchema.safeParse({
    course_id: url.searchParams.get('course_id') ?? undefined,
    exam_type: url.searchParams.get('exam_type') ?? undefined,
    subject: url.searchParams.get('subject') ?? undefined,
    chapter_ids: readArrayParam(url, 'chapter_ids'),
    topic_ids: readArrayParam(url, 'topic_ids'),
    question_type: url.searchParams.get('question_type') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return err(400, {
      code: 'INVALID_QUERY',
      message: `${issue.path.join('.') || '(query)'}: ${issue.message}`,
    })
  }

  const q = parsed.data

  const taxonomyAnd: Prisma.QuestionTaxonomyWhereInput = {
    course_id: q.course_id,
    exam_type: q.exam_type,
    ...(q.chapter_ids && q.chapter_ids.length > 0
      ? { chapter_id: { in: q.chapter_ids } }
      : {}),
    ...(q.topic_ids && q.topic_ids.length > 0 ? { topic_id: { in: q.topic_ids } } : {}),
  }

  const where: Prisma.QuestionWhereInput = {
    deleted_at: null,
    subject: q.subject,
    ...(q.question_type ? { question_type: q.question_type } : {}),
    question_taxonomies: { some: taxonomyAnd },
  }

  const grouped = await prisma.question.groupBy({
    by: ['difficulty'],
    where,
    _count: { _all: true },
  })

  const counts: Record<(typeof DIFFICULTY_VALUES)[number], number> & { total: number } = {
    easy: 0,
    medium: 0,
    hard: 0,
    advanced: 0,
    total: 0,
  }
  for (const row of grouped) {
    const d = row.difficulty as (typeof DIFFICULTY_VALUES)[number]
    if (d in counts) {
      counts[d] = row._count._all
      counts.total += row._count._all
    }
  }

  return ok({ counts })
}
