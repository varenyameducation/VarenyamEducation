import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
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
import { extractDocx, extractDocxParagraphs, type DocxImage } from '@/lib/integrations/document/extract-docx'
import { extractPdfParagraphs } from '@/lib/integrations/document/extract-pdf'
import {
  parseQuestionsFromParagraphs,
  type ParsedQuestion,
} from '@/lib/integrations/document/parse-questions-text'
import { questionCreateSchema } from '@/lib/validation/question'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_ZIP_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'question-images'

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

const SUBJECT_VALUES = ['Physics', 'Chemistry', 'Maths', 'Biology'] as const
const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'advanced'] as const
const EXAM_TYPE_VALUES = ['school', 'board', 'jee', 'neet'] as const

const documentDefaultsSchema = z.object({
  course_id: z.string().uuid(),
  chapter_id: z.string().uuid(),
  topic_id: z.string().uuid(),
  subject: z.enum(SUBJECT_VALUES),
  difficulty: z.enum(DIFFICULTY_VALUES).default('medium'),
  exam_type: z.enum(EXAM_TYPE_VALUES).default('school'),
  marks_default: z.coerce.number().positive().default(1),
})

type ImportError = { row: number | null; reason: string }

function getFileKind(file: File): 'xlsx' | 'docx' | 'pdf' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pdf')) return 'pdf'
  // Fall back to mime detection
  const mime = (file.type || '').toLowerCase()
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime === 'application/pdf') return 'pdf'
  return 'unknown'
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

  const kind = getFileKind(file)
  if (kind === 'unknown') {
    return err(400, {
      code: 'INVALID_FILE_TYPE',
      message: 'Only .xlsx, .docx, and .pdf files are accepted',
    })
  }

  if (kind === 'xlsx') {
    return handleXlsxImport(request, form, file, auth)
  }
  return handleDocumentImport(request, form, file, kind, auth)
}

