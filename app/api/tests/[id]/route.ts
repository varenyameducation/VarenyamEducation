import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import { updateTestSchema } from '@/lib/api/tests'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid test id' })
  }

  const test = await prisma.test.findFirst({
    where: { id: params.id, deleted_at: null },
    include: {
      course: { select: { id: true, name: true, grade: true, stream: true } },
      test_questions: {
        include: { question: true },
        orderBy: { position: 'asc' },
      },
    },
  })
  if (!test) {
    return err(404, { code: 'TEST_NOT_FOUND', message: 'Test not found' })
  }
  return ok(test)
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid test id' })
  }

  const existing = await prisma.test.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'TEST_NOT_FOUND', message: 'Test not found' })
  }

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  const isCreator = existing.created_by === auth.user.id
  if (!isAdmin && !isCreator) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the creator or an admin can edit this test',
    })
  }

  const parsed = await parseJsonBody(request, updateTestSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data
  const data: Prisma.TestUncheckedUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.course_id !== undefined ? { course_id: input.course_id ?? null } : {}),
    ...(input.subject !== undefined ? { subject: input.subject ?? null } : {}),
    ...(input.exam_type !== undefined ? { exam_type: input.exam_type ?? null } : {}),
    ...(input.duration_minutes !== undefined ? { duration_minutes: input.duration_minutes } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.scheduled_start !== undefined
      ? { scheduled_start: input.scheduled_start ?? null }
      : {}),
    ...(input.scheduled_end !== undefined ? { scheduled_end: input.scheduled_end ?? null } : {}),
    ...(input.assigned_batch !== undefined
      ? { assigned_batch: input.assigned_batch ?? null }
      : {}),
    ...(input.allow_resume !== undefined ? { allow_resume: input.allow_resume } : {}),
    ...(input.shuffle_questions !== undefined
      ? { shuffle_questions: input.shuffle_questions }
      : {}),
  }

  const test = await prisma.test.update({ where: { id: params.id }, data })

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.update',
    entity_type: 'test',
    entity_id: test.id,
    meta: {
      actor_role: auth.payload.role,
      via: isCreator && !isAdmin ? 'creator' : 'admin',
      changes: Object.keys(parsed.data),
    },
    ip_address: getClientIp(request),
  })

  return ok(test)
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid test id' })
  }

  const existing = await prisma.test.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'TEST_NOT_FOUND', message: 'Test not found' })
  }

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  const isCreator = existing.created_by === auth.user.id
  if (!isAdmin && !isCreator) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the creator or an admin can delete this test',
    })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.testQuestion.deleteMany({ where: { test_id: params.id } }),
    prisma.test.update({
      where: { id: params.id },
      data: { deleted_at: now },
    }),
  ])

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.delete',
    entity_type: 'test',
    entity_id: params.id,
    meta: {
      actor_role: auth.payload.role,
      via: isCreator && !isAdmin ? 'creator' : 'admin',
      title: existing.title,
    },
    ip_address: getClientIp(request),
  })

  return ok({ id: params.id, deleted_at: now })
}
