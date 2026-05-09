import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(['admin', 'super_admin'])
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid question id' })
  }

  const question = await prisma.question.findFirst({
    where: { id: params.id, deleted_at: null },
    select: { id: true },
  })
  if (!question) {
    return err(404, { code: 'QUESTION_NOT_FOUND', message: 'Question not found' })
  }

  const rows = await prisma.testQuestion.findMany({
    where: { question_id: params.id, test: { deleted_at: null } },
    select: {
      position: true,
      test: { select: { id: true, title: true, status: true } },
    },
    orderBy: { test: { created_at: 'desc' } },
  })

  const tests = rows.map((r) => ({
    id: r.test.id,
    title: r.test.title,
    status: r.test.status,
    position: r.position,
  }))

  return ok({ tests })
}
