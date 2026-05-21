import { type NextRequest } from 'next/server'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import { parseQuestionFromImage } from '@/lib/integrations/ai/parse-question-image'
import { GeminiError } from '@/lib/integrations/ai/gemini'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const EXT_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function resolveMime(file: File): 'image/png' | 'image/jpeg' | 'image/webp' | null {
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
  if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
    return err(400, {
      code: 'INVALID_FILE_TYPE',
      message: 'Only image/png, image/jpeg, or image/webp are accepted',
    })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let result: Awaited<ReturnType<typeof parseQuestionFromImage>>
  try {
    result = await parseQuestionFromImage(buffer, mimeType)
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.code === 'NO_KEY') {
        return err(400, {
          code: 'GEMINI_NOT_CONFIGURED',
          message:
            'Image parsing requires GEMINI_API_KEY in environment. Ask admin to configure.',
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
      // Gemini returned malformed JSON or schema-invalid JSON — surface as a
      // parse failure (500) so FE can show "couldn't read this image" rather
      // than an upstream-error tone. INT wraps Zod failures as BAD_RESPONSE
      // with a recognizable message prefix.
      const looksLikeParseFailure =
        e.code === 'BAD_RESPONSE' &&
        (e.message.includes('failed schema validation') ||
          e.message.includes('non-JSON text') ||
          e.message.includes('not valid JSON'))
      if (looksLikeParseFailure) {
        return err(500, {
          code: 'PARSE_FAILED',
          message:
            'Gemini returned a response we could not parse. Try a clearer image or different format.',
          details: { code: e.code, raw: e.message },
        })
      }
      return err(502, {
        code: 'GEMINI_FAILED',
        message: `Image parsing upstream failed: ${e.message}`,
        details: { code: e.code, status: e.status ?? null },
      })
    }
    const message = e instanceof Error ? e.message : 'unknown error'
    return err(500, {
      code: 'PARSE_FAILED',
      message: `Image parsing failed: ${message}`,
    })
  }

  const { parsed, usage } = result

  await logAudit({
    user_id: auth.user.id,
    action: 'question.parse_image',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      model: 'gemini-2.5-flash',
      total_tokens: usage.totalTokens,
      question_type: parsed.question_type,
    },
    ip_address: getClientIp(request),
  })

  return ok({
    question_body: parsed.question_body,
    question_type: parsed.question_type,
    options: parsed.options,
    correct_option: parsed.correct_option,
    usage: { total_tokens: usage.totalTokens },
  })
}
