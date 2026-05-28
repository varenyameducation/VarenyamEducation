// One-time bootstrap endpoint to create the first super_admin without SQL.
//
// Auto-locks itself once any User in the DB has role 'super_admin' — so this
// route works exactly once per database. After the first call, it returns 403
// SETUP_ALREADY_DONE for all callers (including the same email re-trying).
//
// Uses the Supabase service-role client to either:
//   - set a password on an existing Supabase user (e.g. one created via the
//     old Google OAuth flow, which had no password attached), or
//   - create a brand new email/password user from scratch.
// Then upserts the matching Prisma User row with role='super_admin'.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { ok, err } from '@/lib/api/response'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err(400, { code: 'INVALID_BODY', message: 'Request body must be valid JSON' })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return err(400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: parsed.error.flatten(),
    })
  }

  const { email, password } = parsed.data

  // Lock: only runs while no super_admin exists.
  const alreadySetUp = await prisma.user.findFirst({ where: { role: 'super_admin' } })
  if (alreadySetUp) {
    return err(403, {
      code: 'SETUP_ALREADY_DONE',
      message: 'A super admin already exists. This setup page is now disabled.',
    })
  }

  const supabase = createSupabaseServerClient()

  // Find existing Supabase auth user by email (e.g. one created via Google OAuth).
  // listUsers paginates; first 200 is enough for this single-user setup case.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) {
    return err(500, { code: 'SUPABASE_LIST_FAILED', message: listErr.message })
  }

  const lowerEmail = email.toLowerCase()
  const existingSupabaseUser = list.users.find(
    (u) => u.email?.toLowerCase() === lowerEmail,
  )

  let supabaseUid: string
  let fullName: string

  if (existingSupabaseUser) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      existingSupabaseUser.id,
      { password, email_confirm: true },
    )
    if (updateErr) {
      return err(500, { code: 'SUPABASE_UPDATE_FAILED', message: updateErr.message })
    }
    supabaseUid = existingSupabaseUser.id
    fullName =
      (existingSupabaseUser.user_metadata?.full_name as string) ??
      (existingSupabaseUser.user_metadata?.name as string) ??
      email.split('@')[0]
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return err(500, {
        code: 'SUPABASE_CREATE_FAILED',
        message: createErr?.message ?? 'Unknown error',
      })
    }
    supabaseUid = created.user.id
    fullName = email.split('@')[0]
  }

  await prisma.user.upsert({
    where: { supabase_uid: supabaseUid },
    update: { role: 'super_admin', email, is_active: true },
    create: {
      supabase_uid: supabaseUid,
      email,
      full_name: fullName,
      role: 'super_admin',
      subject: [],
      is_active: true,
    },
  })

  return ok({ email })
}

export async function GET() {
  const alreadySetUp = await prisma.user.findFirst({ where: { role: 'super_admin' } })
  return ok({ available: !alreadySetUp })
}
