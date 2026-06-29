import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

// Vercel's default function timeout is 10 s. PDF-Vision import does
// pdfjs-dist page rendering (~3-5 s cold start) plus N Gemini Vision
// calls paced 5 s apart (~8 s each), so even a 4-page paper easily
// blows past 10 s and Vercel returns a 500 HTML page that the FE shows
// as "Server returned non-JSON (HTTP 500)". DOCX multimodal Vision and
// single-image Vision are smaller but can still spike past 10 s on
// slow Gemini responses. 60 s is the Hobby plan ceiling and covers
// papers up to ~8 pages. Bump to 300 on Pro for larger papers.
export const maxDuration = 60
// Pin Node runtime — pdfjs-dist, pdf-to-img, puppeteer-core all need
// full Node APIs and would crash on edge.
export const runtime = 'nodejs'
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
import { extractDocx, type DocxImage } from '@/lib/integrations/document/extract-docx'
import { extractPdfParagraphs } from '@/lib/integrations/document/extract-pdf'
import {
  parseQuestionsFromParagraphs,
  type ParsedQuestion,
} from '@/lib/integrations/document/parse-questions-text'
import { normalizeMathToLatex } from '@/lib/integrations/document/normalize-math-to-latex'
import { parseQuestionsFromImage } from '@/lib/integrations/ai/parse-questions-from-image'
import { parseQuestionsFromDocxText } from '@/lib/integrations/ai/parse-questions-from-docx-text'
import { GeminiError } from '@/lib/integrations/ai/gemini'
import { extractAnswerKeyFromImage } from '@/lib/integrations/ai/extract-answer-key'
import {
  createDuplicateChecker,
  type DuplicateChecker,
} from '@/lib/integrations/similarity/duplicate-check'
import {
  extractLatexFromImage,
  type LatexExtractMime,
} from '@/lib/integrations/ai/extract-latex-from-image'
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

function getFileKind(
  file: File,
): 'xlsx' | 'docx' | 'pdf' | 'image' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'image'
  // Fall back to mime detection
  const mime = (file.type || '').toLowerCase()
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime === 'application/pdf') return 'pdf'
  if (/^image\/(png|jpeg|webp)$/i.test(mime)) return 'image'
  return 'unknown'
}

