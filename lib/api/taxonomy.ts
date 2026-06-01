import type { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { User } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookies } from '@/lib/auth/session'
import type { JWTPayload } from '@/lib/auth/jwt'
import { err } from '@/lib/api/response'

export type Role = 'super_admin' | 'admin' | 'teacher'

export type AuthSuccess = { user: User; payload: JWTPayload }
export type AuthFailure = { response: NextResponse }
export type AuthResult = AuthSuccess | AuthFailure

export function isAuthFailure(result: AuthResult): result is AuthFailure {
  return 'response' in result
}

// In-process cache for the requireAuth user lookup. Keyed by supabase_uid;
// values expire after USER_CACHE_TTL_MS. Lives per function-instance, so
// warm functions reuse it across many requests; cold starts repopulate.
// is_active changes propagate within USER_CACHE_TTL_MS — acceptable given
// the alternative is a trans-pacific Prisma round trip (~1s) on every
// authenticated request.
const USER_CACHE_TTL_MS = 60_000
type CachedUser = { user: User; expiresAt: number }
const userCache = new Map<string, CachedUser>()

async function getCachedUser(supabaseUid: string): Promise<User | null> {
  const now = Date.now()
  const cached = userCache.get(supabaseUid)
  if (cached && cached.expiresAt > now) return cached.user
  const user = await prisma.user.findUnique({ where: { supabase_uid: supabaseUid } })
  if (user) userCache.set(supabaseUid, { user, expiresAt: now + USER_CACHE_TTL_MS })
  else userCache.delete(supabaseUid)
  return user
}

export async function requireAuth(allowedRoles?: Role[]): Promise<AuthResult> {
  const payload = getSessionFromCookies()
  if (!payload) {
    return { response: err(401, { code: 'UNAUTHENTICATED', message: 'Login required' }) }
  }

  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    return {
      response: err(403, {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action',
      }),
    }
  }

  const user = await getCachedUser(payload.sub)
  if (!user || !user.is_active) {
    return {
      response: err(401, { code: 'UNAUTHENTICATED', message: 'User no longer active' }),
    }
  }

  return { user, payload }
}

export type ParseSuccess<T> = { data: T; response?: never }
export type ParseFailure = { data?: never; response: NextResponse }
export type ParseResult<T> = ParseSuccess<T> | ParseFailure

export function isParseFailure<T>(result: ParseResult<T>): result is ParseFailure {
  return 'response' in result && result.response !== undefined
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      response: err(400, { code: 'INVALID_BODY', message: 'Request body must be valid JSON' }),
    }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten()
    // Surface field-level rejection reasons in Vercel function logs so we
    // can diagnose "Invalid input" reports without asking users to open
    // the browser Network tab and screenshot the response body.
    console.error('[parseJsonBody] VALIDATION_ERROR', {
      fieldErrors: details.fieldErrors,
      formErrors: details.formErrors,
    })
    return {
      response: err(400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details,
      }),
    }
  }
  return { data: parsed.data }
}

export function listEnvelope<T>(items: T[]) {
  return { items, page: 1, limit: items.length, total: items.length }
}
