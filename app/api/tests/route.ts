import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { ok } from '@/lib/api/response'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { logAudit } from '@/lib/auth/audit'
import { getClientIp } from '@/lib/api/questions'
import { createTestSchema } from '@/lib/api/tests'

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createTestSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data
  const data: Prisma.TestUncheckedCreateInput = {
    title: input.title,
    created_by: auth.user.id,
    duration_minutes: input.duration_minutes ?? 180,
    allow_resume: input.allow_resume ?? true,
    shuffle_questions: input.shuffle_questions ?? false,
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.course_id !== undefined ? { course_id: input.course_id ?? null } : {}),
    ...(input.subject !== undefined ? { subject: input.subject ?? null } : {}),
    ...(input.exam_type !== undefined ? { exam_type: input.exam_type ?? null } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
    ...(input.scheduled_start !== undefined
      ? { scheduled_start: input.scheduled_start ?? null }
      : {}),
    ...(input.scheduled_end !== undefined ? { scheduled_end: input.scheduled_end ?? null } : {}),
    ...(input.assigned_batch !== undefined
      ? { assigned_batch: input.assigned_batch ?? null }
      : {}),
  }

  const test = await prisma.test.create({ data })

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.create',
    entity_type: 'test',
    entity_id: test.id,
    meta: {
      actor_role: auth.payload.role,
      title: test.title,
      course_id: test.course_id,
      subject: test.subject,
      exam_type: test.exam_type,
    },
    ip_address: getClientIp(request),
  })

  return ok(test, { status: 201 })
}