function imageMimeFromFile(file: File): 'image/png' | 'image/jpeg' | 'image/webp' {
  const declared = (file.type || '').toLowerCase()
  if (declared === 'image/png' || declared === 'image/jpeg' || declared === 'image/webp') {
    return declared
  }
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
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
      message:
        'Only .xlsx, .docx, .pdf, and image files (.png, .jpg, .jpeg, .webp) are accepted',
    })
  }

  // Opt-in Gemini Vision path for PDF imports. Default (no flag, or
  // 'false') is the heuristic text-extraction path — same as DOCX. Vision
  // is only triggered for PDF when the FE sends vision='true' alongside
  // the file (i.e. the "use AI for math-heavy PDF" checkbox).
  const useVision = form.get('vision') === 'true'

  if (kind === 'xlsx') {
    return handleXlsxImport(request, form, file, auth)
  }
  if (kind === 'image') {
    return handleImageImport(request, form, file, auth)
  }
  if (kind === 'pdf' && useVision) {
    return handlePdfVisionImport(request, form, file, auth)
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

  // Verify the taxonomy nodes exist and chain correctly. Chapter no longer
  // has a `course_id` column — it points at Subject which in turn points at
  // Course, so the course-membership check walks one extra hop.
  const [course, chapter, topic] = await Promise.all([
    prisma.course.findFirst({ where: { id: defaults.course_id, deleted_at: null } }),
    prisma.chapter.findFirst({
      where: { id: defaults.chapter_id, deleted_at: null },
      include: { subject: { select: { id: true, course_id: true } } },
    }),
    prisma.topic.findFirst({ where: { id: defaults.topic_id, deleted_at: null } }),
  ])
  if (!course) return err(400, { code: 'BAD_TAXONOMY', message: 'course_id not found' })
  if (!chapter || chapter.subject.course_id !== defaults.course_id) {
    return err(400, { code: 'BAD_TAXONOMY', message: 'chapter does not belong to course' })
  }
  if (!topic || topic.chapter_id !== defaults.chapter_id) {
    return err(400, { code: 'BAD_TAXONOMY', message: 'topic does not belong to chapter' })
  }
  const importSubjectId = chapter.subject.id

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

  let parsed = parseQuestionsFromParagraphs(paragraphs)
  let visionTextUsed = false
  let visionTextTokens = 0
  let visionTextError: { code: string; message: string } | null = null

  // Opt-in Gemini text reconstruction for DOCX. The heuristic can't recover
  // documents that lost question markers and got their math flattened
  // (typical of PDF→Word conversions). When the user ticks Vision on a
  // DOCX, send the raw paragraphs to Gemini Flash with a re-LaTeX prompt
  // and use its reconstructed questions instead of the heuristic's. If
  // Gemini fails (rate limit, parse error, network), we fall back to the
  // heuristic output we already have — so the flag never makes the import
  // worse than the default path — but the failure reason is surfaced in
  // the response envelope so the user knows why their import looks like
  // the old heuristic output.
  const useVisionTextForDocx = kind === 'docx' && form.get('vision') === 'true'
  let visionTextImagesAttached = 0
  if (useVisionTextForDocx) {
    try {
      const visionResult = await parseQuestionsFromDocxText(paragraphs, docxImages)
      visionTextTokens = visionResult.usage.totalTokens
      visionTextImagesAttached = visionResult.imagesAttached
      if (visionResult.parsed.length > 0) {
        parsed = {
          header: parsed.header,
          questions: visionResult.parsed,
          errors: [],
        }
        visionTextUsed = true
      } else {
        visionTextError = {
          code: 'EMPTY_RESPONSE',
          message:
            'Gemini returned zero questions from the DOCX text — falling back to heuristic parse.',
        }
      }
    } catch (e) {
      const code = e instanceof GeminiError ? e.code : 'UNKNOWN'
      const msg = e instanceof Error ? e.message : 'unknown error'
      visionTextError = { code, message: msg }
      console.warn(
        `[import] DOCX vision-text reconstruction failed (${code}): ${msg} — falling back to heuristic`,
      )
    }
  }

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

  // Opt-in Gemini Vision pass for embedded DOCX images. When the user
  // ticks "use AI" on the import page (form field vision='true') and
  // we're importing a DOCX, run each REFERENCED image (i.e. images that
  // any question_body actually points at via `[[IMG:filename]]`) through
  // the LaTeX-extraction prompt. If Gemini returns LaTeX, the placeholder
  // is replaced inline; if it returns the __DIAGRAM__ sentinel (real
  // figure), the placeholder stays as-is and the image renders normally.
  // Decorative header images that no question references are skipped to
  // save tokens.
  const latexByFilename = new Map<string, string>()
  let visionImagesProcessed = 0
  let visionImagesReplaced = 0
  const useVision = form.get('vision') === 'true'
  // Skip the per-image LaTeX pass when the multimodal text path already
  // saw the images inline — Gemini either inlined the math into the
  // reconstructed question_body OR deliberately kept the [[IMG:...]]
  // marker because the image is a non-math diagram. Re-running per-image
  // Vision would burn tokens and risk over-LaTeX-ing real diagrams.
  if (kind === 'docx' && useVision && !visionTextUsed && docxImages.length > 0) {
    const referencedFilenames = new Set<string>()
    const placeholderRe = /\[\[IMG:([^\]]+)\]\]/g
    for (const q of parsed.questions) {
      let m: RegExpExecArray | null
      while ((m = placeholderRe.exec(q.question_body))) {
        referencedFilenames.add(m[1])
      }
    }
    const geminiMimes: ReadonlySet<string> = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
    ])
    for (const img of docxImages) {
      if (!referencedFilenames.has(img.filename)) continue
      if (!geminiMimes.has(img.contentType)) continue
      visionImagesProcessed += 1
      try {
        const result = await extractLatexFromImage(
          img.data,
          img.contentType as LatexExtractMime,
        )
        if (result.isDiagram || result.text.length === 0) continue
        latexByFilename.set(img.filename, result.text)
        visionImagesReplaced += 1
      } catch (e) {
        // Per brief: a failed image doesn't fail the import. Keep the
        // original [[IMG:url]] placeholder so the user still sees the
        // screenshot, surface a non-fatal error for visibility.
        const code = e instanceof GeminiError ? e.code : 'UNKNOWN'
        const msg = e instanceof Error ? e.message : 'unknown error'
        errors.push({
          row: null,
          reason: `Vision extract failed for ${img.filename}: ${code} — ${msg}`,
        })
      }
    }
  }

  type Pending = {
    questionNo: number | null
    data: Prisma.QuestionUncheckedCreateInput
  }
  const pending: Pending[] = []
  let mcqCount = 0
  let subjectiveCount = 0
  let skippedDuplicates = 0

  // Pre-load existing questions in this course+chapter scope so we can
  // skip near-identical re-imports without hitting the DB per row. The
  // checker also dedupes within the current import (two identical
  // questions inside the same file get collapsed).
  const checkDuplicate = await createDuplicateChecker(prisma, {
    course_id: defaults.course_id,
    chapter_id: defaults.chapter_id,
  })

  for (const q of parsed.questions) {
    // Replace [[IMG:filename]] placeholders with [[IMG:<url>]] so the renderer
    // gets a direct URL, and collect those URLs into image_urls. When the
    // Vision pass produced LaTeX for a referenced image, that LaTeX replaces
    // the placeholder entirely (no URL emitted for that image).
    const { rewritten, urls } = rewriteImagePlaceholders(
      q.question_body,
      imageUrlByFilename,
      latexByFilename,
    )
    const qForCreate = { ...q, question_body: rewritten }
    const candidate = buildCandidate(qForCreate, defaults)
    // Apply the heuristic LaTeX normalizer to question_body and all MCQ
    // options. Idempotent — safe even if the source already contained
    // \(...\)-wrapped math.
    const normalized = {
      ...candidate,
      question_body: normalizeMathToLatex(candidate.question_body),
      ...('option_a' in candidate
        ? { option_a: normalizeMathToLatex(candidate.option_a) }
        : {}),
      ...('option_b' in candidate
        ? { option_b: normalizeMathToLatex(candidate.option_b) }
        : {}),
      ...('option_c' in candidate
        ? { option_c: normalizeMathToLatex(candidate.option_c) }
        : {}),
      ...('option_d' in candidate
        ? { option_d: normalizeMathToLatex(candidate.option_d) }
        : {}),
    }
    const validated = questionCreateSchema.safeParse(normalized)
    if (!validated.success) {
      const issue = validated.error.issues[0]
      errors.push({
        row: q.question_no,
        reason: `${issue.path.join('.') || '(question)'}: ${issue.message}`,
      })
      continue
    }
    const v = validated.data
    const dup = checkDuplicate(v.question_body)
    if (dup) {
      skippedDuplicates += 1
      errors.push({
        row: q.question_no,
        reason: formatDuplicateReason(dup),
      })
      continue
    }
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
          // Per product direction: never guess the correct answer on bulk
          // import. The user marks each MCQ's answer manually after
          // review. is_verified stays false so the QB flags it.
          correct_option: [],
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
              subject_id: importSubjectId,
              chapter_id: defaults.chapter_id,
              topic_id: defaults.topic_id,
              exam_type: defaults.exam_type,
            },
          })
          imported += 1
        }
      }, { maxWait: 10_000, timeout: 60_000 })
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
      vision_images_processed: visionImagesProcessed,
      vision_images_replaced: visionImagesReplaced,
      vision_text_used: visionTextUsed,
      vision_text_tokens: visionTextTokens,
      vision_text_images_attached: visionTextImagesAttached,
      vision_text_error: visionTextError?.code ?? null,
      skipped_duplicates: skippedDuplicates,
    },
    ip_address: getClientIp(request),
  })

  return ok({
    imported,
    mcq_count: mcqCount,
    subjective_count: subjectiveCount,
    errors,
    header: parsed.header,
    vision_images_processed: visionImagesProcessed,
    vision_images_replaced: visionImagesReplaced,
    vision_text_used: visionTextUsed,
    vision_text_tokens: visionTextTokens,
    vision_text_images_attached: visionTextImagesAttached,
    vision_text_error: visionTextError,
    skipped_duplicates: skippedDuplicates,
    note:
      'MCQs imported without a correct answer marked — review each question in the Question Bank to set the actual answer. is_verified = false on all imports.',
  })
}

