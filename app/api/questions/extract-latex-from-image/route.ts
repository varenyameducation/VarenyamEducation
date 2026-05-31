// POST /api/questions/extract-latex-from-image
//
// Runs an uploaded solution/explanation image through Gemini Vision and
// returns the extracted math as LaTeX. The underlying helper
// (lib/integrations/ai/extract-latex-from-image.ts) already emits the
// delimiters the body splitter (lib/ui/render-body-html.ts) expects — inline
// math in \( ... \), display math in \[ ... \] — so we return its output
// verbatim, no wrapping needed. If the image has no extractable math (a plain
// diagram), the helper flags it and we return an empty `latex` string so FE
// appends nothing.
//
// PNG / JPEG / WebP only: the Gemini helper rejects other types (notably GIF),
// so we don't accept them here even though /upload-image does.

import { type NextRequest } from 'next/server'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import {
  extractLatexFromImage,
  type LatexExtractMime,
} from '@/lib/integrations/ai/extract-latex-from-image'
import { GeminiError } from '@/lib/integrations/ai/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_FILE_BYTES = 5 * 1024 * 1024
const EXT_MIME: Record<string, LatexExtractMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function resolveMime(file: File): LatexExtractMime | null {
  const declared = (file.type || '').toLowerCase()
  if (declared === 'image/png' || declared === 'image/jpeg' || declared === 'image/webp') {
    return declared
  }
  if (declared && declared !== 'application/octet-stream') return null
  const dot = file.name.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MIME[file.name.slice(dot + 1).toLowerCase()] ?? null
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

  const mimeType = resolveMime(file)
  if (!mimeType) {
    return err(400, {
      code: 'INVALID_FILE_TYPE',
      message: 'Only image/png, image/jpeg, or image/webp are accepted',
    })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let result: Awaited<ReturnType<typeof extractLatexFromImage>>
  try {
    result = await extractLatexFromImage(buffer, mimeType)
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.code === 'NO_KEY') {
        return err(400, {
          code: 'GEMINI_NOT_CONFIGURED',
          message:
            'LaTeX extraction requires GEMINI_API_KEY in environment. Ask admin to configure.',
        })
      }
      if (e.code === 'RATE_LIMIT') {
        return err(429, {
          code: 'RATE_LIMITED',
          message:
            'Gemini rate limit exceeded — try again in a few seconds (free tier is 15 requests/minute).',
          details: { code: e.code, status: e.status ?? null },
        })
      }
      return err(502, {
        code: 'GEMINI_FAILED',
        message: `LaTeX extraction upstream failed: ${e.message}`,
        details: { code: e.code, status: e.status ?? null },
      })
    }
    const message = e instanceof Error ? e.message : 'unknown error'
    return err(500, {
      code: 'EXTRACT_FAILED',
      message: `LaTeX extraction failed: ${message}`,
    })
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'question.extract_latex',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      total_tokens: result.usage.totalTokens,
      is_diagram: result.isDiagram,
    },
    ip_address: getClientIp(request),
  })

  // No math found (plain diagram) → empty latex so FE appends nothing.
  return ok({ latex: result.isDiagram ? '' : result.text })
}
