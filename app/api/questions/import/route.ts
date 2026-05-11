import { type NextRequest } from 'next/server'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB per PRD §7.2
const ALLOWED_EXCEL_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

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
  const isXlsxName = file.name.toLowerCase().endsWith('.xlsx')
  if (!ALLOWED_EXCEL_TYPES.has(file.type) && !isXlsxName) {
    return err(400, { code: 'INVALID_FILE_TYPE', message: 'Only .xlsx files are accepted' })
  }

  const images = form.get('images')
  if (images instanceof File && images.size > 0 && !images.name.toLowerCase().endsWith('.zip')) {
    return err(400, { code: 'INVALID_IMAGES_TYPE', message: 'Images bundle must be a .zip' })
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'question.import.attempt',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      file_name: file.name,
      file_size: file.size,
      has_images: images instanceof File,
    },
    ip_address: getClientIp(request),
  })

  // TODO: wire to lib/integrations/excel once integration/question-import merges.
  // Expected:
  //   const parsed = await parseQuestionsExcel(file, { actorId: auth.user.id })
  //   const imagesMap = images instanceof File ? await extractImagesZip(images) : undefined
  //   const { imported, errors } = await persistQuestions(parsed, imagesMap, auth.user.id)
  //   return ok({ imported, errors })
  return err(503, {
    code: 'IMPORT_NOT_WIRED',
    message: 'Bulk import is not yet wired — pending lib/integrations/excel',
  })
}