function formatDuplicateReason(dup: {
  id: string
  question_body: string
  similarity: number
}): string {
  const sim = dup.similarity.toFixed(2)
  if (dup.id === '__in_run__') {
    return `Duplicate of an earlier row in this import (similarity ${sim}) — not imported. Delete the earlier duplicate or remove this row from the source file.`
  }
  const short = dup.id.slice(0, 8)
  return `Duplicate of existing question ${short}… (similarity ${sim}) — not imported. Delete the existing question first if you want to replace it.`
}

function rewriteImagePlaceholders(
  body: string,
  byFilename: Map<string, string>,
  latexByFilename?: Map<string, string>,
): { rewritten: string; urls: string[] } {
  const urls: string[] = []
  const rewritten = body.replace(/\[\[IMG:([^\]]+)\]\]/g, (full, filename: string) => {
    // Vision-extracted LaTeX takes precedence over the storage URL —
    // the image becomes inline math instead of a screenshot.
    if (latexByFilename) {
      const latex = latexByFilename.get(filename)
      if (latex) return latex
    }
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
      // Every bulk-import path produces correct_option: [] uniformly now
      // that the MCQ schema accepts an empty array.
      correct_option: [] as const,
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
    // Chapter no longer has course_id directly — pull it via subject so we
    // can still key the lookup on (course_id, chapter_name) for backward
    // compat with the existing xlsx schema (no subject_name column).
    prisma.chapter.findMany({
      where: { deleted_at: null, name: { in: Array.from(chapterNames) } },
      select: {
        id: true,
        name: true,
        subject_id: true,
        subject: { select: { course_id: true } },
      },
    }),
    prisma.topic.findMany({
      where: { deleted_at: null, name: { in: Array.from(topicNames) } },
      select: { id: true, name: true, chapter_id: true },
    }),
  ])

  const courseByName = new Map(courses.map((c) => [c.name, c.id]))
  const chapterByCourseAndName = new Map(
    chapters.map(
      (c) =>
        [
          `${c.subject.course_id}::${c.name}`,
          { id: c.id, subject_id: c.subject_id },
        ] as const,
    ),
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
      subject_id: string
      chapter_id: string
      topic_id: string
      exam_type: string
    }
  }
  const pending: Pending[] = []
  const uploadedPaths: string[] = []
  const supabase = imagesMap.size > 0 ? createSupabaseServerClient() : null
  let skippedDuplicates = 0

  // XLSX rows can target different course+chapter combos, so we lazy-build
  // a checker per unique scope and cache. For a 200-row sheet that all
  // points at the same chapter this is one DB query total; for a sheet
  // spread across 10 chapters it's 10.
  const dupCheckerByScope = new Map<string, DuplicateChecker>()
  async function getChecker(courseId: string, chapterId: string): Promise<DuplicateChecker> {
    const key = `${courseId}::${chapterId}`
    const cached = dupCheckerByScope.get(key)
    if (cached) return cached
    const checker = await createDuplicateChecker(prisma, {
      course_id: courseId,
      chapter_id: chapterId,
    })
    dupCheckerByScope.set(key, checker)
    return checker
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row: ParsedRow = parsed.rows[i]
    const rowNumber = i + 2

    const courseId = courseByName.get(row.course_name)
    if (!courseId) {
      errors.push({ row: rowNumber, reason: `Taxonomy not found: course "${row.course_name}"` })
      continue
    }
    const chapterHit = chapterByCourseAndName.get(`${courseId}::${row.chapter_name}`)
    if (!chapterHit) {
      errors.push({
        row: rowNumber,
        reason: `Taxonomy not found: chapter "${row.chapter_name}" under course "${row.course_name}"`,
      })
      continue
    }
    const chapterId = chapterHit.id
    const subjectId = chapterHit.subject_id
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

    // Normalize math notation. XLSX rows often have raw "x^2" style; this
    // makes them KaTeX-renderable without forcing the user to pre-LaTeX.
    type WithOptions = typeof candidate & {
      option_a?: string
      option_b?: string
      option_c?: string
      option_d?: string
    }
    const c2 = candidate as WithOptions
    const normalizedCandidate: WithOptions = {
      ...c2,
      question_body: normalizeMathToLatex(c2.question_body),
      ...(typeof c2.option_a === 'string'
        ? { option_a: normalizeMathToLatex(c2.option_a) }
        : {}),
      ...(typeof c2.option_b === 'string'
        ? { option_b: normalizeMathToLatex(c2.option_b) }
        : {}),
      ...(typeof c2.option_c === 'string'
        ? { option_c: normalizeMathToLatex(c2.option_c) }
        : {}),
      ...(typeof c2.option_d === 'string'
        ? { option_d: normalizeMathToLatex(c2.option_d) }
        : {}),
    }
    const validated = questionCreateSchema.safeParse(normalizedCandidate)
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

    const checkDup = await getChecker(courseId, chapterId)
    const dup = checkDup(v.question_body)
    if (dup) {
      skippedDuplicates += 1
      errors.push({ row: rowNumber, reason: formatDuplicateReason(dup) })
      continue
    }

    pending.push({
      rowNumber,
      data,
      taxonomy: {
        course_id: courseId,
        subject_id: subjectId,
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
      }, { maxWait: 10_000, timeout: 60_000 })
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
      skipped_duplicates: skippedDuplicates,
    },
    ip_address: getClientIp(request),
  })

  return ok({ imported, errors, skipped_duplicates: skippedDuplicates })
}

