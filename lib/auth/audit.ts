import { prisma } from '@/lib/db/prisma'

export async function logAudit(params: {
  user_id?: string | null
  action: string
  entity_type?: string
  entity_id?: string
  meta?: Record<string, unknown>
  ip_address?: string | null
}) {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: params.user_id ?? null,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        meta: params.meta as never,
        ip_address: params.ip_address ?? null,
      },
    })
  } catch {
    // PRD §9 — audit failures must not block primary operations
  }
}
