/**
 * Seed: Class 9 CBSE · Maths · "I'm Up and Down, and Round and Round"
 *
 * Per-page processing via Gemini Vision + sharp for figure cropping:
 *   - Extracts questions with LaTeX math
 *   - For questions that have a diagram/figure, Gemini returns a bounding box;
 *     sharp crops ONLY that figure region and uploads it to Supabase Storage
 *   - Questions without figures get image_urls: []
 *   - Extracts the answer key from the answers PDF
 *
 * Idempotent: all 'class9-cbse-updown'-tagged questions are hard-deleted on
 * every run before fresh insert, so re-running is always safe.
 *
 * Run from D:\varenyam:
 *   node --env-file=.env.local scripts/seed-updown-chapter.mjs
 */

// ── DOMMatrix polyfill (must be before pdf-to-img dynamic import)
import DOMMatrixImpl from 'dommatrix'
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixImpl

import { PrismaClient } from '@prisma/client'
import { readFileSync }  from 'node:fs'
import { resolve }       from 'node:path'
import { randomUUID }    from 'node:crypto'
import sharp             from 'sharp'

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnvLocal() {
  let text
  try { text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8') } catch { return }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

// ── constants ─────────────────────────────────────────────────────────────────
const QUESTIONS_PDF  = resolve('C:/Users/HP/Downloads/up and down.pdf')
const ANSWERS_PDF    = resolve('C:/Users/HP/Downloads/answer.pdf')
const COURSE_NAME    = 'CBSE-Grade-9'
const SUBJECT_NAME   = 'Maths'
const CHAPTER_NAME   = "I'm Up and Down, and Round and Round"
const EXAM_TYPE      = 'school'
const IMPORT_TAG     = 'class9-cbse-updown'
const STORAGE_BUCKET = 'question-images'
const GEMINI_PACING_MS = 8000

// ── Gemini ────────────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models'

function lenientJsonParse(raw) {
  try { return JSON.parse(raw) } catch (orig) {
    const P = 'XBSPAIRX'
    const r = raw.replace(/\\\\/g, P).replace(/\\(?!["\/u])/g, '\\\\').replace(new RegExp(P, 'g'), '\\\\')
    try { return JSON.parse(r) } catch { throw orig }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function callGemini(imageBase64, prompt, callIndex) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  if (callIndex > 0) {
    process.stdout.write(`  (pacing ${GEMINI_PACING_MS / 1000}s) `)
    await sleep(GEMINI_PACING_MS)
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: 'image/png', data: imageBase64 } },
      { text: prompt },
    ]}],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.status === 429) { const d = await res.text().catch(() => ''); throw new Error(`Gemini 429 — quota exhausted: ${d.slice(0, 200)}`) }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      if (attempt === 0) { process.stdout.write(`\n    ${res.status} — retrying in 45s… `); await sleep(45_000); continue }
      throw new Error(`Gemini HTTP ${res.status} — overloaded; re-run in a minute`)
    }
    if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Gemini HTTP ${res.status}: ${d.slice(0, 300)}`) }
    const payload = await res.json()
    const text = payload.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text
    if (!text) throw new Error('Gemini returned no text part')
    return { text, tokens: payload.usageMetadata?.totalTokenCount ?? 0 }
  }
}

async function callGeminiPdf(pdfBuffer, prompt) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
      { text: prompt },
    ]}],
    generationConfig: { temperature: 0.1 },
  }
  process.stdout.write(`  → Gemini PDF… `)
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.status === 429) { const d = await res.text().catch(() => ''); throw new Error(`Gemini PDF HTTP 429: ${d.slice(0, 300)}`) }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      const backoffs = [15_000, 30_000, 60_000]
      const backoff = backoffs[attempt]
      if (!backoff) throw new Error(`Gemini PDF HTTP ${res.status} after all retries`)
      process.stdout.write(`${res.status}, retrying in ${backoff / 1000}s… `)
      await sleep(backoff); continue
    }
    if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Gemini PDF HTTP ${res.status}: ${d.slice(0, 300)}`) }
    const payload = await res.json()
    const text = payload.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text
    if (!text) throw new Error('Gemini returned no text part')
    console.log(`OK (${payload.usageMetadata?.totalTokenCount ?? '?'} tokens)`)
    return text
  }
}

