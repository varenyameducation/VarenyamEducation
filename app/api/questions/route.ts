import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { logAudit } from '@/lib/auth/audit'
import {
  createQuestionSchema,
  getClientIp,
  listQuerySchema,
  paginatedEnvelope,
} from '@/lib/api/questions'

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
    const issue = parsed.error.issues[0]
    return err(400, {
      code: 'INVALID_QUERY',
      message: `${issue.path.join('.') || '(query)'}: ${issue.message}`,
    })
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
      include: {
        course: { select: { id: true, name: true } },
        chapter: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
      },
    }),
  ])

  return ok(paginatedEnvelope({ items, page, limit, total }))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createQuestionSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data

  const data: Prisma.QuestionUncheckedCreateInput = {
    course_id: input.course_id ?? null,
    chapter_id: input.chapter_id ?? null,
    topic_id: input.topic_id ?? null,
    subject: input.subject,
    question_type: input.question_type,
    difficulty: input.difficulty,
    exam_type: input.exam_type,
    question_body: input.question_body,
    created_by: auth.user.id,
    correct_option: [],
    image_urls: input.image_urls ?? [],
    tags: input.tags ?? [],
    ...(input.marks_correct !== undefined ? { marks_correct: input.marks_correct } : {}),
    ...(input.marks_negative !== undefined ? { marks_negative: input.marks_negative } : {}),
    ...(input.marks_partial !== undefined && input.marks_partial !== null
      ? { marks_partial: input.marks_partial }
      : {}),
    ...(input.solution !== undefined && input.solution !== null ? { solution: input.solution } : {}),
    ...(input.explanation !== undefined && input.explanation !== null
      ? { explanation: input.explanation }
      : {}),
    ...(input.hint !== undefined && input.hint !== null ? { hint: input.hint } : {}),
  }

  if (input.question_type === 'mcq' || input.question_type === 'multi_select') {
    data.option_a = input.option_a
    data.option_b = input.option_b
    data.option_c = input.option_c
    data.option_d = input.option_d
    data.correct_option = input.correct_option
  } else if (input.question_type === 'numerical') {
    data.numerical_answer = input.numerical_answer
  } else if (input.question_type === 'matrix_match') {
    data.matrix_left = input.matrix_left as Prisma.InputJsonValue
    data.matrix_right = input.matrix_right as Prisma.InputJsonValue
    data.matrix_answer = input.matrix_answer as Prisma.InputJsonValue
  }

  const question = await prisma.question.create({ data })

  await logAudit({
    user_id: auth.user.id,
    action: 'question.create',
    entity_type: 'question',
    entity_id: question.id,
    meta: {
      actor_role: auth.payload.role,
      question_type: question.question_type,
      subject: question.subject,
      difficulty: question.difficulty,
      exam_type: question.exam_type,
    },
    ip_address: getClientIp(request),
  })

  return ok(question, { status: 201 })
}
