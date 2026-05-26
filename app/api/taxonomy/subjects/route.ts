import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import {
  isAuthFailure,
  isParseFailure,
  listEnvelope,
  parseJsonBody,
  requireAuth,
} from '@/lib/api/taxonomy'

const createSubjectSchema = z.object({
  course_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const courseIdRaw = url.searchParams.get('course_id')

  // course_id is optional: when omitted, return every active subject across
  // courses (useful for admin views); when present, validate as UUID first.
  let courseId: string | undefined
  if (courseIdRaw) {
    if (!z.string().uuid().safeParse(courseIdRaw).success) {
      return err(400, {
        code: 'INVALID_COURSE_ID',
        message: 'course_id must be a UUID',
      })
    }
    courseId = courseIdRaw
  }

  const where: Prisma.SubjectWhereInput = {
    deleted_at: null,
    ...(courseId ? { course_id: courseId } : {}),
  }

  const subjects = await prisma.subject.findMany({
    where,
    orderBy: [{ name: 'asc' }],
  })

  return ok(listEnvelope(subjects))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createSubjectSchema)
  if (isParseFailure(parsed)) return parsed.response

  const { course_id, name } = parsed.data

  const parent = await prisma.course.findFirst({
    where: { id: course_id, deleted_at: null },
  })
  if (!parent) {
    return err(404, {
      code: 'COURSE_NOT_FOUND',
      message: 'Parent course does not exist or has been deleted',
    })
  }

  // Soft-delete-aware uniqueness: a soft-deleted row with the same name on
  // this course should not block a new one. The DB unique covers all rows
  // (including soft-deleted), so we check explicitly first.
  const clash = await prisma.subject.findFirst({
    where: { course_id, name, deleted_at: null },
    select: { id: true },
  })
  if (clash) {
    return err(409, {
      code: 'SUBJECT_NAME_TAKEN',
      message: `A subject named "${name}" already exists on this course`,
    })
  }

  const subject = await prisma.subject.create({
    data: {
      course_id,
      name,
      created_by: auth.user.id,
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.subject.create',
    entity_type: 'subject',
    entity_id: subject.id,
    meta: { course_id, name: subject.name },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(subject, { status: 201 })
}
