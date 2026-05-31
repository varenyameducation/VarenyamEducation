import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import {
  getClientIp,
  taxonomyRowSelect,
  updateQuestionSchema,
  withTaxonomies,
  type TaxonomyTag,
} from '@/lib/api/questions'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

// Treat two tags as the same row when course/subject/chapter/topic/exam_type
// all match. The Subject-tier migration added subject_id to the unique index;
// the diff key must include it or PATCH will delete-and-reinsert otherwise-
// identical rows that differ only on subject_id.
function tagKey(t: {
  course_id: string
  subject_id: string | null
  chapter_id: string | null
  topic_id: string | null
  exam_type: string
}) {
  return [
    t.course_id,
    t.subject_id ?? '_',
    t.chapter_id ?? '_',
    t.topic_id ?? '_',
    t.exam_type,
  ].join('|')
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }

  const question = await prisma.question.findFirst({
    where: { id: params.id, deleted_at: null },
    include: { question_taxonomies: { select: taxonomyRowSelect } },
  })
  if (!question) {
    return err(404, { code: 'QUESTION_NOT_FOUND', message: 'Question not found' })
  }
  return ok(withTaxonomies(question))
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return PUT(request, { params })
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }

  const existing = await prisma.question.findFirst({
    where: { id: params.id, deleted_at: null },
    include: { question_taxonomies: { select: taxonomyRowSelect } },
  })
  if (!existing) {
    return err(404, { code: 'QUESTION_NOT_FOUND', message: 'Question not found' })
  }

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  const isCreator = existing.created_by === auth.user.id
  if (!isAdmin && !isCreator) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the creator or an admin can edit this question',
    })
  }

  const parsed = await parseJsonBody(request, updateQuestionSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data
  if (input.is_verified !== undefined && !isAdmin) {
    return err(403, {
      code: 'NOT_ADMIN',
      message: 'Only admin/super_admin can change verification status',
    })
  }
  const data: Prisma.QuestionUncheckedUpdateInput = {
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
    ...(input.marks_correct !== undefined ? { marks_correct: input.marks_correct } : {}),
    ...(input.marks_negative !== undefined ? { marks_negative: input.marks_negative } : {}),
    ...(input.marks_partial !== undefined ? { marks_partial: input.marks_partial ?? null } : {}),
    ...(input.question_body !== undefined ? { question_body: input.question_body } : {}),
    ...(input.option_a !== undefined ? { option_a: input.option_a ?? null } : {}),
    ...(input.option_b !== undefined ? { option_b: input.option_b ?? null } : {}),
    ...(input.option_c !== undefined ? { option_c: input.option_c ?? null } : {}),
    ...(input.option_d !== undefined ? { option_d: input.option_d ?? null } : {}),
    ...(input.correct_option !== undefined ? { correct_option: input.correct_option } : {}),
    ...(input.numerical_answer !== undefined
      ? { numerical_answer: input.numerical_answer ?? null }
      : {}),
    ...(input.matrix_left !== undefined
      ? { matrix_left: (input.matrix_left ?? Prisma.JsonNull) as Prisma.InputJsonValue }
      : {}),
    ...(input.matrix_right !== undefined
      ? { matrix_right: (input.matrix_right ?? Prisma.JsonNull) as Prisma.InputJsonValue }
      : {}),
    ...(input.matrix_answer !== undefined
      ? { matrix_answer: (input.matrix_answer ?? Prisma.JsonNull) as Prisma.InputJsonValue }
      : {}),
    ...(input.solution !== undefined ? { solution: input.solution ?? null } : {}),
    ...(input.explanation !== undefined ? { explanation: input.explanation ?? null } : {}),
    ...(input.hint !== undefined ? { hint: input.hint ?? null } : {}),
    ...(input.image_urls !== undefined ? { image_urls: input.image_urls } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.is_verified !== undefined ? { is_verified: input.is_verified } : {}),
  }

  // Compute the taxonomy diff: insert new, delete removed, leave matching alone.
  // The input.taxonomies array is the desired full set when present.
  const result = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.question.update({ where: { id: params.id }, data })
    }

    if (input.taxonomies !== undefined) {
      const desired = input.taxonomies as TaxonomyTag[]
      const existingByKey = new Map(existing.question_taxonomies.map((t) => [tagKey(t), t]))
      const desiredByKey = new Map(desired.map((t) => [tagKey(t), t]))

      const toAdd = desired.filter((t) => !existingByKey.has(tagKey(t)))
      const toRemoveIds = existing.question_taxonomies
        .filter((t) => !desiredByKey.has(tagKey(t)))
        .map((t) => t.id)

      if (toRemoveIds.length > 0) {
        await tx.questionTaxonomy.deleteMany({ where: { id: { in: toRemoveIds } } })
      }
      if (toAdd.length > 0) {
        await tx.questionTaxonomy.createMany({
          data: toAdd.map((t) => ({
            question_id: params.id,
            course_id: t.course_id,
            subject_id: t.subject_id,
            chapter_id: t.chapter_id,
            topic_id: t.topic_id,
            exam_type: t.exam_type,
          })),
          skipDuplicates: true,
        })
      }
    }

    const updated = await tx.question.findUnique({
      where: { id: params.id },
      include: { question_taxonomies: { select: taxonomyRowSelect } },
    })
    return updated!
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'question.update',
    entity_type: 'question',
    entity_id: result.id,
    meta: {
      actor_role: auth.payload.role,
      via: isCreator && !isAdmin ? 'creator' : 'admin',
      changes: Object.keys(parsed.data),
    },
    ip_address: getClientIp(request),
  })

  return ok(withTaxonomies(result))
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }

  const existing = await prisma.question.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'QUESTION_NOT_FOUND', message: 'Question not found' })
  }

  const inUse = await prisma.testQuestion.findFirst({
    where: { question_id: params.id },
    select: { test_id: true },
  })
  if (inUse) {
    return err(409, {
      code: 'QUESTION_IN_USE',
      message: 'Question is used in one or more tests; remove from tests before deleting',
    })
  }

  // Hard delete — the row leaves the database for good. Cascade through
  // the m2m taxonomy junction first so the FK doesn't block us when
  // QuestionTaxonomy.question is declared with onDelete: Restrict; if it
  // were Cascade, the deleteMany is harmless redundancy and the intent
  // stays explicit.
  await prisma.$transaction([
    prisma.questionTaxonomy.deleteMany({ where: { question_id: params.id } }),
    prisma.question.delete({ where: { id: params.id } }),
  ])

  await logAudit({
    user_id: auth.user.id,
    // `question.hard_delete` (vs the prior `question.delete`) so soft-
    // deletes that pre-date this change stay distinguishable in audit
    // logs.
    action: 'question.hard_delete',
    entity_type: 'question',
    entity_id: params.id,
    meta: {
      actor_role: auth.payload.role,
      question_type: existing.question_type,
      subject: existing.subject,
    },
    ip_address: getClientIp(request),
  })

  return ok({ id: params.id, deleted: true })
}
