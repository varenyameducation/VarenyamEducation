/**
 * Patch a single page of the updown chapter seed without deleting existing questions.
 * Usage: PAGE=2 node --env-file=.env.local scripts/seed-updown-patch-page.mjs
 */

import DOMMatrixImpl from 'dommatrix'
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixImpl

import { PrismaClient } from '@prisma/client'
import { readFileSync }  from 'node:fs'
import { resolve }       from 'node:path'
import { randomUUID }    from 'node:crypto'
import sharp             from 'sharp'

function loadEnvLocal() {
  let text
  try { text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8') } catch { return }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const PAGE_TO_PATCH  = Number(process.env.PAGE ?? '2')
const QUESTIONS_PDF  = resolve('C:/Users/HP/Downloads/up and down.pdf')
const ANSWERS_PDF    = resolve('C:/Users/HP/Downloads/answer.pdf')
const IMPORT_TAG     = 'class9-cbse-updown'
const STORAGE_BUCKET = 'question-images'
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

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const url = `${GEMINI_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } }),
    })
    if (res.status === 429) { const d = await res.text().catch(() => ''); throw new Error(`429: ${d.slice(0, 200)}`) }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      const wait = [30_000, 60_000, 90_000][attempt] ?? 90_000
      process.stdout.write(`${res.status} — wait ${wait/1000}s… `)
      await sleep(wait); continue
    }
    if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status}: ${d.slice(0, 200)}`) }
    const payload = await res.json()
    const text = payload.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text
    if (!text) throw new Error('No text in response')
    return { text, tokens: payload.usageMetadata?.totalTokenCount ?? 0 }
  }
}

const PAGE_PROMPT = `Extract every exam question visible in this page image. Return ONLY a JSON object:
{"questions":[{"question_no":1,"question_body":"text with LaTeX inline \\\\( ... \\\\), display \\\\[ ... \\\\]","question_type":"mcq","has_figure":false,"figure_bbox":null,"options":["A text","B text","C text","D text"]}]}
Rules:
- question_no: integer printed before the question. Required.
- Convert ALL math to LaTeX. Inline \\\\( ... \\\\) Display \\\\[ ... \\\\]
- has_figure: true ONLY if an actual diagram/graph/figure IMAGE appears alongside the question (not just text).
- figure_bbox: when has_figure=true, give [left,top,right,bottom] as 0.0-1.0 fractions of page width/height, tightly around the figure only. null otherwise.
- question_type: "mcq" if 4 A/B/C/D options visible, "subjective" otherwise.
- options: exactly 4 strings for MCQ, empty [] otherwise.
- SKIP headers, footers, instructions, section labels.
- ALL backslashes in JSON must be doubled: \\\\frac not \\frac`

const ANSWERS_PROMPT = `Extract the complete answer key. Return ONLY JSON:
{"answers":[{"q":1,"a":"B"},...]}
q = integer question number, a = "A"/"B"/"C"/"D" only. SKIP all non-answer content.`

const prisma = new PrismaClient()

