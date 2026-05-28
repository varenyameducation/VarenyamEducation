import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { err } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import { sanitizeTitleForFilename } from '@/lib/api/tests'

// Vercel's default function timeout (10 s) is shorter than @sparticuz
// chromium's cold-start + multi-page render of a typical exam paper.
// 60 s is the Hobby-plan ceiling and comfortably covers ~20-page papers.
export const maxDuration = 60
// Avoid edge runtime — puppeteer-core + chromium need full Node APIs.
export const runtime = 'nodejs'

const idSchema = z.string().uuid()

type RouteContext = { params: { id: string } }

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  if (!idSchema.safeParse(params.id).success) {
    return err(400, { code: 'INVALID_ID', message: 'Invalid test id' })
  }

  const test = await prisma.test.findFirst({
    where: { id: params.id, deleted_at: null },
    select: { id: true, title: true, created_by: true },
  })
  if (!test) {
    return err(404, { code: 'TEST_NOT_FOUND', message: 'Test not found' })
  }

  const isAdmin = auth.payload.role === 'admin' || auth.payload.role === 'super_admin'
  if (!isAdmin && test.created_by !== auth.user.id) {
    return err(403, {
      code: 'NOT_OWNER',
      message: 'Only the creator or an admin can export this test',
    })
  }

  type PdfModule = { generateTestPDF?: (id: string) => Promise<Buffer> }
  const mod: PdfModule | null = await (
    import('@/lib/export/pdf') as Promise<PdfModule>
  ).catch(() => null)
  if (!mod || typeof mod.generateTestPDF !== 'function') {
    return err(503, { code: 'EXPORT_NOT_READY', message: 'PDF generator not deployed' })
  }

  let buffer: Buffer
  try {
    buffer = await mod.generateTestPDF(params.id)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'PDF generation failed'
    return err(500, { code: 'EXPORT_FAILED', message })
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.export_pdf',
    entity_type: 'test',
    entity_id: params.id,
    meta: { actor_role: auth.payload.role, bytes: buffer.length },
    ip_address: getClientIp(request),
  })

  const filename = `test-${sanitizeTitleForFilename(test.title)}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
