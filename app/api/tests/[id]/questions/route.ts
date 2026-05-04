import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import { setTestQuestionsSchema } from '@/lib/api/tests'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid test id' })
  }

  const existing = await prisma.test.findFirst({
    where: { id: params.id, deleted_at: null },
    select: { id: true, created_by: true },
  })
  if (!existing) {
    return err(404, { code: 'TEST_NOT_FOUND', message: 'Test not found' })
  }
  if (existing.created_by !== auth.user.id) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the test creator can set its questions',
    })
  }

  const parsed = await parseJsonBody(request, setTestQuestionsSchema)
  if (isParseFailure(parsed)) return parsed.response

  const items = parsed.data

  const positions = new Set<number>()
  for (const item of items) {
    if (positions.has(item.position)) {
      return err(400, {
        code: 'DUPLICATE_POSITION',
        message: `Position ${item.position} appears more than once`,
      })
    }
    positions.add(item.position)
  }

  const questionIds = Array.from(new Set(items.map((i) => i.question_id)))
  const foundQuestions = await prisma.question.findMany({
    where: { id: { in: questionIds }, deleted_at: null },
    select: { id: true },
  })
  if (foundQuestions.length !== questionIds.length) {
    const foundSet = new Set(foundQuestions.map((q) => q.id))
    const missing = questionIds.filter((id) => !foundSet.has(id))
    return err(400, {
      code: 'QUESTION_NOT_FOUND',
      message: 'One or more question_ids do not exist or are deleted',
      details: { missing },
    })
  }

  await prisma.$transaction([
    prisma.testQuestion.deleteMany({ where: { test_id: params.id } }),
    prisma.testQuestion.createMany({
      data: items.map((i) => ({
        test_id: params.id,
        question_id: i.question_id,
        position: i.position,
        ...(i.section_label !== undefined ? { section_label: i.section_label ?? null } : {}),
        ...(i.marks_override !== undefined ? { marks_override: i.marks_override ?? null } : {}),
        ...(i.negative_override !== undefined
          ? { negative_override: i.negative_override ?? null }
          : {}),
      })),
    }),
  ])

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.questions_set',
    entity_type: 'test',
    entity_id: params.id,
    meta: { actor_role: auth.payload.role, count: items.length },
    ip_address: getClientIp(request),
  })

  return ok({ test_id: params.id, count: items.length })
}
