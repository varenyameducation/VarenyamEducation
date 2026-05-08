import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ok } from '@/lib/api/response'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { listQuerySchema, paginatedEnvelope } from '@/lib/api/questions'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    course_id: url.searchParams.get('course_id') ?? undefined,
    chapter_id: url.searchParams.get('chapter_id') ?? undefined,
    topic_id: url.searchParams.get('topic_id') ?? undefined,
    subject: url.searchParams.get('subject') ?? undefined,
    question_type: url.searchParams.get('question_type') ?? undefined,
    difficulty: url.searchParams.get('difficulty') ?? undefined,
    exam_type: url.searchParams.get('exam_type') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return ok(paginatedEnvelope({ items: [], page: 1, limit: 20, total: 0 }))
  }

  const { page, limit, search, ...filters } = parsed.data
  const where = {
    deleted_at: null,
    ...(filters.course_id ? { course_id: filters.course_id } : {}),
    ...(filters.chapter_id ? { chapter_id: filters.chapter_id } : {}),
    ...(filters.topic_id ? { topic_id: filters.topic_id } : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.question_type ? { question_type: filters.question_type } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.exam_type ? { exam_type: filters.exam_type } : {}),
    ...(search ? { question_body: { contains: search, mode: 'insensitive' as const } } : {}),
  }

  const [total, items] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return ok(paginatedEnvelope({ items, page, limit, total }))
}