// ─── Image import (single Gemini Vision call) ───────────────────────────────

interface DocumentDefaults {
  course_id: string
  chapter_id: string
  topic_id: string
  subject: z.infer<typeof documentDefaultsSchema>['subject']
  subject_id: string
  difficulty: z.infer<typeof documentDefaultsSchema>['difficulty']
  exam_type: z.infer<typeof documentDefaultsSchema>['exam_type']
  marks_default: number
}

// Same defaults pattern as handleDocumentImport, extracted so the image
// handler can reuse it without duplicating chain-validation logic.
async function resolveDocumentDefaults(
  form: FormData,
): Promise<{ ok: true; defaults: DocumentDefaults } | { ok: false; response: ReturnType<typeof err> }> {
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
    return {
      ok: false,
      response: err(400, {
        code: 'INVALID_DEFAULTS',
        message: `Missing or invalid default: ${issue.path.join('.')} — ${issue.message}`,
      }),
    }
  }
  const d = defaultsParsed.data
  const [course, chapter, topic] = await Promise.all([
    prisma.course.findFirst({ where: { id: d.course_id, deleted_at: null } }),
    prisma.chapter.findFirst({
      where: { id: d.chapter_id, deleted_at: null },
      include: { subject: { select: { id: true, course_id: true } } },
    }),
    prisma.topic.findFirst({ where: { id: d.topic_id, deleted_at: null } }),
  ])
  if (!course) {
    return { ok: false, response: err(400, { code: 'BAD_TAXONOMY', message: 'course_id not found' }) }
  }
  if (!chapter || chapter.subject.course_id !== d.course_id) {
    return {
      ok: false,
      response: err(400, { code: 'BAD_TAXONOMY', message: 'chapter does not belong to course' }),
    }
  }
  if (!topic || topic.chapter_id !== d.chapter_id) {
    return {
      ok: false,
      response: err(400, { code: 'BAD_TAXONOMY', message: 'topic does not belong to chapter' }),
    }
  }
  return {
    ok: true,
    defaults: {
      course_id: d.course_id,
      chapter_id: d.chapter_id,
      topic_id: d.topic_id,
      subject: d.subject,
      subject_id: chapter.subject.id,
      difficulty: d.difficulty,
      exam_type: d.exam_type,
      marks_default: d.marks_default,
    },
  }
}

