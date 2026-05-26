import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp, taxonomyTagSchema } from '@/lib/api/questions'

const bodySchema = z
  .object({
    question_ids: z.array(z.string().uuid()).min(1).max(500),
    add: z.array(taxonomyTagSchema).max(50).optional(),
    remove: z.array(taxonomyTagSchema).max(50).optional(),
  })
  .refine((v) => (v.add && v.add.length > 0) || (v.remove && v.remove.length > 0), {
    message: 'At least one of `add` or `remove` must be provided with at least one tag',
  })

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  if (!isAdmin) {
    return err(403, {
      code: 'NOT_ADMIN',
      message: 'Only admin/super_admin can bulk re-tag questions',
    })
  }

  const parsed = await parseJsonBody(request, bodySchema)
  if (isParseFailure(parsed)) return parsed.response

  const { question_ids, add, remove } = parsed.data

  // Verify questions exist + not deleted; reject the whole call on a miss
  // so the caller can fix its list before retrying.
  const found = await prisma.question.findMany({
    where: { id: { in: question_ids }, deleted_at: null },
    select: { id: true },
  })
  if (found.length !== question_ids.length) {
    const foundSet = new Set(found.map((q) => q.id))
    const missing = question_ids.filter((id) => !foundSet.has(id))
    return err(400, {
      code: 'QUESTION_NOT_FOUND',
      message: 'One or more question_ids do not exist or are deleted',
      details: { missing },
    })
  }

  const result = await prisma.$transaction(async (tx) => {
    let addedCount = 0
    let removedCount = 0

    if (add && add.length > 0) {
      const rows = question_ids.flatMap((qid) =>
        add.map((t) => ({
          question_id: qid,
          course_id: t.course_id,
          subject_id: t.subject_id,
          chapter_id: t.chapter_id,
          topic_id: t.topic_id,
          exam_type: t.exam_type,
        })),
      )
      const r = await tx.questionTaxonomy.createMany({ data: rows, skipDuplicates: true })
      addedCount = r.count
    }

    if (remove && remove.length > 0) {
      // Build an OR condition matching any (question_id, course_id, subject_id,
      // chapter_id, topic_id, exam_type) tuple from the cartesian product of
      // question_ids × remove.
      const conditions = question_ids.flatMap((qid) =>
        remove.map((t) => ({
          question_id: qid,
          course_id: t.course_id,
          subject_id: t.subject_id,
          chapter_id: t.chapter_id,
          topic_id: t.topic_id,
          exam_type: t.exam_type,
        })),
      )
      const r = await tx.questionTaxonomy.deleteMany({ where: { OR: conditions } })
      removedCount = r.count
    }

    return { addedCount, removedCount }
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'questions.bulk_retag',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      question_count: question_ids.length,
      tags_added: result.addedCount,
      tags_removed: result.removedCount,
    },
    ip_address: getClientIp(request),
  })

  return ok({
    question_count: question_ids.length,
    added: result.addedCount,
    removed: result.removedCount,
  })
}