// ── prompts ───────────────────────────────────────────────────────────────────

const QUESTIONS_PAGE_PROMPT = `
Extract every exam question visible in this page image. Return ONLY a JSON object:

{
  "questions": [
    {
      "question_no": 1,
      "question_body": "question text — ALL math in LaTeX: inline \\\\( ... \\\\), display \\\\[ ... \\\\]",
      "question_type": "mcq",
      "has_figure": false,
      "figure_bbox": null,
      "options": ["option A text", "option B text", "option C text", "option D text"]
    }
  ]
}

Rules:
- question_no: the integer printed before the question (1, 2, 3…). Required.
- Convert ALL mathematical notation to LaTeX. Inline: \\\\( ... \\\\)  Display: \\\\[ ... \\\\]
- has_figure: true ONLY if there is an actual diagram, graph, or geometric figure IMAGE
  printed alongside the question (not just text describing one).
- figure_bbox: when has_figure is true, give the bounding box of JUST the diagram/figure
  as [left, top, right, bottom] where each value is a decimal 0.0–1.0 fraction of the
  full page width/height. Be precise — crop tightly around the figure, not the whole question.
  Set to null when has_figure is false.
- question_body: describe the figure briefly in text if present (e.g. "Figure: circle with
  centre O, radius 5 cm"). Do NOT embed image URLs.
- question_type: "mcq" when 4 options (A/B/C/D) are visible, "subjective" otherwise.
- options: exactly 4 strings for MCQ (preserve A→B→C→D order). Empty [] for non-MCQ.
- SKIP: page headers, footers, instructions, section headings.
- ALL backslashes in JSON MUST be doubled: \\\\frac not \\frac, \\\\( not \\(.
`.trim()

const ANSWERS_PROMPT = `
Extract the complete answer key from this PDF. Return ONLY a JSON object (no markdown fences):

{"answers": [{"q": 1, "a": "B"}, {"q": 2, "a": "A"}]}

Rules: q = question number (integer), a = "A"/"B"/"C"/"D" only. SKIP headers and instructions.
`.trim()

// ── Supabase storage upload ───────────────────────────────────────────────────