async function main() {
  console.log(`═══ Patch page ${PAGE_TO_PATCH} · updown chapter ═══\n`)

  // Taxonomy
  const course  = await prisma.course.findFirst({  where: { name: 'CBSE-Grade-9', deleted_at: null } })
  const subject = await prisma.subject.findFirst({ where: { name: 'Maths', course_id: course.id, deleted_at: null } })
  const chapter = await prisma.chapter.findFirst({ where: { name: "I'm Up and Down, and Round and Round", subject_id: subject.id, deleted_at: null } })
  const topic   = await prisma.topic.findFirst({   where: { name: "I'm Up and Down, and Round and Round — Practice MCQs", chapter_id: chapter.id, deleted_at: null } })
  if (!course || !subject || !chapter || !topic) throw new Error('Taxonomy not found')

  // Existing question bodies for dedup
  const existing = await prisma.question.findMany({ where: { tags: { has: IMPORT_TAG } }, select: { question_body: true } })
  const existingBodies = new Set(existing.map(q => q.question_body.trim().slice(0, 100)))
  console.log(`Existing questions: ${existing.length}`)

  // Answer key from answers PDF
  console.log('Extracting answer key…')
  const answersBuf = readFileSync(ANSWERS_PDF)
  const { text: answersText } = await callGemini([
    { inline_data: { mime_type: 'application/pdf', data: answersBuf.toString('base64') } },
    { text: ANSWERS_PROMPT },
  ])
  const answersData = lenientJsonParse(answersText.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim())
  const answerKey = new Map()
  for (const e of (answersData?.answers ?? [])) {
    const a = String(e.a ?? '').trim().toUpperCase()
    if (typeof e.q === 'number' && ['A','B','C','D'].includes(a)) answerKey.set(e.q, a)
  }
  console.log(`  ${answerKey.size} answers in key`)

  // Pace before next call
  console.log('Pacing 10s…')
  await sleep(10_000)

  // Render target page
  console.log(`\nRendering page ${PAGE_TO_PATCH}…`)
  const questionsBuf = readFileSync(QUESTIONS_PDF)
  const { pdf } = await import('pdf-to-img')
  const doc = await pdf(questionsBuf, { scale: 2 })
  if (PAGE_TO_PATCH > doc.length) throw new Error(`PDF only has ${doc.length} pages`)
  const pngBuf = await doc.getPage(PAGE_TO_PATCH)
  await doc.destroy()
  console.log(`  ${(pngBuf.length / 1024).toFixed(0)} KB`)

  // Extract questions from page
  console.log(`\nExtracting questions from page ${PAGE_TO_PATCH}…`)
  const { text: pageText, tokens } = await callGemini([
    { inline_data: { mime_type: 'image/png', data: pngBuf.toString('base64') } },
    { text: PAGE_PROMPT },
  ])
  console.log(`  ${tokens} tokens`)
  const pageData = lenientJsonParse(pageText.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim())
  const pageQs = Array.isArray(pageData?.questions) ? pageData.questions : []
  console.log(`  ${pageQs.length} questions found`)

  // Supabase storage
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars missing')
  const { width: pageW, height: pageH } = await sharp(pngBuf).metadata()

  // Insert
  console.log('\nInserting…')
  let inserted = 0, skipped = 0

  for (const q of pageQs) {
    if (typeof q.question_no !== 'number' || q.question_no <= 0) { skipped++; continue }
    const body = typeof q.question_body === 'string' ? q.question_body.trim() : ''
    if (!body) { skipped++; continue }
    if (existingBodies.has(body.slice(0, 100))) { console.log(`  Q${q.question_no}: already exists — skip`); skipped++; continue }

    // Crop figure if present
    let figureImageUrl = null
    if (q.has_figure && Array.isArray(q.figure_bbox) && q.figure_bbox.length === 4) {
      const [lf, tf, rf, bf] = q.figure_bbox.map(Number)
      const isValid = [lf, tf, rf, bf].every(v => !isNaN(v) && v >= 0 && v <= 1) && rf > lf && bf > tf
      if (isValid) {
        try {
          const PAD    = 8
          const left   = Math.max(0, Math.round(lf * pageW) - PAD)
          const top    = Math.max(0, Math.round(tf * pageH) - PAD)
          const right  = Math.min(pageW, Math.round(rf * pageW) + PAD)
          const bottom = Math.min(pageH, Math.round(bf * pageH) + PAD)
          const croppedBuf = await sharp(pngBuf).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer()
          const path = `questions/${IMPORT_TAG}/q${q.question_no}-fig-${randomUUID().slice(0, 8)}.png`
          const up = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
            body: croppedBuf,
          })
          if (up.ok) { figureImageUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}` }
          else console.warn(`  Upload failed for Q${q.question_no}`)
        } catch (e) { console.warn(`  Crop failed for Q${q.question_no}: ${e.message}`) }
      }
    }

    const answerLetter  = answerKey.get(q.question_no) ?? null
    const correctOption = answerLetter ? [answerLetter] : []
    const isMcq = q.question_type === 'mcq' && Array.isArray(q.options) && q.options.length >= 4

    const created = await prisma.question.create({
      data: {
        subject: 'Maths', question_type: isMcq ? 'mcq' : 'subjective',
        difficulty: 'medium', marks_correct: 1, marks_negative: 0,
        question_body: body,
        ...(isMcq ? { option_a: String(q.options[0]??''), option_b: String(q.options[1]??''), option_c: String(q.options[2]??''), option_d: String(q.options[3]??'') } : {}),
        correct_option: correctOption, image_urls: figureImageUrl ? [figureImageUrl] : [],
        tags: [IMPORT_TAG], is_verified: correctOption.length > 0,
      },
    })
    await prisma.questionTaxonomy.create({
      data: { question_id: created.id, course_id: course.id, subject_id: subject.id, chapter_id: chapter.id, topic_id: topic.id, exam_type: 'school' },
    })
    console.log(`  Q${q.question_no}: ✓${answerLetter ? ` (ans: ${answerLetter})` : ''}${figureImageUrl ? ' [figure]' : ''}`)
    inserted++
  }

  const total = await prisma.question.count({ where: { tags: { has: IMPORT_TAG } } })
  console.log(`\n═══ Done ═══`)
  console.log(`  Inserted : ${inserted}  Skipped: ${skipped}  Total DB: ${total}`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('\nFATAL:', e.message)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