async function handleImageImport(
  request: NextRequest,
  form: FormData,
  file: File,
  auth: { user: { id: string }; payload: { role: string } },
) {
  const dr = await resolveDocumentDefaults(form)
  if (!dr.ok) return dr.response
  const defaults = dr.defaults

  // Gemini's inline-image cap is 5 MiB; the route's outer MAX_FILE_BYTES is
  // 20 MiB so guard separately.
  const GEMINI_IMAGE_BYTES = 5 * 1024 * 1024
  if (file.size > GEMINI_IMAGE_BYTES) {
    return err(400, {
      code: 'IMAGE_TOO_LARGE',
      message: `Image upload exceeds Gemini's ${GEMINI_IMAGE_BYTES / (1024 * 1024)} MiB cap`,
    })
  }

  const mimeType = imageMimeFromFile(file)
  const buf = Buffer.from(await file.arrayBuffer())

  let result: Awaited<ReturnType<typeof parseQuestionsFromImage>>
  try {
    result = await parseQuestionsFromImage(buf, mimeType)
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
      return err(502, {
        code: 'GEMINI_FAILED',
        message: `Image parsing upstream failed: ${e.message}`,
        details: { code: e.code, status: e.status ?? null },
      })
    }
    return err(500, {
      code: 'PARSE_FAILED',
      message: `Image parsing failed: ${e instanceof Error ? e.message : 'unknown'}`,
    })
  }

  type Pending = {
    rowNumber: number
    data: Prisma.QuestionUncheckedCreateInput
    taxonomy: {
      course_id: string
      subject_id: string
      chapter_id: string
      topic_id: string
      exam_type: string
    }
  }
  const pending: Pending[] = []
  const errors: ImportError[] = []
  let mcqCount = 0
  let subjectiveCount = 0
  let skippedDuplicates = 0

  const checkDuplicate = await createDuplicateChecker(prisma, {
    course_id: defaults.course_id,
    chapter_id: defaults.chapter_id,
  })

  for (let i = 0; i < result.parsed.length; i++) {
    const q = result.parsed[i]
    const marks = defaults.marks_default
    if (q.question_type === 'mcq' && q.options.length < 4) {
      errors.push({
        row: i + 1,
        reason: `Question ${i + 1}: MCQ returned ${q.options.length} options (need 4) — skipped`,
      })
      continue
    }
    const dup = checkDuplicate(q.question_body)
    if (dup) {
      skippedDuplicates += 1
      errors.push({ row: i + 1, reason: formatDuplicateReason(dup) })
      continue
    }
    let data: Prisma.QuestionUncheckedCreateInput
    if (q.question_type === 'mcq') {
      data = {
        subject: defaults.subject,
        question_type: 'mcq',
        difficulty: defaults.difficulty,
        marks_correct: marks,
        marks_negative: 0,
        question_body: q.question_body,
        created_by: auth.user.id,
        option_a: q.options[0],
        option_b: q.options[1],
        option_c: q.options[2],
        option_d: q.options[3],
        // Bulk import never guesses the correct answer; user marks it
        // manually after review. Even if Gemini surfaced a tick-marked
        // answer in the image (rare for blank papers), the FE shows the
        // imported question with no green-CORRECT badge until reviewed.
        correct_option: [],
        image_urls: [],
        tags: [],
        is_verified: false,
      }
      mcqCount += 1
    } else {
      // numerical and subjective both go in as subjective for now — Gemini's
      // schema doesn't extract numerical_answer, and forcing a placeholder
      // would create invisible bad data. Reviewer can convert in QB.
      data = {
        subject: defaults.subject,
        question_type: 'subjective',
        difficulty: defaults.difficulty,
        marks_correct: marks,
        marks_negative: 0,
        question_body:
          q.question_type === 'numerical'
            ? `[numerical — set answer in question bank] ${q.question_body}`
            : q.question_body,
        created_by: auth.user.id,
        correct_option: [],
        image_urls: [],
        tags: [],
        is_verified: false,
      }
      subjectiveCount += 1
    }
    const validated = questionCreateSchema.safeParse(data)
    if (!validated.success) {
      const issue = validated.error.issues[0]
      errors.push({
        row: i + 1,
        reason: `Question ${i + 1}: ${issue.path.join('.') || '(question)'} — ${issue.message}`,
      })
      if (data.question_type === 'mcq') mcqCount -= 1
      else subjectiveCount -= 1
      continue
    }
    pending.push({
      rowNumber: i + 1,
      data,
      taxonomy: {
        course_id: defaults.course_id,
        subject_id: defaults.subject_id,
        chapter_id: defaults.chapter_id,
        topic_id: defaults.topic_id,
        exam_type: defaults.exam_type,
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
      }, { maxWait: 10_000, timeout: 60_000 })
    } catch (e) {
      return err(500, {
        code: 'BULK_INSERT_FAILED',
        message: `Bulk insert failed; no rows imported (${e instanceof Error ? e.message : 'unknown'})`,
        details: { errors, total_tokens: result.usage.totalTokens },
      })
    }
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'questions.bulk_import',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      source: 'image',
      imported,
      mcq_count: mcqCount,
      subjective_count: subjectiveCount,
      total_tokens: result.usage.totalTokens,
      failed: errors.length,
      file_name: file.name,
      skipped_duplicates: skippedDuplicates,
    },
    ip_address: getClientIp(request),
  })

  return ok({
    imported,
    mcq_count: mcqCount,
    subjective_count: subjectiveCount,
    total_tokens: result.usage.totalTokens,
    errors,
    skipped_duplicates: skippedDuplicates,
    note:
      'MCQs imported without a correct answer marked — review each question in the Question Bank to set the actual answer. is_verified = false on all imports.',
  })
}