async function handleDocumentImport(
  request: NextRequest,
  form: FormData,
  file: File,
  kind: 'docx' | 'pdf',
  auth: { user: { id: string }; payload: { role: string } },
) {
  // Document imports need a defaults payload (course/chapter/topic/subject)
  // since the file itself doesn't carry structured taxonomy.
  const defaultsRaw = {
    course_id: form.get('course_id'),
    chapter_id: form.get('chapter_id'),
    topic_id: form.get('topic_id'),
    subject: form.get('subject'),
    difficulty: form.get('difficulty') ?? undefined,
    exam_type: form.get('exam_type') ?? undefined,
    marks_default: form.get('marks_default') ?? undefined,
  }
  const defaultsParsed = documentDefaultsSchema.safeParse(defaultsRaw)
  if (!defaultsParsed.success) {
    const issue = defaultsParsed.error.issues[0]
    return err(400, {
      code: 'INVALID_DEFAULTS',
      message: `Missing or invalid default: ${issue.path.join('.')} — ${issue.message}`,
    })
  }
  const defaults = defaultsParsed.data

  // Verify the taxonomy nodes exist and chain correctly.
  const [course, chapter, topic] = await Promise.all([
    prisma.course.findFirst({ where: { id: defaults.course_id, deleted_at: null } }),
    prisma.chapter.findFirst({ where: { id: defaults.chapter_id, deleted_at: null } }),
    prisma.topic.findFirst({ where: { id: defaults.topic_id, deleted_at: null } }),
  ])
  if (!course) return err(400, { code: 'BAD_TAXONOMY', message: 'course_id not found' })
  if (!chapter || chapter.course_id !== defaults.course_id) {
    return err(400, { code: 'BAD_TAXONOMY', message: 'chapter does not belong to course' })
  }
  if (!topic || topic.chapter_id !== defaults.chapter_id) {
    return err(400, { code: 'BAD_TAXONOMY', message: 'topic does not belong to chapter' })
  }

  let paragraphs: string[]
  let docxImages: DocxImage[] = []
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    if (kind === 'docx') {
      const full = await extractDocx(buf)
      paragraphs = full.paragraphs
      docxImages = full.images
    } else {
      paragraphs = await extractPdfParagraphs(buf)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'extraction failed'
    return err(400, {
      code: 'EXTRACTION_FAILED',
      message: `Could not read ${kind.toUpperCase()} file: ${msg}`,
    })
  }

  // Upload referenced images to Supabase Storage and build a filename→URL map.
  // Failures get logged + surfaced in the import response so it's obvious when
  // a bucket misconfiguration is silently dropping figures.
  const imageUrlByFilename = new Map<string, string>()
  const imageUploadErrors: ImportError[] = []
  if (docxImages.length > 0) {
    const supabase = createSupabaseServerClient()
    const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}`
    for (const img of docxImages) {
      const path = `imports/${auth.user.id}/${randomUUID()}-${img.filename}`
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, img.data, { contentType: img.contentType, upsert: false })
      if (upErr) {
        console.error(
          `[import] image upload failed for ${img.filename} → ${path}:`,
          upErr.message,
        )
        imageUploadErrors.push({
          row: null,
          reason: `Image "${img.filename}" upload failed: ${upErr.message}`,
        })
        continue
      }
      imageUrlByFilename.set(img.filename, `${publicBase}/${path}`)
    }
  }

  const parsed = parseQuestionsFromParagraphs(paragraphs)

  const errors: ImportError[] = [
    ...imageUploadErrors,
    ...parsed.errors.map((e) => ({
      row: e.question_no,
      reason: e.reason,
    })),
  ]

  if (parsed.questions.length === 0) {
    return err(400, {
      code: 'NO_QUESTIONS_FOUND',
      message: 'No questions were parseable from the document',
      details: { errors, header: parsed.header },
    })
  }

  type Pending = {
    questionNo: number | null
    data: Prisma.QuestionUncheckedCreateInput
  }
  const pending: Pending[] = []
  let mcqCount = 0
  let subjectiveCount = 0

  for (const q of parsed.questions) {
    // Replace [[IMG:filename]] placeholders with [[IMG:<url>]] so the renderer
    // gets a direct URL, and collect those URLs into image_urls.
    const { rewritten, urls } = rewriteImagePlaceholders(
      q.question_body,
      imageUrlByFilename,
    )
    const qForCreate = { ...q, question_body: rewritten }
    const candidate = buildCandidate(qForCreate, defaults)
    const validated = questionCreateSchema.safeParse(candidate)
    if (!validated.success) {
      const issue = validated.error.issues[0]
      errors.push({
        row: q.question_no,
        reason: `${issue.path.join('.') || '(question)'}: ${issue.message}`,
      })
      continue
    }
    const v = validated.data
    if (v.question_type === 'mcq') {
      mcqCount += 1
      pending.push({
        questionNo: q.question_no,
        data: {
          subject: v.subject,
          question_type: 'mcq',
          difficulty: v.difficulty,
          marks_correct: v.marks_correct,
          marks_negative: v.marks_negative,
          question_body: v.question_body,
          created_by: auth.user.id,
          option_a: (v as { option_a: string }).option_a,
          option_b: (v as { option_b: string }).option_b,
          option_c: (v as { option_c: string }).option_c,
          option_d: (v as { option_d: string }).option_d,
          correct_option: ['A'],
          image_urls: urls,
          tags: [],
          is_verified: false,
        },
      })
    } else if (v.question_type === 'subjective') {
      subjectiveCount += 1
      pending.push({
        questionNo: q.question_no,
        data: {
          subject: v.subject,
          question_type: 'subjective',
          difficulty: v.difficulty,
          marks_correct: v.marks_correct,
          marks_negative: v.marks_negative,
          question_body: v.question_body,
          created_by: auth.user.id,
          correct_option: [],
          image_urls: urls,
          tags: [],
          is_verified: false,
        },
      })
    }
  }

  let imported = 0
  if (pending.length > 0) {
    try {
      // Insert Question rows + 1 junction row per question, all in a single
      // transaction so neither half can land alone.
      await prisma.$transaction(async (tx) => {
        for (const p of pending) {
          const created = await tx.question.create({ data: p.data })
          await tx.questionTaxonomy.create({
            data: {
              question_id: created.id,
              course_id: defaults.course_id,
              chapter_id: defaults.chapter_id,
              topic_id: defaults.topic_id,
              exam_type: defaults.exam_type,
            },
          })
          imported += 1
        }
      })
    } catch (e) {
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
      source: kind,
      imported,
      mcq_count: mcqCount,
      subjective_count: subjectiveCount,
      failed: errors.length,
      file_name: file.name,
      detected_topic: parsed.header.topic ?? null,
    },
    ip_address: getClientIp(request),
  })

  return ok({
    imported,
    mcq_count: mcqCount,
    subjective_count: subjectiveCount,
    errors,
    header: parsed.header,
    note:
      'MCQs imported with correct_option defaulted to "A" — review and correct in the Question Bank. Subjective questions imported as descriptive (answer in dashboard).',
  })
}

function rewriteImagePlaceholders(
  body: string,
  byFilename: Map<string, string>,
): { rewritten: string; urls: string[] } {
  const urls: string[] = []
  const rewritten = body.replace(/\[\[IMG:([^\]]+)\]\]/g, (full, filename: string) => {
    const url = byFilename.get(filename)
    if (!url) return ''
    urls.push(url)
    return `[[IMG:${url}]]`
  })
  return { rewritten: rewritten.replace(/\s+/g, ' ').trim(), urls }
}

function buildCandidate(
  q: ParsedQuestion,
  defaults: z.infer<typeof documentDefaultsSchema>,
) {
  const marks = q.marks ?? defaults.marks_default
  const common = {
    subject: defaults.subject,
    difficulty: defaults.difficulty,
    marks_correct: marks,
    marks_negative: 0,
    question_body: q.question_body,
  }
  if (q.kind === 'mcq') {
    return {
      ...common,
      question_type: 'mcq' as const,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: ['A' as const],
    }
  }
  return {
    ...common,
    question_type: 'subjective' as const,
  }
}

// ─── Existing XLSX flow (preserved) ─────────────────────────────────────────

async function handleXlsxImport(
  request: NextRequest,
  form: FormData,
  file: File,
  auth: { user: { id: string }; payload: { role: string } },
) {
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

  type Pending = {
    rowNumber: number
    data: Prisma.QuestionUncheckedCreateInput
    // Junction row to attach to the question after insert. xlsx schema carries
    // exactly one tag per row; future iterations can extend to many.
    taxonomy: {
      course_id: string
      chapter_id: string
      topic_id: string
      exam_type: string
    }
  }
  const pending: Pending[] = []
  const uploadedPaths: string[] = []
  const supabase = imagesMap.size > 0 ? createSupabaseServerClient() : null

  for (let i = 0; i < parsed.rows.length; i++) {
    const row: ParsedRow = parsed.rows[i]
    const rowNumber = i + 2

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
      subject: v.subject,
      question_type: v.question_type,
      difficulty: v.difficulty,
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

    pending.push({
      rowNumber,
      data,
      taxonomy: {
        course_id: courseId,
        chapter_id: chapterId,
        topic_id: topicId,
        exam_type: row.exam_type,
      },
    })
  }

  let imported = 0
  if (pending.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const p of pending) {
          const created = await tx.question.create({ data: p.data })
          await tx.questionTaxonomy.create({
            data: { question_id: created.id, ...p.taxonomy },
          })
          imported += 1
        }
      })
    } catch (e) {
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
      source: 'xlsx',
      imported,
      failed: errors.length,
      file_name: file.name,
      has_images: Boolean(imagesFile),
    },
    ip_address: getClientIp(request),
  })

  return ok({ imported, errors })
}
