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
const createTopicSchema = z.object({
  chapter_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  topic_no: z.number().int().min(0).max(32767).nullish(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const url = new URL(request.url)
  const chapterId = url.searchParams.get('chapter_id')
  if (!chapterId || !z.string().uuid().safeParse(chapterId).success) {
    return err(400, {
      code: 'MISSING_CHAPTER_ID',
      message: 'chapter_id query parameter is required and must be a UUID',
    })
  }

  const topics = await prisma.topic.findMany({
    where: { chapter_id: chapterId, deleted_at: null },
    orderBy: [{ topic_no: 'asc' }, { name: 'asc' }],
  })

  return ok(listEnvelope(topics))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, createTopicSchema)
  if (isParseFailure(parsed)) return parsed.response

  const { chapter_id, name, topic_no } = parsed.data

  const parent = await prisma.chapter.findFirst({
    where: { id: chapter_id, deleted_at: null },
  })
  if (!parent) {
    return err(404, {
      code: 'CHAPTER_NOT_FOUND',
      message: 'Parent chapter does not exist or has been deleted',
    })
  }

  const topic = await prisma.topic.create({
    data: {
      chapter_id,
      name,
      topic_no: topic_no ?? null,
      created_by: auth.user.id,
    },
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'taxonomy.topic.create',
    entity_type: 'topic',
    entity_id: topic.id,
    meta: { chapter_id, name: topic.name },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok(topic, { status: 201 })
}