// ─── PDF Vision import (opt-in via vision='true' multipart flag) ────────────

// Target 12 RPM (free tier is 15 RPM); one call every 5 s leaves headroom.
const GEMINI_PACING_MS = 5000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handlePdfVisionImport(
  request: NextRequest,
  form: FormData,
  file: File,
  auth: { user: { id: string }; payload: { role: string } },
) {
  const dr = await resolveDocumentDefaults(form)
  if (!dr.ok) return dr.response
  const defaults = dr.defaults

  // Lazy-load so pdfjs-dist (via pdf-to-img) doesn't crash Next.js webpack
  // RSC at route-module load time. The non-Vision paths never touch this.
  const { renderPdfPagesToPng } = await import(
    '@/lib/integrations/document/render-pdf-pages'
  )

  let rendered: Awaited<ReturnType<typeof renderPdfPagesToPng>>
  try {
    rendered = await renderPdfPagesToPng(Buffer.from(await file.arrayBuffer()), {
      maxPages: 30,
    })
  } catch (e) {
    return err(400, {
      code: 'EXTRACTION_FAILED',
      message: `Could not render PDF pages: ${e instanceof Error ? e.message : 'unknown error'}`,
    })
  }

  // ── Optional answer-key extraction ──────────────────────────────────────
  // When the user uploads an answers PDF alongside the questions PDF, render
  // its pages and extract a question_no → correct-letter map. Failures are
  // non-fatal: we simply proceed with correct_option: [] as before.
  const answerKey = new Map<number, 'A' | 'B' | 'C' | 'D'>()
  const answersFileRaw = form.get('answers_file')
  if (answersFileRaw instanceof File && answersFileRaw.size > 0) {
    try {
      const answersRendered = await renderPdfPagesToPng(
        Buffer.from(await answersFileRaw.arrayBuffer()),
        { maxPages: 30 },
      )
      for (let ai = 0; ai < answersRendered.pages.length; ai++) {
        if (ai > 0) await sleep(GEMINI_PACING_MS)
        const pg = answersRendered.pages[ai]
        try {
          const partial = await extractAnswerKeyFromImage(pg.pngBuffer, 'image/png')
          for (const [qNo, letter] of partial) {
            if (!answerKey.has(qNo)) answerKey.set(qNo, letter)
          }
        } catch (e) {
          console.warn(
            `[import] answers PDF page ${pg.pageNumber} key extract failed: ${e instanceof Error ? e.message : 'unknown'}`,
          )
        }
      }
    } catch (e) {
      console.warn(
        `[import] answers PDF render failed (non-fatal): ${e instanceof Error ? e.message : 'unknown'}`,
      )
    }
  }

  type Pending = {
    rowNumber: number
    data: Prisma.QuestionUncheckedCreateInput
    taxonomy: {
      course_id: string
      subject_id: string
      chapter_id: string
      topic_id: string
      exam_type: string
    }
  }
  const pending: Pending[] = []
  const errors: ImportError[] = rendered.errors.map((e) => ({
    row: e.pageNumber,
    reason: `Page ${e.pageNumber}: ${e.reason}`,
  }))
  let totalTokens = 0
  let mcqCount = 0
  let subjectiveCount = 0
  let skippedDuplicates = 0
  let answersMatched = 0

  const checkDuplicate = await createDuplicateChecker(prisma, {
    course_id: defaults.course_id,
    chapter_id: defaults.chapter_id,
  })

  for (let i = 0; i < rendered.pages.length; i++) {
    const page = rendered.pages[i]
    // Pace Gemini calls. First call has no preceding wait.
    if (i > 0) await sleep(GEMINI_PACING_MS)

    let pageResult: Awaited<ReturnType<typeof parseQuestionsFromImage>>
    try {
      pageResult = await parseQuestionsFromImage(page.pngBuffer, 'image/png')
    } catch (e) {
      // Per brief: do NOT retry on rate-limit — burn-through risk. Just log
      // the page error and move on. Other GeminiError codes are similarly
      // surfaced per-page so a single bad page doesn't poison the run.
      if (e instanceof GeminiError) {
        errors.push({
          row: page.pageNumber,
          reason: `Page ${page.pageNumber}: ${e.code} — ${e.message}`,
        })
      } else {
        errors.push({
          row: page.pageNumber,
          reason: `Page ${page.pageNumber}: ${e instanceof Error ? e.message : 'unknown error'}`,
        })
      }
      continue
    }

    totalTokens += pageResult.usage.totalTokens
    for (const q of pageResult.parsed) {
      const marks = defaults.marks_default
      if (q.question_type === 'mcq' && q.options.length < 4) {
        errors.push({
          row: page.pageNumber,
          reason: `Page ${page.pageNumber}: MCQ returned ${q.options.length} options (need 4) — skipped`,
        })
        continue
      }
      const dup = checkDuplicate(q.question_body)
      if (dup) {
        skippedDuplicates += 1
        errors.push({ row: page.pageNumber, reason: formatDuplicateReason(dup) })
        continue
      }
      // Look up the correct answer from the optional answer key.
      // Prefer question_no from the parsed question; fall back to null
      // (correct_option stays [] when no answer key was supplied or no
      // match found).
      const qNo = q.question_no ?? null
      const correctLetter = qNo !== null ? (answerKey.get(qNo) ?? null) : null
      const correctOption = correctLetter ? [correctLetter] : []
      if (correctLetter) answersMatched += 1

      let data: Prisma.QuestionUncheckedCreateInput
      if (q.question_type === 'mcq') {
        data = {
          subject: defaults.subject,
          question_type: 'mcq',
          difficulty: defaults.difficulty,
          marks_correct: marks,
          marks_negative: 0,
          question_body: q.question_body,
          created_by: auth.user.id,
          option_a: q.options[0],
          option_b: q.options[1],
          option_c: q.options[2],
          option_d: q.options[3],
          correct_option: correctOption,
          image_urls: [],
          tags: [],
          is_verified: correctOption.length > 0,
        }
        mcqCount += 1
      } else {
        data = {
          subject: defaults.subject,
          question_type: 'subjective',
          difficulty: defaults.difficulty,
          marks_correct: marks,
          marks_negative: 0,
          question_body:
            q.question_type === 'numerical'
              ? `[numerical — set answer in question bank] ${q.question_body}`
              : q.question_body,
          created_by: auth.user.id,
          correct_option: correctOption,
          image_urls: [],
          tags: [],
          is_verified: correctOption.length > 0,
        }
        subjectiveCount += 1
      }
      const validated = questionCreateSchema.safeParse(data)
      if (!validated.success) {
        const issue = validated.error.issues[0]
        errors.push({
          row: page.pageNumber,
          reason: `Page ${page.pageNumber}: ${issue.path.join('.') || '(question)'} — ${issue.message}`,
        })
        if (data.question_type === 'mcq') mcqCount -= 1
        else subjectiveCount -= 1
        continue
      }
      pending.push({
        rowNumber: page.pageNumber,
        data,
        taxonomy: {
          course_id: defaults.course_id,
          subject_id: defaults.subject_id,
          chapter_id: defaults.chapter_id,
          topic_id: defaults.topic_id,
          exam_type: defaults.exam_type,
        },
      })
    }
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
      }, { maxWait: 10_000, timeout: 60_000 })
    } catch (e) {
      return err(500, {
        code: 'BULK_INSERT_FAILED',
        message: `Bulk insert failed; no rows imported (${e instanceof Error ? e.message : 'unknown'})`,
        details: { errors, total_tokens: totalTokens },
      })
    }
  }

  await logAudit({
    user_id: auth.user.id,
    action: 'questions.bulk_import_vision',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      source: 'pdf',
      imported,
      mcq_count: mcqCount,
      subjective_count: subjectiveCount,
      pages_processed: rendered.pages.length,
      total_pages_in_doc: rendered.totalPagesInDoc,
      total_tokens: totalTokens,
      failed: errors.length,
      file_name: file.name,
      skipped_duplicates: skippedDuplicates,
      answers_matched: answersMatched,
      has_answer_key: answerKey.size > 0,
    },
    ip_address: getClientIp(request),
  })

  const hasAnswerKey = answerKey.size > 0
  return ok({
    imported,
    mcq_count: mcqCount,
    subjective_count: subjectiveCount,
    pages_processed: rendered.pages.length,
    total_pages_in_doc: rendered.totalPagesInDoc,
    total_tokens: totalTokens,
    errors,
    skipped_duplicates: skippedDuplicates,
    answers_matched: hasAnswerKey ? answersMatched : undefined,
    note: hasAnswerKey
      ? answersMatched > 0
        ? `${answersMatched} MCQ answer${answersMatched === 1 ? '' : 's'} matched from the answers PDF and saved. Unmatched questions still need manual review in the Question Bank.`
        : 'Answers PDF was provided but no question numbers could be matched — check that question numbers in both PDFs match. Review answers manually in the Question Bank.'
      : rendered.totalPagesInDoc > rendered.pages.length
        ? `Imported pages 1–${rendered.pages.length} of ${rendered.totalPagesInDoc}; re-upload the rest as a follow-up. MCQs imported without a correct answer marked — review each in the Question Bank.`
        : 'MCQs imported without a correct answer marked — review each question in the Question Bank to set the actual answer. is_verified = false on all imports.',
  })
}
