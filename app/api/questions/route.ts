import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { logAudit } from '@/lib/auth/audit'
import { startTimer } from '@/lib/api/timing'
import {
  createQuestionSchema,
  getClientIp,
  listQuerySchema,
  paginatedEnvelope,
  taxonomyRowSelect,
  withTaxonomies,
  type TaxonomyTag,
} from '@/lib/api/questions'

export async function GET(request: NextRequest) {
  const t = startTimer()
  const auth = await requireAuth()
  t.mark('auth')
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    course_id: url.searchParams.get('course_id') ?? undefined,
    subject_id: url.searchParams.get('subject_id') ?? undefined,
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

  // Taxonomy filters (course/subject/chapter/topic/exam_type) are AND-ed
  // together into a single junction row via question_taxonomies.some(...).
  const taxonomyAnd: Prisma.QuestionTaxonomyWhereInput = {
    ...(filters.course_id ? { course_id: filters.course_id } : {}),
    ...(filters.subject_id ? { subject_id: filters.subject_id } : {}),
    ...(filters.chapter_id ? { chapter_id: filters.chapter_id } : {}),
    ...(filters.topic_id ? { topic_id: filters.topic_id } : {}),
    ...(filters.exam_type ? { exam_type: filters.exam_type } : {}),
  }
  const hasTaxonomyFilter = Object.keys(taxonomyAnd).length > 0

  const where: Prisma.QuestionWhereInput = {
    deleted_at: null,
    ...(hasTaxonomyFilter ? { question_taxonomies: { some: taxonomyAnd } } : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.question_type ? { question_type: filters.question_type } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(search ? { question_body: { contains: search, mode: 'insensitive' as const } } : {}),
  }

  const [total, rows] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        question_taxonomies: { select: taxonomyRowSelect },
      },
    }),
  ])
  t.mark('prisma')

  const items = rows.map(withTaxonomies)
  t.mark('serialize')

  t.flush('/api/questions GET')
  return ok(paginatedEnvelope({ items, page, limit, total }))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createQuestionSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data
  const taxonomies = input.taxonomies as TaxonomyTag[]

  const data: Prisma.QuestionUncheckedCreateInput = {
    subject: input.subject,
    question_type: input.question_type,
    difficulty: input.difficulty,
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

  const result = await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({ data })
    if (taxonomies.length > 0) {
      await tx.questionTaxonomy.createMany({
        data: taxonomies.map((t) => ({
          question_id: question.id,
          course_id: t.course_id,
          subject_id: t.subject_id,
          chapter_id: t.chapter_id,
          topic_id: t.topic_id,
          exam_type: t.exam_type,
        })),
        skipDuplicates: true,
      })
    }
    const withTax = await tx.question.findUnique({
      where: { id: question.id },
      include: { question_taxonomies: { select: taxonomyRowSelect } },
    })
    return withTax!
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'question.create',
    entity_type: 'question',
    entity_id: result.id,
    meta: {
      actor_role: auth.payload.role,
      question_type: result.question_type,
      subject: result.subject,
      difficulty: result.difficulty,
      taxonomy_count: result.question_taxonomies.length,
    },
    ip_address: getClientIp(request),
  })

  return ok(withTaxonomies(result), { status: 201 })
}
