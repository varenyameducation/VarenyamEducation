import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Service-role client for admin operations. Stateless — does not read/write cookies.
 * Use for trusted server work (admin user creation, audit, server-only mutations).
 */
export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase server environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    )
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Stateless anon client. Use ONLY for one-shot calls that don't need session
 * continuity (e.g. signInWithPassword, where a JWT comes back in the response
 * and we mint our own cookies).
 *
 * Do NOT use for OAuth flows — see createSupabaseRouteHandlerClient below.
 */
export function createSupabaseAnonServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required',
    )
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Cookie-aware anon client for OAuth flows in Next.js App Router route handlers.
 *
 * Why this exists: signInWithOAuth (PKCE flow) writes a one-time `code_verifier`
 * into the session storage. The /auth/callback handler later needs that same
 * verifier to call exchangeCodeForSession. With the stateless anon client, the
 * verifier is dropped between requests and OAuth always fails with
 * "invalid request" — which surfaces as oauth_failed at our callback.
 *
 * @supabase/ssr binds the verifier (and other auth state) to Next.js cookies,
 * so it survives the redirect roundtrip Google → Supabase → our callback.
 *
 * Use this in /api/auth/google and /auth/callback only. Other routes should
 * use createSupabaseAnonServerClient.
 */
export function createSupabaseRouteHandlerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required',
    )
  }

  const cookieStore = cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll fails when called from a Server Component — safe to ignore
          // in that context because middleware will refresh the session.
        }
      },
    },
  })
}
