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

const createChapterSchema = z.object({
  subject_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  chapter_no: z.number().int().min(0).max(32767).nullish(),
})

const uuid = z.string().uuid()

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const subjectIdRaw = url.searchParams.get('subject_id')
  const courseIdRaw = url.searchParams.get('course_id')

  // Either filter is fine: subject_id wins when both given; course_id alone
  // joins through Subject so callers that don't know the new tier yet keep
  // working.
  let where: Prisma.ChapterWhereInput
  if (subjectIdRaw) {
    if (!uuid.safeParse(subjectIdRaw).success) {
      return err(400, { code: 'INVALID_SUBJECT_ID', message: 'subject_id must be a UUID' })
    }
    where = { subject_id: subjectIdRaw, deleted_at: null }
  } else if (courseIdRaw) {
    if (!uuid.safeParse(courseIdRaw).success) {
      return err(400, { code: 'INVALID_COURSE_ID', message: 'course_id must be a UUID' })
    }
    where = { subject: { course_id: courseIdRaw }, deleted_at: null }
  } else {
    return err(400, {
      code: 'MISSING_FILTER',
      message: 'One of subject_id or course_id is required',
    })
  }

  const chapters = await prisma.chapter.findMany({
    where,
    orderBy: [{ chapter_no: 'asc' }, { name: 'asc' }],
  })

  return ok(listEnvelope(chapters))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createChapterSchema)
  if (isParseFailure(parsed)) return parsed.response

  const { subject_id, name, chapter_no } = parsed.data

  const parent = await prisma.subject.findFirst({
    where: { id: subject_id, deleted_at: null },
  })
  if (!parent) {
    return err(404, {
      code: 'SUBJECT_NOT_FOUND',
      message: 'Parent subject does not exist or has been deleted',
    })
  }

  const chapter = await prisma.chapter.create({
    data: {
      subject_id,
      name,
      chapter_no: chapter_no ?? null,
      created_by: auth.user.id,
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.chapter.create',
    entity_type: 'chapter',
    entity_id: chapter.id,
    meta: { subject_id, name: chapter.name },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(chapter, { status: 201 })
}
