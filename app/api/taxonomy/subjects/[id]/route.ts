import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'

const updateSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid subject id' })
  }

  const subject = await prisma.subject.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!subject) {
    return err(404, { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' })
  }

  return ok(subject)
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid subject id' })
  }

  const parsed = await parseJsonBody(request, updateSubjectSchema)
  if (isParseFailure(parsed)) return parsed.response

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' })
  }

  const { name } = parsed.data

  if (name && name !== existing.name) {
    // Same soft-delete-aware uniqueness check used on POST.
    const clash = await prisma.subject.findFirst({
      where: {
        course_id: existing.course_id,
        name,
        deleted_at: null,
        NOT: { id: params.id },
      },
      select: { id: true },
    })
    if (clash) {
      return err(409, {
        code: 'SUBJECT_NAME_TAKEN',
        message: `A subject named "${name}" already exists on this course`,
      })
    }
  }

  const subject = await prisma.subject.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.subject.update',
    entity_type: 'subject',
    entity_id: subject.id,
    meta: { changes: parsed.data },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(subject)
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid subject id' })
  }

  const existing = await prisma.subject.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' })
  }

  // 409 if any non-deleted chapter still points at this subject. The brief
  // explicitly says don't cascade-delete chapters from here — the caller
  // must clear them first.
  const chapterCount = await prisma.chapter.count({
    where: { subject_id: params.id, deleted_at: null },
  })
  if (chapterCount > 0) {
    return err(409, {
      code: 'SUBJECT_HAS_CHAPTERS',
      message: `Subject has ${chapterCount} active chapter(s); archive them first`,
      details: { chapter_count: chapterCount },
    })
  }

  const now = new Date()
  await prisma.subject.update({
    where: { id: params.id },
    data: { deleted_at: now, is_active: false },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.subject.delete',
    entity_type: 'subject',
    entity_id: params.id,
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok({ id: params.id, deleted_at: now })
}
