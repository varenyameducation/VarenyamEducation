/**
 * Bootstrap a super_admin account for Varenyam.
 *
 * Creates (or updates) a Supabase Auth user + a matching row in our
 * application `users` table with role = 'super_admin'.
 *
 * Why both: app's `app/api/auth/login/route.ts` and `auth/callback/route.ts`
 * upsert on supabase_uid. If the row doesn't exist they create it with
 * role='teacher' (PRD §10.1: "teachers cannot self-register" — only
 * super_admin can mint accounts). To bootstrap the very first super_admin
 * we have to do it server-side with the service role key.
 *
 * Run:
 *   node scripts/bootstrap-admin.mjs
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
 */

import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Minimal .env.local loader (Next.js handles this normally; this script
// runs outside Next so we load it manually).
function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'varenyameducation@gmail.com'
const ADMIN_NAME = process.env.BOOTSTRAP_ADMIN_NAME || 'Varenyam Admin'
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD
if (!ADMIN_PASSWORD) {
  console.error('BOOTSTRAP_ADMIN_PASSWORD env var is required.')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const prisma = new PrismaClient()

async function main() {
  // 1. Find or create Supabase Auth user with this email.
  let authUid
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (listErr) throw listErr
  const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())

  if (existing) {
    authUid = existing.id
    console.log(`Auth user already exists: ${ADMIN_EMAIL} (${authUid})`)
    // Reset password to the requested one so the operator definitely knows it.
    const { error } = await supabase.auth.admin.updateUserById(authUid, { password: ADMIN_PASSWORD })
    if (error) throw error
    console.log('Password reset.')
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true, // skip confirmation email — first super_admin
      user_metadata: { full_name: ADMIN_NAME },
    })
    if (error) throw error
    authUid = data.user.id
    console.log(`Created Supabase Auth user: ${ADMIN_EMAIL} (${authUid})`)
  }

  // 2. Upsert our application user row with role=super_admin.
  const dbUser = await prisma.user.upsert({
    where: { supabase_uid: authUid },
    update: {
      email: ADMIN_EMAIL,
      full_name: ADMIN_NAME,
      role: 'super_admin',
      is_active: true,
    },
    create: {
      supabase_uid: authUid,
      email: ADMIN_EMAIL,
      full_name: ADMIN_NAME,
      role: 'super_admin',
      subject: [],
      is_active: true,
    },
  })
  console.log(`DB user row: id=${dbUser.id} role=${dbUser.role}`)
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
