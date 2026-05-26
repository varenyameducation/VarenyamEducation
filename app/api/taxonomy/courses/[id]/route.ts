import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'

// TODO: replace with import once integration/taxonomy-types merges
const STREAM_VALUES = ['JEE', 'NEET', 'School', 'Board'] as const

const updateCourseSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    grade: z.number().int().min(5).max(12).optional(),
    stream: z.enum(STREAM_VALUES).nullish(),
    description: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid course id' })
  }

  const parsed = await parseJsonBody(request, updateCourseSchema)
  if (isParseFailure(parsed)) return parsed.response

  const existing = await prisma.course.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'COURSE_NOT_FOUND', message: 'Course not found' })
  }

  const { name, grade, stream, description } = parsed.data

  const course = await prisma.course.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(grade !== undefined ? { grade } : {}),
      ...(stream !== undefined ? { stream: stream ?? null } : {}),
      ...(description !== undefined ? { description: description ?? null } : {}),
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.course.update',
    entity_type: 'course',
    entity_id: course.id,
    meta: { changes: parsed.data },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(course)
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid course id' })
  }

  const existing = await prisma.course.findFirst({
    where: { id: params.id, deleted_at: null },
  })
  if (!existing) {
    return err(404, { code: 'COURSE_NOT_FOUND', message: 'Course not found' })
  }

  const now = new Date()

  // Cascade walks: Course → Subjects → Chapters → Topics. One extra hop vs.
  // the pre-Subject-tier schema; the chain is built up by ID set first so
  // each updateMany sees a deterministic batch even if rows shift mid-tx.
  const subjects = await prisma.subject.findMany({
    where: { course_id: params.id, deleted_at: null },
    select: { id: true },
  })
  const subjectIds = subjects.map((s) => s.id)

  const chapters = subjectIds.length
    ? await prisma.chapter.findMany({
        where: { subject_id: { in: subjectIds }, deleted_at: null },
        select: { id: true },
      })
    : []
  const chapterIds = chapters.map((c) => c.id)

  await prisma.$transaction([
    prisma.topic.updateMany({
      where: { chapter_id: { in: chapterIds }, deleted_at: null },
      data: { deleted_at: now, is_active: false },
    }),
    prisma.chapter.updateMany({
      where: { subject_id: { in: subjectIds }, deleted_at: null },
      data: { deleted_at: now, is_active: false },
    }),
    prisma.subject.updateMany({
      where: { course_id: params.id, deleted_at: null },
      data: { deleted_at: now, is_active: false },
    }),
    prisma.course.update({
      where: { id: params.id },
      data: { deleted_at: now, is_active: false },
    }),
  ])

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.course.delete',
    entity_type: 'course',
    entity_id: params.id,
    meta: {
      cascaded_subjects: subjectIds.length,
      cascaded_chapters: chapterIds.length,
    },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok({ id: params.id, deleted_at: now })
}
