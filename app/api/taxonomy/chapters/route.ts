import { type NextRequest } from 'next/server'
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

// TODO: replace with import once integration/taxonomy-types merges
const SUBJECT_VALUES = ['Physics', 'Chemistry', 'Maths', 'Biology'] as const

const createChapterSchema = z.object({
  course_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  subject: z.enum(SUBJECT_VALUES),
  chapter_no: z.number().int().min(0).max(32767).nullish(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const courseId = url.searchParams.get('course_id')
  if (!courseId || !z.string().uuid().safeParse(courseId).success) {
    return err(400, {
      code: 'MISSING_COURSE_ID',
      message: 'course_id query parameter is required and must be a UUID',
    })
  }

  const chapters = await prisma.chapter.findMany({
    where: { course_id: courseId, deleted_at: null },
    orderBy: [{ chapter_no: 'asc' }, { name: 'asc' }],
  })

  return ok(listEnvelope(chapters))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createChapterSchema)
  if (isParseFailure(parsed)) return parsed.response

  const { course_id, name, subject, chapter_no } = parsed.data

  const parent = await prisma.course.findFirst({
    where: { id: course_id, deleted_at: null },
  })
  if (!parent) {
    return err(404, {
      code: 'COURSE_NOT_FOUND',
      message: 'Parent course does not exist or has been deleted',
    })
  }

  const chapter = await prisma.chapter.create({
    data: {
      course_id,
      name,
      subject,
      chapter_no: chapter_no ?? null,
      created_by: auth.user.id,
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.chapter.create',
    entity_type: 'chapter',
    entity_id: chapter.id,
    meta: { course_id, name: chapter.name, subject: chapter.subject },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(chapter, { status: 201 })
}
