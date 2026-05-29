// Bootstrap-and-recover endpoint for the super_admin account, without SQL.
//
// Two modes, gated by what's in the database:
//   1. NO super_admin exists yet (fresh install):
//      accepts any email + password, creates/sets-password on that Supabase
//      auth user, and promotes their Prisma row to role='super_admin'.
//   2. A super_admin ALREADY exists:
//      only the existing super_admin's own email is accepted. Same email +
//      new password → password gets reset on that account. Any other email
//      → 403 SETUP_LOCKED.
//
// This means the page works as a one-time bootstrap on a fresh DB, and as a
// "I lost my super_admin password" recovery on any DB that already has one,
// without ever letting a passer-by hijack a different account.
//
// Uses the Supabase service-role client to either:
//   - set a password on an existing Supabase user (e.g. one created via the
//     old Google OAuth flow, which had no password attached), or
//   - create a brand new email/password user from scratch.

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

  // If a super_admin already exists, this endpoint becomes a password-reset
  // tied to *that* email — any other email is rejected.
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: 'super_admin' },
    select: { email: true },
  })
  if (
    existingSuperAdmin &&
    existingSuperAdmin.email.toLowerCase() !== email.toLowerCase()
  ) {
    return err(403, {
      code: 'SETUP_LOCKED',
      message:
        'A super admin already exists with a different email. Use that email to reset the password, or sign in normally.',
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
  const existing = await prisma.user.findFirst({
    where: { role: 'super_admin' },
    select: { email: true },
  })
  if (existing) {
    return ok({ available: false, existingEmail: existing.email })
  }
  return ok({ available: true })
}
