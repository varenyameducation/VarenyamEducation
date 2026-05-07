import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { setAuthCookies } from '@/lib/auth/session'
import { logAudit } from '@/lib/auth/audit'

const INST_ID = 'varenyam-institute'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url))
  }

  const supabase = createSupabaseRouteHandlerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('[auth/callback] exchangeCodeForSession failed', error)
    return NextResponse.redirect(
      new URL(`/login?error=oauth_failed&detail=${encodeURIComponent(error?.message ?? 'no_user')}`, request.url),
    )
  }

  const email = data.user.email
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=oauth_no_email', request.url))
  }

  const user = await prisma.user.upsert({
    where: { supabase_uid: data.user.id },
    update: { last_login: new Date(), email },
    create: {
      supabase_uid: data.user.id,
      email,
      full_name:
        (data.user.user_metadata?.full_name as string) ??
        (data.user.user_metadata?.name as string) ??
        email.split('@')[0],
      role: 'teacher',
      subject: [],
      avatar_url: (data.user.user_metadata?.avatar_url as string) ?? null,
      last_login: new Date(),
    },
  })

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
    meta: { provider: 'google' },
    ip_address: request.headers.get('x-forwarded-for'),
  })

  // Dashboard route group is `app/(dashboard)/page.tsx` — its URL is `/`, not `/dashboard`.
  return NextResponse.redirect(new URL('/', request.url))
}
