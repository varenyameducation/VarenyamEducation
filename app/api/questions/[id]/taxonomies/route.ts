import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import {
  flattenTaxonomyRow,
  getClientIp,
  taxonomyRowSelect,
  taxonomyTagSchema,
} from '@/lib/api/questions'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

const bodySchema = z.object({
  taxonomies: z.array(taxonomyTagSchema).min(1).max(50),
})

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }

  const question = await prisma.question.findFirst({
    where: { id: params.id, deleted_at: null },
    select: { id: true, created_by: true },
  })
  if (!question) {
    return err(404, { code: 'QUESTION_NOT_FOUND', message: 'Question not found' })
  }

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  const isCreator = question.created_by === auth.user.id
  if (!isAdmin && !isCreator) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the creator or an admin can re-tag this question',
    })
  }

  const parsed = await parseJsonBody(request, bodySchema)
  if (isParseFailure(parsed)) return parsed.response

  const { taxonomies } = parsed.data

  await prisma.questionTaxonomy.createMany({
    data: taxonomies.map((t) => ({
      question_id: params.id,
      course_id: t.course_id,
      subject_id: t.subject_id,
      chapter_id: t.chapter_id,
      topic_id: t.topic_id,
      exam_type: t.exam_type,
    })),
    skipDuplicates: true,
  })

  const rows = await prisma.questionTaxonomy.findMany({
    where: { question_id: params.id },
    select: taxonomyRowSelect,
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'question.taxonomies_add',
    entity_type: 'question',
    entity_id: params.id,
    meta: {
      actor_role: auth.payload.role,
      added: taxonomies.length,
      total: rows.length,
    },
    ip_address: getClientIp(request),
  })

  return ok({ taxonomies: rows.map(flattenTaxonomyRow) })
}
