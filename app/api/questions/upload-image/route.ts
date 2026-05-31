// POST /api/questions/upload-image
//
// Server-side image upload for the question edit form. Replaces the old
// browser-direct `supabase.storage.upload(...)` call, which uploaded with the
// anon client and no Supabase Auth session (we use our own JWT cookie, not
// Supabase Auth) — so every upload was anonymous and hit RLS with "new row
// violates row-level security policy". Here we authenticate with our JWT via
// requireAuth, then upload with the service-role client (RLS bypass), exactly
// like the bulk-import path does.
//
// Returns just the storage `path` (e.g. "draft/<uuid>.png"); FE stores paths,
// not URLs — the path→signed-URL transform happens at render time elsewhere.

import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { err, ok } from '@/lib/api/response'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'question-images'
const MAX_FILE_BYTES = 5 * 1024 * 1024
// Mirrors components/questions/image-uploader.tsx ACCEPTED.
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return err(400, {
      code: 'INVALID_CONTENT_TYPE',
      message: 'Expected multipart/form-data with a "file" field',
    })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return err(400, { code: 'INVALID_FORM', message: 'Could not parse multipart body' })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return err(400, { code: 'FILE_REQUIRED', message: 'Field "file" is required' })
  }
  if (file.size === 0) {
    return err(400, { code: 'FILE_EMPTY', message: 'Uploaded file is empty' })
  }
  if (file.size > MAX_FILE_BYTES) {
    return err(400, {
      code: 'FILE_TOO_LARGE',
      message: `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB limit`,
    })
  }

  const mimeType = (file.type || '').toLowerCase()
  const ext = MIME_EXT[mimeType]
  if (!ext) {
    return err(400, {
      code: 'INVALID_FILE_TYPE',
      message: 'Only image/png, image/jpeg, image/webp, or image/gif are accepted',
    })
  }

  // Path namespacing matches the old browser uploader:
  // `${questionId ?? 'draft'}/${uuid}.${ext}` — so paths produced by both the
  // old and new code live in the same per-question (or 'draft') folder.
  const questionIdRaw = form.get('questionId')
  const questionId =
    typeof questionIdRaw === 'string' && questionIdRaw.trim() ? questionIdRaw.trim() : 'draft'
  const path = `${questionId}/${randomUUID()}.${ext}`

  const supabase = createSupabaseServerClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: false, contentType: mimeType })

  if (error) {
    return err(500, {
      code: 'UPLOAD_FAILED',
      message: `Image upload failed: ${error.message}`,
    })
  }

  return ok({ path })
}
