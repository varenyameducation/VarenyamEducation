import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server'
import { err } from '@/lib/api/response'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return err(500, {
      code: 'CONFIG_MISSING',
      message: 'NEXT_PUBLIC_APP_URL not configured',
    })
  }

  const supabase = createSupabaseRouteHandlerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(new URL('/login?error=oauth_init_failed', request.url))
  }

  return NextResponse.redirect(data.url)
}