function makeUploader(supabaseUrl, serviceKey) {
  const storageBase = `${supabaseUrl}/storage/v1`
  const publicBase  = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}`
  return async function uploadPng(storagePath, pngBuffer) {
    const res = await fetch(`${storageBase}/object/${STORAGE_BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: pngBuffer,
    })
    if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Storage upload HTTP ${res.status}: ${d.slice(0, 200)}`) }
    return `${publicBase}/${storagePath}`
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient()

async function main() {
  console.log('═══ Seed (figure-crop): Class 9 CBSE · "I\'m Up and Down, and Round and Round" ═══\n')

  // 1. Load PDFs
  console.log('Loading PDFs…')
  const questionsBuf = readFileSync(QUESTIONS_PDF)
  const answersBuf   = readFileSync(ANSWERS_PDF)
  console.log(`  questions: ${(questionsBuf.length / 1024).toFixed(0)} KB`)
  console.log(`  answers  : ${(answersBuf.length   / 1024).toFixed(0)} KB`)

  // 2. Taxonomy
  console.log('\nLooking up taxonomy…')
  const course = await prisma.course.findFirst({ where: { name: COURSE_NAME, deleted_at: null } })
  if (!course) throw new Error(`Course "${COURSE_NAME}" not found`)
  const subject = await prisma.subject.findFirst({ where: { name: SUBJECT_NAME, course_id: course.id, deleted_at: null } })
  if (!subject) throw new Error(`Subject "${SUBJECT_NAME}" not found`)
  const chapter = await prisma.chapter.findFirst({ where: { name: CHAPTER_NAME, subject_id: subject.id, deleted_at: null } })
  if (!chapter) throw new Error(`Chapter "${CHAPTER_NAME}" not found`)
  console.log(`  ✓ ${course.name} / ${subject.name} / ${chapter.name}`)

  // 3. Render PDF pages
  console.log('\nRendering questions PDF pages…')
  const { pdf } = await import('pdf-to-img')
  const GEMINI_INLINE_LIMIT = 5 * 1024 * 1024
  const doc = await pdf(questionsBuf, { scale: 2 })
  console.log(`  total pages: ${doc.length}`)

  const pages = []
  for (let pageNo = 1; pageNo <= doc.length; pageNo++) {
    let pngBuf = await doc.getPage(pageNo)
    if (pngBuf.length > GEMINI_INLINE_LIMIT) {
      const docLow = await pdf(questionsBuf, { scale: 1.5 })
      try { pngBuf = await docLow.getPage(pageNo) } finally { await docLow.destroy() }
    }
    pages.push({ pageNo, pngBuf })
  }
  await doc.destroy()
  console.log(`  rendered ${pages.length} page(s)`)

  // 4. Storage uploader
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars missing')
  const uploadPng = makeUploader(supabaseUrl, serviceKey)

  // 5. Answer key
  console.log('\nExtracting answer key from answers PDF…')
  const answersRaw  = await callGeminiPdf(answersBuf, ANSWERS_PROMPT)
  const answersData = lenientJsonParse(answersRaw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim())
  const answerKey   = new Map()
  for (const e of (answersData?.answers ?? [])) {
    const a = String(e.a ?? '').trim().toUpperCase()
    if (typeof e.q === 'number' && ['A','B','C','D'].includes(a)) answerKey.set(e.q, a)
  }
  console.log(`  ✓ ${answerKey.size} answers in key`)

  // 6. Per-page extraction with figure cropping
  console.log('\nProcessing pages…')
  // question_no → { body, type, options, figureImageUrl }
  const allExtracted = new Map()
  let geminiCallIdx = 0
  let totalTokens   = 0
  let figuresFound  = 0

  for (const { pageNo, pngBuf } of pages) {
    process.stdout.write(`  Page ${pageNo}/${pages.length}: `)

    // Get page dimensions for bbox calculations
    const { width: pageW, height: pageH } = await sharp(pngBuf).metadata()

    let pageText, pageTokens
    try {
      const r = await callGemini(pngBuf.toString('base64'), QUESTIONS_PAGE_PROMPT, geminiCallIdx++)
      pageText   = r.text
      pageTokens = r.tokens
      totalTokens += pageTokens
    } catch (e) {
      console.log(`Gemini failed — ${e.message}`)
      continue
    }

    let parsed
    try {
      const cleaned = pageText.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim()
      parsed = lenientJsonParse(cleaned)
    } catch {
      console.log('JSON parse failed — skipping page')
      continue
    }

    const pageQuestions = Array.isArray(parsed?.questions) ? parsed.questions : []
    let pageFigures = 0

    for (const q of pageQuestions) {
      if (typeof q.question_no !== 'number' || q.question_no <= 0) continue
      const body = typeof q.question_body === 'string' ? q.question_body.trim() : ''
      if (!body) continue

      let figureImageUrl = null

      // Crop and upload figure only if Gemini detected one with a valid bbox
      if (q.has_figure && Array.isArray(q.figure_bbox) && q.figure_bbox.length === 4) {
        const [lf, tf, rf, bf] = q.figure_bbox.map(Number)
        const isValid = [lf, tf, rf, bf].every(v => !isNaN(v) && v >= 0 && v <= 1) && rf > lf && bf > tf

        if (isValid) {
          const PAD = 8  // pixels padding around the cropped figure
          const left   = Math.max(0, Math.round(lf * pageW) - PAD)
          const top    = Math.max(0, Math.round(tf * pageH) - PAD)
          const right  = Math.min(pageW, Math.round(rf * pageW) + PAD)
          const bottom = Math.min(pageH, Math.round(bf * pageH) + PAD)
          const width  = right - left
          const height = bottom - top

          try {
            const croppedBuf = await sharp(pngBuf)
              .extract({ left, top, width, height })
              .png()
              .toBuffer()

            const storagePath = `questions/${IMPORT_TAG}/q${q.question_no}-fig-${randomUUID().slice(0, 8)}.png`
            figureImageUrl = await uploadPng(storagePath, croppedBuf)
            pageFigures++
            figuresFound++
          } catch (cropErr) {
            console.warn(`\n    Q${q.question_no} crop failed: ${cropErr.message}`)
          }
        }
      }

      allExtracted.set(q.question_no, {
        body,
        type: q.question_type ?? 'subjective',
        options: Array.isArray(q.options) ? q.options : [],
        figureImageUrl,
      })
    }

    console.log(`${pageQuestions.length} questions, ${pageFigures} figures (${pageTokens} tokens)`)
  }

  console.log(`\n  Total extracted : ${allExtracted.size} questions`)
  console.log(`  Figures found   : ${figuresFound}`)
  console.log(`  Total tokens    : ${totalTokens}`)

  // 7. Find or create topic
  const TOPIC_NAME = `${CHAPTER_NAME} — Practice MCQs`
  let topic = await prisma.topic.findFirst({ where: { name: TOPIC_NAME, chapter_id: chapter.id, deleted_at: null } })
  if (!topic) {
    topic = await prisma.topic.create({ data: { name: TOPIC_NAME, chapter_id: chapter.id } })
    console.log(`\n  ✓ Created topic: ${TOPIC_NAME}`)
  } else {
    console.log(`\n  ✓ Found topic: ${TOPIC_NAME}`)
  }

  // 8. Hard-delete existing tagged questions
  const existing = await prisma.question.findMany({ where: { tags: { has: IMPORT_TAG } }, select: { id: true } })
  if (existing.length > 0) {
    console.log(`\nDeleting ${existing.length} existing questions (tag: ${IMPORT_TAG})…`)
    const ids = existing.map(q => q.id)
    await prisma.questionTaxonomy.deleteMany({ where: { question_id: { in: ids } } })
    await prisma.question.deleteMany({ where: { id: { in: ids } } })
    console.log('  ✓ Deleted')
  }

  // 9. Insert in question_no order
  console.log('\nInserting questions…')
  const sortedNos = Array.from(allExtracted.keys()).sort((a, b) => a - b)
  let inserted = 0, answersMatched = 0, withFigures = 0, skipped = 0

  await prisma.$transaction(async (tx) => {
    for (const qNo of sortedNos) {
      const q = allExtracted.get(qNo)
      if (!q?.body) { skipped++; continue }

      const answerLetter  = answerKey.get(qNo) ?? null
      const correctOption = answerLetter ? [answerLetter] : []
      if (answerLetter) answersMatched++
      if (q.figureImageUrl) withFigures++

      const isMcq = q.type === 'mcq' && q.options.length >= 4

      const created = await tx.question.create({
        data: {
          subject:        'Maths',
          question_type:  isMcq ? 'mcq' : 'subjective',
          difficulty:     'medium',
          marks_correct:  1,
          marks_negative: 0,
          question_body:  q.body,
          ...(isMcq ? {
            option_a: String(q.options[0] ?? ''),
            option_b: String(q.options[1] ?? ''),
            option_c: String(q.options[2] ?? ''),
            option_d: String(q.options[3] ?? ''),
          } : {}),
          correct_option: correctOption,
          image_urls:     q.figureImageUrl ? [q.figureImageUrl] : [],
          tags:           [IMPORT_TAG],
          is_verified:    correctOption.length > 0,
        },
      })
      await tx.questionTaxonomy.create({
        data: {
          question_id: created.id,
          course_id:   course.id,
          subject_id:  subject.id,
          chapter_id:  chapter.id,
          topic_id:    topic.id,
          exam_type:   EXAM_TYPE,
        },
      })
      inserted++
    }
  }, { maxWait: 10_000, timeout: 120_000 })

  console.log('\n═══ Done ═══')
  console.log(`  Questions inserted : ${inserted}`)
  console.log(`  Answers matched    : ${answersMatched}`)
  console.log(`  With figure images : ${withFigures}`)
  console.log(`  Skipped            : ${skipped}`)

  if (inserted > 0 && answersMatched < inserted) {
    console.log(`\n  NOTE: ${inserted - answersMatched} question(s) have no answer in the key — review in Question Bank.`)
  }

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('\nFATAL:', e.message)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
