import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAnonServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { setAuthCookies } from '@/lib/auth/session'
import { logAudit } from '@/lib/auth/audit'
import { ok, err } from '@/lib/api/response'
import { checkLoginRateLimit } from '@/lib/auth/rate-limit'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const INST_ID = 'varenyam-institute'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err(400, { code: 'INVALID_BODY', message: 'Request body must be valid JSON' })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return err(400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: parsed.error.flatten(),
    })
  }

  const { email, password } = parsed.data

  // Rate-limit by IP to prevent brute-force.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const rateCheck = checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return err(429, {
      code: 'TOO_MANY_REQUESTS',
      message: `Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfterSecs / 60)} minute(s).`,
    })
  }

  const supabase = createSupabaseAnonServerClient()
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError || !authData.user) {
    return err(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    })
  }

  const supabaseUid = authData.user.id

  const user = await prisma.user.findUnique({ where: { supabase_uid: supabaseUid } })
  if (!user) {
    return err(403, {
      code: 'NOT_PROVISIONED',
      message: 'Account not set up. Contact your administrator.',
    })
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { last_login: new Date() },
  })

  if (!user.is_active) {
    return err(403, {
      code: 'ACCOUNT_DEACTIVATED',
      message: 'Your account has been deactivated. Please contact an administrator.',
    })
  }

  setAuthCookies({
    sub: user.supabase_uid,
    email: user.email,
    role: user.role as 'super_admin' | 'admin' | 'teacher',
    inst_id: INST_ID,
  })

  await logAudit({
    user_id: user.id,
    action: 'auth.login',
    entity_type: 'user',
    entity_id: user.id,
    ip_address: request.headers.get('x-forwarded-for'),
  })

  return ok({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
  })
}
