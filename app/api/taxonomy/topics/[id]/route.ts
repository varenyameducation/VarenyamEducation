import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'

// TODO: replace with import once integration/taxonomy-types merges
const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    topic_no: z.number().int().min(0).max(32767).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid topic id' })
  }

  const parsed = await parseJsonBody(request, updateTopicSchema)
  if (isParseFailure(parsed)) return parsed.response

  const existing = await prisma.topic.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'TOPIC_NOT_FOUND', message: 'Topic not found' })
  }

  const { name, topic_no } = parsed.data

  const topic = await prisma.topic.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(topic_no !== undefined ? { topic_no: topic_no ?? null } : {}),
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.topic.update',
    entity_type: 'topic',
    entity_id: topic.id,
    meta: { changes: parsed.data },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(topic)
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid topic id' })
  }

  const existing = await prisma.topic.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'TOPIC_NOT_FOUND', message: 'Topic not found' })
  }

  const questionCount = await prisma.question.count({
    where: {
      deleted_at: null,
      question_taxonomies: { some: { topic_id: params.id } },
    },
  })
  if (questionCount > 0) {
    return err(409, {
      code: 'TOPIC_HAS_QUESTIONS',
      message: 'Topic has questions; archive instead.',
    })
  }

  const now = new Date()
  await prisma.topic.update({
    where: { id: params.id },
    data: { deleted_at: now, is_active: false },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.topic.delete',
    entity_type: 'topic',
    entity_id: params.id,
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok({ id: params.id, deleted_at: now })
}
