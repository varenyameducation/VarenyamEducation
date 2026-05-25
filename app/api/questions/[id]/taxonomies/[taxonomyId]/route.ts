import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string; taxonomyId: string } }

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }
  if (!idSchema.safeParse(params.taxonomyId).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid taxonomy id' })
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

  const tag = await prisma.questionTaxonomy.findUnique({
    where: { id: params.taxonomyId },
    select: { id: true, question_id: true },
  })
  if (!tag || tag.question_id !== params.id) {
    return err(404, { code: 'TAXONOMY_NOT_FOUND', message: 'Taxonomy tag not found on this question' })
  }

  const remainingCount = await prisma.questionTaxonomy.count({
    where: { question_id: params.id },
  })
  if (remainingCount <= 1) {
    return err(400, {
      code: 'LAST_TAXONOMY',
      message: 'Cannot remove the last taxonomy tag from a question',
    })
  }

  await prisma.questionTaxonomy.delete({ where: { id: params.taxonomyId } })

  await logAudit({
    user_id: auth.user.id,
    action: 'question.taxonomies_remove',
    entity_type: 'question',
    entity_id: params.id,
    meta: {
      actor_role: auth.payload.role,
      taxonomy_id: params.taxonomyId,
    },
    ip_address: getClientIp(request),
  })

  return ok({ id: params.taxonomyId, deleted: true })
}
