import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { extractImagesZip } from '@/lib/integrations/excel/extract-images'
import {
  parseQuestionsExcel,
  type ParsedRow,
} from '@/lib/integrations/excel/parse-questions'
import { questionCreateSchema } from '@/lib/validation/question'

const MAX_XLSX_BYTES = 10 * 1024 * 1024 // 10MB per PRD §7.2
const MAX_ZIP_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'question-images'

const ALLOWED_EXCEL_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

function contentTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return CONTENT_TYPE_BY_EXT[filename.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
}

type ImportError = { row: number; reason: string }

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
  if (file.size > MAX_XLSX_BYTES) {
    return err(400, {
      code: 'FILE_TOO_LARGE',
      message: `File exceeds ${MAX_XLSX_BYTES / (1024 * 1024)}MB limit`,
    })
  }
  const isXlsxName = file.name.toLowerCase().endsWith('.xlsx')
  if (!ALLOWED_EXCEL_TYPES.has(file.type) && !isXlsxName) {
    return err(400, { code: 'INVALID_FILE_TYPE', message: 'Only .xlsx files are accepted' })
  }

  const images = form.get('images')
  let imagesFile: File | undefined
  if (images instanceof File && images.size > 0) {
    if (!images.name.toLowerCase().endsWith('.zip')) {
      return err(400, { code: 'INVALID_IMAGES_TYPE', message: 'Images bundle must be a .zip' })
    }
    if (images.size > MAX_ZIP_BYTES) {
      return err(400, {
        code: 'IMAGES_TOO_LARGE',
        message: `Images zip exceeds ${MAX_ZIP_BYTES / (1024 * 1024)}MB limit`,
      })
    }
    imagesFile = images
  }

  let parsed
  try {
    parsed = parseQuestionsExcel(Buffer.from(await file.arrayBuffer()))
  } catch {
    return err(400, { code: 'INVALID_XLSX', message: 'Could not read the .xlsx workbook' })
  }

  const errors: ImportError[] = [...parsed.errors]
  if (parsed.rows.length === 0) {
    return err(400, {
      code: 'NO_VALID_ROWS',
      message: 'Workbook had no parseable rows',
      details: { errors },
    })
  }

  let imagesMap = new Map<string, Buffer>()
  if (imagesFile) {
    try {
      imagesMap = await extractImagesZip(Buffer.from(await imagesFile.arrayBuffer()))
    } catch {
      return err(400, { code: 'INVALID_ZIP', message: 'Could not read the images .zip' })
    }
  }

  // Resolve taxonomy in batch — fetch every referenced course/chapter/topic name set once.
  const courseNames = new Set<string>()
  const chapterNames = new Set<string>()
  const topicNames = new Set<string>()
  for (const row of parsed.rows) {
    courseNames.add(row.course_name)
    chapterNames.add(row.chapter_name)
    topicNames.add(row.topic_name)
  }

  const [courses, chapters, topics] = await Promise.all([
    prisma.course.findMany({
      where: { deleted_at: null, name: { in: Array.from(courseNames) } },
      select: { id: true, name: true },
    }),
    prisma.chapter.findMany({
      where: { deleted_at: null, name: { in: Array.from(chapterNames) } },
      select: { id: true, name: true, course_id: true },
    }),
    prisma.topic.findMany({
      where: { deleted_at: null, name: { in: Array.from(topicNames) } },
      select: { id: true, name: true, chapter_id: true },
    }),
  ])

  const courseByName = new Map(courses.map((c) => [c.name, c.id]))
  const chapterByCourseAndName = new Map(
    chapters.map((c) => [`${c.course_id}::${c.name}`, c.id] as const),
  )
  const topicByChapterAndName = new Map(
    topics.map((t) => [`${t.chapter_id}::${t.name}`, t.id] as const),
  )

  type Pending = { rowNumber: number; data: Prisma.QuestionUncheckedCreateInput }
  const pending: Pending[] = []
  const uploadedPaths: string[] = []
  const supabase = imagesMap.size > 0 ? createSupabaseServerClient() : null

  for (let i = 0; i < parsed.rows.length; i++) {
    const row: ParsedRow = parsed.rows[i]
    const rowNumber = i + 2 // header is row 1

    const courseId = courseByName.get(row.course_name)
    if (!courseId) {
      errors.push({ row: rowNumber, reason: `Taxonomy not found: course "${row.course_name}"` })
      continue
    }
    const chapterId = chapterByCourseAndName.get(`${courseId}::${row.chapter_name}`)
    if (!chapterId) {
      errors.push({
        row: rowNumber,
        reason: `Taxonomy not found: chapter "${row.chapter_name}" under course "${row.course_name}"`,
      })
      continue
    }
    const topicId = topicByChapterAndName.get(`${chapterId}::${row.topic_name}`)
    if (!topicId) {
      errors.push({
        row: rowNumber,
        reason: `Taxonomy not found: topic "${row.topic_name}" under chapter "${row.chapter_name}"`,
      })
      continue
    }

    let imageUrls: string[] = []
    if (row.image_filename) {
      const key = row.image_filename.toLowerCase()
      const buf = imagesMap.get(key)
      if (!buf) {
        errors.push({
          row: rowNumber,
          reason: `Image "${row.image_filename}" not found in images.zip`,
        })
        continue
      }
      if (!supabase) {
        errors.push({ row: rowNumber, reason: 'Storage client unavailable' })
        continue
      }
      const path = `imports/${auth.user.id}/${randomUUID()}-${key}`
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, buf, { contentType: contentTypeFor(key), upsert: false })
      if (uploadErr) {
        errors.push({ row: rowNumber, reason: `Image upload failed: ${uploadErr.message}` })
        continue
      }
      uploadedPaths.push(path)
      imageUrls = [path]
    }

    const candidate = {
      ...row,
      course_id: courseId,
      chapter_id: chapterId,
      topic_id: topicId,
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
    }

    const validated = questionCreateSchema.safeParse(candidate)
    if (!validated.success) {
      const issue = validated.error.issues[0]
      const reason = issue
        ? `${issue.path.join('.') || '(row)'}: ${issue.message}`
        : 'validation failed'
      errors.push({ row: rowNumber, reason })
      continue
    }

    const v = validated.data
    const data: Prisma.QuestionUncheckedCreateInput = {
      course_id: v.course_id,
      chapter_id: v.chapter_id,
      topic_id: v.topic_id,
      subject: v.subject,
      question_type: v.question_type,
      difficulty: v.difficulty,
      exam_type: v.exam_type,
      marks_correct: v.marks_correct,
      marks_negative: v.marks_negative,
      question_body: v.question_body,
      created_by: auth.user.id,
      correct_option: [],
      image_urls: imageUrls,
      tags: [],
      ...(v.solution ? { solution: v.solution } : {}),
      ...(v.explanation ? { explanation: v.explanation } : {}),
      ...(v.hint ? { hint: v.hint } : {}),
    }

    if (v.question_type === 'mcq' || v.question_type === 'multi_select') {
      data.option_a = v.option_a
      data.option_b = v.option_b
      data.option_c = v.option_c
      data.option_d = v.option_d
      data.correct_option = v.correct_option
    } else if (v.question_type === 'numerical') {
      data.numerical_answer = v.numerical_answer
    } else if (v.question_type === 'matrix_match') {
      data.matrix_left = v.matrix_left as Prisma.InputJsonValue
      data.matrix_right = v.matrix_right as Prisma.InputJsonValue
      data.matrix_answer = v.matrix_answer as Prisma.InputJsonValue
    }

    pending.push({ rowNumber, data })
  }

  let imported = 0
  if (pending.length > 0) {
    try {
      const created = await prisma.$transaction(
        pending.map((p) => prisma.question.create({ data: p.data })),
      )
      imported = created.length
    } catch (e) {
      // Roll back any storage uploads to avoid orphaned objects.
      if (uploadedPaths.length > 0 && supabase) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths).catch(() => {})
      }
      const message = e instanceof Error ? e.message : 'unknown error'
      return err(500, {
        code: 'BULK_INSERT_FAILED',
        message: `Bulk insert failed; no rows imported (${message})`,
        details: { errors },
      })
    }
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'questions.bulk_import',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      imported,
      failed: errors.length,
      file_name: file.name,
      has_images: Boolean(imagesFile),
    },
    ip_address: getClientIp(request),
  })

  return ok({ imported, errors })
}
