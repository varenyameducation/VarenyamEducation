/**
 * Restore: re-inserts all 79 questions for "I'm Up and Down, and Round and Round"
 * using the whole-PDF Gemini approach (2 calls total — very quota-efficient).
 * No images attached — this is purely to recover text + answers in the DB.
 * Run figure extraction separately once quota allows.
 *
 * Run from D:\varenyam:
 *   node --env-file=.env.local scripts/seed-updown-restore.mjs
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync }  from 'node:fs'
import { resolve }       from 'node:path'

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
const GEMINI_MODEL   = 'gemini-2.5-flash-lite'
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models'

function lenientJsonParse(raw) {
  try { return JSON.parse(raw) } catch (orig) {
    const P = 'XBSPAIRX'
    const r = raw.replace(/\\\\/g, P).replace(/\\(?!["\/u])/g, '\\\\').replace(new RegExp(P, 'g'), '\\\\')
    try { return JSON.parse(r) } catch { throw orig }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
  for (let attempt = 0; attempt <= 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.status === 429) { const d = await res.text().catch(() => ''); throw new Error(`HTTP 429 quota exhausted: ${d.slice(0, 200)}`) }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      const waits = [20_000, 30_000, 60_000, 90_000]
      const wait = waits[attempt] ?? 90_000
      process.stdout.write(`${res.status}, wait ${wait/1000}s… `)
      await sleep(wait); continue
    }
    if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status}: ${d.slice(0, 300)}`) }
    const payload = await res.json()
    const text = payload.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text
    if (!text) throw new Error('No text in response')
    console.log(`OK (${payload.usageMetadata?.totalTokenCount ?? '?'} tokens)`)
    return text
  }
}

const QUESTIONS_PROMPT = `Extract ALL exam questions from this PDF. Return ONLY a JSON object:

{
  "questions": [
    {
      "question_no": 1,
      "question_body": "question text with ALL math as LaTeX: inline \\\\( ... \\\\), display \\\\[ ... \\\\]",
      "question_type": "mcq",
      "options": ["option A", "option B", "option C", "option D"]
    }
  ]
}

Rules:
- question_no: the integer before the question. Required.
- Convert ALL math to LaTeX. Inline: \\\\( ... \\\\)  Display: \\\\[ ... \\\\]
- question_type: "mcq" if 4 options visible, "subjective" otherwise.
- options: 4 strings for MCQ in A→D order. Empty [] otherwise.
- For questions referencing a figure/diagram, add a brief text description in question_body
  (e.g. "Figure: circle with centre O, chord PQ"). Do NOT embed image URLs.
- SKIP headers, footers, page numbers, instructions.
- ALL backslashes doubled in JSON: \\\\frac not \\frac`

const ANSWERS_PROMPT = `Extract the complete answer key from this PDF. Return ONLY JSON:
{"answers": [{"q": 1, "a": "B"}, ...]}
Rules: q = integer question number, a = "A"/"B"/"C"/"D" only. SKIP headers.`

const prisma = new PrismaClient()

async function main() {
  console.log('═══ Restore: "I\'m Up and Down, and Round and Round" (whole-PDF, 2 calls) ═══\n')

  const questionsBuf = readFileSync(QUESTIONS_PDF)
  const answersBuf   = readFileSync(ANSWERS_PDF)
  console.log(`questions PDF: ${(questionsBuf.length / 1024).toFixed(0)} KB`)
  console.log(`answers PDF  : ${(answersBuf.length   / 1024).toFixed(0)} KB\n`)

  // Taxonomy
  const course = await prisma.course.findFirst({ where: { name: COURSE_NAME, deleted_at: null } })
  if (!course) throw new Error(`Course "${COURSE_NAME}" not found`)
  const subject = await prisma.subject.findFirst({ where: { name: SUBJECT_NAME, course_id: course.id, deleted_at: null } })
  if (!subject) throw new Error(`Subject "${SUBJECT_NAME}" not found`)
  const chapter = await prisma.chapter.findFirst({ where: { name: CHAPTER_NAME, subject_id: subject.id, deleted_at: null } })
  if (!chapter) throw new Error(`Chapter "${CHAPTER_NAME}" not found`)
  console.log(`Taxonomy: ${course.name} / ${subject.name} / ${chapter.name}\n`)

  // Call 1: Extract all questions from questions PDF
  console.log('Call 1/2 — extracting questions from PDF…')
  process.stdout.write('  ')
  const questionsRaw = await callGeminiPdf(questionsBuf, QUESTIONS_PROMPT)
  const questionsData = lenientJsonParse(questionsRaw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim())
  const questions = Array.isArray(questionsData?.questions) ? questionsData.questions : []
  console.log(`  → ${questions.length} questions extracted\n`)

  if (questions.length === 0) throw new Error('No questions extracted — check the PDF path and Gemini response')

  // Pace between calls
  console.log('Pacing 10s between calls…')
  await sleep(10_000)

  // Call 2: Extract answer key
  console.log('Call 2/2 — extracting answer key…')
  process.stdout.write('  ')
  const answersRaw = await callGeminiPdf(answersBuf, ANSWERS_PROMPT)
  const answersData = lenientJsonParse(answersRaw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim())
  const answerKey = new Map()
  for (const e of (answersData?.answers ?? [])) {
    const a = String(e.a ?? '').trim().toUpperCase()
    if (typeof e.q === 'number' && ['A','B','C','D'].includes(a)) answerKey.set(e.q, a)
  }
  console.log(`  → ${answerKey.size} answers in key\n`)

  // Find/create topic
  const TOPIC_NAME = `${CHAPTER_NAME} — Practice MCQs`
  let topic = await prisma.topic.findFirst({ where: { name: TOPIC_NAME, chapter_id: chapter.id, deleted_at: null } })
  if (!topic) topic = await prisma.topic.create({ data: { name: TOPIC_NAME, chapter_id: chapter.id } })

  // Hard-delete existing
  const existing = await prisma.question.findMany({ where: { tags: { has: IMPORT_TAG } }, select: { id: true } })
  if (existing.length > 0) {
    console.log(`Deleting ${existing.length} existing questions…`)
    const ids = existing.map(q => q.id)
    await prisma.questionTaxonomy.deleteMany({ where: { question_id: { in: ids } } })
    await prisma.question.deleteMany({ where: { id: { in: ids } } })
  }

  // Insert
  console.log('Inserting…')
  let inserted = 0, answersMatched = 0

  await prisma.$transaction(async (tx) => {
    const sorted = [...questions].sort((a, b) => (a.question_no ?? 0) - (b.question_no ?? 0))
    for (const q of sorted) {
      if (typeof q.question_no !== 'number') continue
      const body = typeof q.question_body === 'string' ? q.question_body.trim() : ''
      if (!body) continue

      const answerLetter  = answerKey.get(q.question_no) ?? null
      const correctOption = answerLetter ? [answerLetter] : []
      if (answerLetter) answersMatched++
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
          image_urls:     [],
          tags:           [IMPORT_TAG],
          is_verified:    correctOption.length > 0,
        },
      })
      await tx.questionTaxonomy.create({
        data: { question_id: created.id, course_id: course.id, subject_id: subject.id, chapter_id: chapter.id, topic_id: topic.id, exam_type: EXAM_TYPE },
      })
      inserted++
    }
  }, { maxWait: 10_000, timeout: 120_000 })

  console.log('\n═══ Done ═══')
  console.log(`  Questions : ${inserted}`)
  console.log(`  Answers   : ${answersMatched}`)
  console.log(`  Images    : 0 (run seed-updown-chapter.mjs separately for figure images)`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('\nFATAL:', e.message)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
