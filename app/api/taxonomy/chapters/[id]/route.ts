import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'

// TODO: replace with import once integration/taxonomy-types merges
const SUBJECT_VALUES = ['Physics', 'Chemistry', 'Maths', 'Biology'] as const

const updateChapterSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    subject: z.enum(SUBJECT_VALUES).optional(),
    chapter_no: z.number().int().min(0).max(32767).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid chapter id' })
  }

  const parsed = await parseJsonBody(request, updateChapterSchema)
  if (isParseFailure(parsed)) return parsed.response

  const existing = await prisma.chapter.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' })
  }

  const { name, subject, chapter_no } = parsed.data

  const chapter = await prisma.chapter.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(chapter_no !== undefined ? { chapter_no: chapter_no ?? null } : {}),
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.chapter.update',
    entity_type: 'chapter',
    entity_id: chapter.id,
    meta: { changes: parsed.data },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(chapter)
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid chapter id' })
  }

  const existing = await prisma.chapter.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' })
  }

  const now = new Date()
  const topicCount = await prisma.topic.count({
    where: { chapter_id: params.id, deleted_at: null },
  })

  await prisma.$transaction([
    prisma.topic.updateMany({
      where: { chapter_id: params.id, deleted_at: null },
      data: { deleted_at: now, is_active: false },
    }),
    prisma.chapter.update({
      where: { id: params.id },
      data: { deleted_at: now, is_active: false },
    }),
  ])

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.chapter.delete',
    entity_type: 'chapter',
    entity_id: params.id,
    meta: { cascaded_topics: topicCount },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok({ id: params.id, deleted_at: now })
}
