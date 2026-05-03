import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import {
  isAuthFailure,
  isParseFailure,
  listEnvelope,
  parseJsonBody,
  requireAuth,
} from '@/lib/api/taxonomy'

// TODO: replace with import once integration/taxonomy-types merges
const STREAM_VALUES = ['JEE', 'NEET', 'School', 'Board'] as const

const createCourseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  grade: z.number().int().min(5).max(12),
  stream: z.enum(STREAM_VALUES).nullish(),
  description: z.string().trim().max(2000).nullish(),
})

const listQuerySchema = z.object({
  grade: z.coerce.number().int().min(5).max(12).optional(),
  stream: z.enum(STREAM_VALUES).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const queryParsed = listQuerySchema.safeParse({
    grade: url.searchParams.get('grade') ?? undefined,
    stream: url.searchParams.get('stream') ?? undefined,
  })
  if (!queryParsed.success) {
    return ok(listEnvelope([]))
  }

  const { grade, stream } = queryParsed.data

  const courses = await prisma.course.findMany({
    where: {
      deleted_at: null,
      ...(grade !== undefined ? { grade } : {}),
      ...(stream !== undefined ? { stream } : {}),
    },
    orderBy: { name: 'asc' },
  })

  return ok(listEnvelope(courses))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createCourseSchema)
  if (isParseFailure(parsed)) return parsed.response

  const { name, grade, stream, description } = parsed.data

  const course = await prisma.course.create({
    data: {
      name,
      grade,
      stream: stream ?? null,
      description: description ?? null,
      created_by: auth.user.id,
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.course.create',
    entity_type: 'course',
    entity_id: course.id,
    meta: { name: course.name, grade: course.grade, stream: course.stream },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(course, { status: 201 })
}
