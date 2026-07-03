/**
 * Patch: inserts the missing questions from page 8 of the "I'm Up and Down,
 * and Round and Round" questions PDF.
 *
 * Uses at most 2 Gemini calls:
 *   1. Answer key from answers PDF (skipped gracefully if quota exhausted)
 *   2. Page 8 question extraction
 *
 * Does NOT delete existing questions — only adds question_nos not already in DB.
 *
 * Run from D:\varenyam:
 *   node --env-file=.env.local scripts/seed-updown-patch-page8.mjs
 */

import DOMMatrixImpl from 'dommatrix'
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixImpl

import { PrismaClient } from '@prisma/client'
import { readFileSync }  from 'node:fs'
import { resolve }       from 'node:path'
import { randomUUID }    from 'node:crypto'

function loadEnvLocal() {
  let text
  try { text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8') } catch { return }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const QUESTIONS_PDF  = resolve('C:/Users/HP/Downloads/up and down.pdf')
const ANSWERS_PDF    = resolve('C:/Users/HP/Downloads/answer.pdf')
const COURSE_NAME    = 'CBSE-Grade-9'
const SUBJECT_NAME   = 'Maths'
const CHAPTER_NAME   = "I'm Up and Down, and Round and Round"
const EXAM_TYPE      = 'school'
const IMPORT_TAG     = 'class9-cbse-updown'
const STORAGE_BUCKET = 'question-images'
const PAGE_TO_PATCH  = 8
const GEMINI_MODEL   = 'gemini-2.5-flash-lite'
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models'

function lenientJsonParse(raw) {
  try { return JSON.parse(raw) } catch (orig) {
    const PROTECT = 'XBSPAIRX'
    const repaired = raw
      .replace(/\\\\/g, PROTECT)
      .replace(/\\(?!["\/u])/g, '\\\\')
      .replace(new RegExp(PROTECT, 'g'), '\\\\')
    try { return JSON.parse(repaired) } catch { throw orig }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.1 },
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Gemini 429: ${detail.slice(0, 200)}`)
    }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      if (attempt === 0) { process.stdout.write(`${res.status} — retry in 20s… `); await sleep(20_000); continue }
      throw new Error(`Gemini ${res.status} after retry`)
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`)
    }
    const payload = await res.json()
    const text = payload.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text
    if (!text) throw new Error('No text in Gemini response')
    return { text, tokens: payload.usageMetadata?.totalTokenCount ?? 0 }
  }
}

const ANSWERS_PROMPT = `Extract the complete answer key from this PDF. Return ONLY a JSON object:
{"answers": [{"q": 1, "a": "B"}, {"q": 2, "a": "A"}]}
Rules: q = question number (integer), a = "A"/"B"/"C"/"D" only. SKIP headers/instructions.`

const PAGE_PROMPT = `Extract every exam question visible in this page image. Return ONLY a JSON object:
{"questions": [{"question_no": 1, "question_body": "text with LaTeX: inline \\\\( ... \\\\), display \\\\[ ... \\\\]", "question_type": "mcq", "has_figure": false, "options": ["A text","B text","C text","D text"]}]}
Rules:
- question_no: integer printed before the question. Required.
- Convert ALL math to LaTeX. Inline: \\\\( ... \\\\) Display: \\\\[ ... \\\\]
- has_figure: true if the question references a diagram/figure/graph.
- question_type: "mcq" if 4 options visible, "subjective" otherwise.
- options: exactly 4 strings for MCQ, empty [] otherwise.
- SKIP headers, footers, instructions.
- ALL backslashes doubled in JSON: \\\\frac not \\frac`

const prisma = new PrismaClient()

async function main() {
  console.log('═══ Patch: page 8 · "I\'m Up and Down, and Round and Round" ═══\n')

  // 1. Taxonomy
  const course = await prisma.course.findFirst({ where: { name: COURSE_NAME, deleted_at: null } })
  if (!course) throw new Error(`Course "${COURSE_NAME}" not found`)
  const subject = await prisma.subject.findFirst({ where: { name: SUBJECT_NAME, course_id: course.id, deleted_at: null } })
  if (!subject) throw new Error(`Subject "${SUBJECT_NAME}" not found`)
  const chapter = await prisma.chapter.findFirst({ where: { name: CHAPTER_NAME, subject_id: subject.id, deleted_at: null } })
  if (!chapter) throw new Error(`Chapter "${CHAPTER_NAME}" not found`)

  // 2. Check existing questions
  const existing = await prisma.question.findMany({
    where: { tags: { has: IMPORT_TAG } },
    select: { question_body: true },
  })
  console.log(`Existing questions in DB: ${existing.length}`)
  const existingBodies = new Set(existing.map(q => q.question_body.trim().slice(0, 100)))

  // 3. Extract answer key (attempt — not fatal if quota is exhausted)
  console.log('\nAttempting answer key extraction (1 Gemini call)…')
  const answerKey = new Map()
  try {
    const answersBuf = readFileSync(ANSWERS_PDF)
    const { text: answersText, tokens: aTokens } = await callGemini([
      { inline_data: { mime_type: 'application/pdf', data: answersBuf.toString('base64') } },
      { text: ANSWERS_PROMPT },
    ])
    const cleaned = answersText.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim()
    const data = lenientJsonParse(cleaned)
    for (const entry of (data?.answers ?? [])) {
      const a = String(entry.a ?? '').trim().toUpperCase()
      if (typeof entry.q === 'number' && ['A','B','C','D'].includes(a)) {
        answerKey.set(entry.q, a)
      }
    }
    console.log(`  ✓ ${answerKey.size} answers extracted (${aTokens} tokens)`)
  } catch (e) {
    if (e.message.includes('429')) {
      console.log('  ⚠ Quota exhausted — page 8 questions will be inserted without answers (can be fixed later)')
    } else {
      console.log(`  ⚠ Answer key failed: ${e.message} — continuing without answers`)
    }
  }

  // 4. Render page 8
  console.log(`\nRendering page ${PAGE_TO_PATCH}…`)
  const questionsBuf = readFileSync(QUESTIONS_PDF)
  const { pdf } = await import('pdf-to-img')
  const LIMIT = 5 * 1024 * 1024
  const doc = await pdf(questionsBuf, { scale: 2 })
  if (PAGE_TO_PATCH > doc.length) throw new Error(`PDF only has ${doc.length} pages`)
  let pngBuf = await doc.getPage(PAGE_TO_PATCH)
  if (pngBuf.length > LIMIT) {
    const docLow = await pdf(questionsBuf, { scale: 1.5 })
    try { pngBuf = await docLow.getPage(PAGE_TO_PATCH) } finally { await docLow.destroy() }
  }
  await doc.destroy()
  console.log(`  ${(pngBuf.length / 1024).toFixed(0)} KB`)

  // 5. Upload page PNG
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars missing')
  const storagePath = `seeds/${IMPORT_TAG}/page-${String(PAGE_TO_PATCH).padStart(3, '0')}-${randomUUID().slice(0, 8)}.png`
  console.log(`\nUploading page ${PAGE_TO_PATCH} PNG to storage…`)
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: pngBuf,
  })
  if (!uploadRes.ok) {
    const d = await uploadRes.text().catch(() => '')
    throw new Error(`Storage upload ${uploadRes.status}: ${d.slice(0, 200)}`)
  }
  const pageImageUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`
  console.log(`  ✓ ${storagePath}`)

  // 6. Wait before Gemini call if answer key was just extracted
  if (answerKey.size > 0) {
    process.stdout.write('\nPacing 8s before page extraction… ')
    await sleep(8_000)
    console.log('done')
  }

  // 7. Extract page 8 questions via Gemini
  console.log(`\nExtracting questions from page ${PAGE_TO_PATCH} via Gemini…`)
  const { text: pageText, tokens } = await callGemini([
    { inline_data: { mime_type: 'image/png', data: pngBuf.toString('base64') } },
    { text: PAGE_PROMPT },
  ])
  console.log(`  ✓ ${tokens} tokens`)
  const cleaned = pageText.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim()
  const parsed = lenientJsonParse(cleaned)
  const pageQuestions = Array.isArray(parsed?.questions) ? parsed.questions : []
  console.log(`  ✓ ${pageQuestions.length} questions found`)

  if (pageQuestions.length === 0) {
    console.log('\nNo questions found on page 8 — nothing to insert.')
    await prisma.$disconnect()
    return
  }

  // 8. Find/create topic
  const TOPIC_NAME = `${CHAPTER_NAME} — Practice MCQs`
  let topic = await prisma.topic.findFirst({ where: { name: TOPIC_NAME, chapter_id: chapter.id, deleted_at: null } })
  if (!topic) topic = await prisma.topic.create({ data: { name: TOPIC_NAME, chapter_id: chapter.id } })

  // 9. Insert new questions (skip duplicates)
  console.log('\nInserting…')
  let inserted = 0, skipped = 0

  await prisma.$transaction(async (tx) => {
    for (const q of pageQuestions) {
      if (typeof q.question_no !== 'number' || q.question_no <= 0) { skipped++; continue }
      const body = typeof q.question_body === 'string' ? q.question_body.trim() : ''
      if (!body) { skipped++; continue }
      if (existingBodies.has(body.slice(0, 100))) { console.log(`  Q${q.question_no}: duplicate — skip`); skipped++; continue }

      const answerLetter  = answerKey.get(q.question_no) ?? null
      const correctOption = answerLetter ? [answerLetter] : []
      const isMcq = q.question_type === 'mcq' && Array.isArray(q.options) && q.options.length >= 4

      const created = await tx.question.create({
        data: {
          subject:        'Maths',
          question_type:  isMcq ? 'mcq' : 'subjective',
          difficulty:     'medium',
          marks_correct:  1,
          marks_negative: 0,
          question_body:  body,
          ...(isMcq ? {
            option_a: String(q.options[0] ?? ''),
            option_b: String(q.options[1] ?? ''),
            option_c: String(q.options[2] ?? ''),
            option_d: String(q.options[3] ?? ''),
          } : {}),
          correct_option: correctOption,
          image_urls:     [pageImageUrl],
          tags:           [IMPORT_TAG],
          is_verified:    correctOption.length > 0,
        },
      })
      await tx.questionTaxonomy.create({
        data: { question_id: created.id, course_id: course.id, subject_id: subject.id, chapter_id: chapter.id, topic_id: topic.id, exam_type: EXAM_TYPE },
      })
      console.log(`  Q${q.question_no}: ✓${answerLetter ? ` (ans: ${answerLetter})` : ''}`)
      inserted++
    }
  }, { maxWait: 10_000, timeout: 60_000 })

  const total = await prisma.question.count({ where: { tags: { has: IMPORT_TAG } } })
  console.log(`\n═══ Done ═══`)
  console.log(`  Inserted : ${inserted}`)
  console.log(`  Skipped  : ${skipped}`)
  console.log(`  Total DB : ${total}`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('\nFATAL:', e.message)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
