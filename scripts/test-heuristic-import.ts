// Manual regression + sample-output capture for the heuristic import path.
//
//   npx tsx scripts/test-heuristic-import.ts
//
// 1. Class-8 Algebra DOCX — baseline regression. Should still produce N
//    questions like the prior verified-working import.
// 2. 65-S-1 CBSE PDF — capture sample output (the normalizer's best effort
//    on math-heavy PDF text where 2D layout has been flattened by
//    pdf-parse).
//
// Run from repo root. No env vars needed (no Gemini calls in either path).

import { readFileSync } from 'node:fs'
import { extractDocx } from '../lib/integrations/document/extract-docx'
import { extractPdfParagraphs } from '../lib/integrations/document/extract-pdf'
import { parseQuestionsFromParagraphs } from '../lib/integrations/document/parse-questions-text'
import { normalizeMathToLatex } from '../lib/integrations/document/normalize-math-to-latex'

const DOCX_PATH =
  '/mnt/c/Users/HP/Downloads/Class 8th_Maths_Question Paper_ Algebra Play_Chapter Test (1).docx'
const PDF_PATH = '/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf'

function summarize(label: string, paragraphs: string[]) {
  console.log(`\n## ${label}`)
  console.log(`  paragraphs: ${paragraphs.length}`)
  const parsed = parseQuestionsFromParagraphs(paragraphs)
  console.log(`  questions parsed: ${parsed.questions.length}`)
  console.log(`  parse errors:    ${parsed.errors.length}`)
  console.log(`  header: ${JSON.stringify(parsed.header)}`)
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i]
    const normalizedBody = normalizeMathToLatex(q.question_body)
    const tag = q.kind === 'mcq' ? 'mcq' : 'subj'
    console.log(
      `  Q${i + 1} (${tag}, no=${q.question_no}, sec=${q.section_label ?? '-'}, marks=${q.marks ?? '?'})`,
    )
    const bodyPreview =
      normalizedBody.length > 160 ? normalizedBody.slice(0, 160) + '...' : normalizedBody
    console.log(`     body: ${bodyPreview}`)
    if (q.kind === 'mcq') {
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d]
      opts.forEach((o, j) => {
        const norm = normalizeMathToLatex(o)
        const p = norm.length > 90 ? norm.slice(0, 90) + '...' : norm
        console.log(`     ${String.fromCharCode(65 + j)}: ${p}`)
      })
    }
  }
  for (const e of parsed.errors) {
    console.log(`  parse error: Q${e.question_no ?? '?'} — ${e.reason}`)
  }
  return parsed.questions.length
}

async function main() {
  const docxBuf = readFileSync(DOCX_PATH)
  console.log(`DOCX bytes: ${docxBuf.length}`)
  const docxExtract = await extractDocx(docxBuf)
  const docxN = summarize('Class 8 Algebra DOCX (regression baseline)', docxExtract.paragraphs)

  const pdfBuf = readFileSync(PDF_PATH)
  console.log(`\nPDF bytes: ${pdfBuf.length}`)
  const pdfPars = await extractPdfParagraphs(pdfBuf)
  const pdfN = summarize('65-S-1 CBSE Maths PDF (heuristic sample)', pdfPars)

  console.log('\n# Summary')
  console.log(`  DOCX questions: ${docxN}`)
  console.log(`  PDF  questions: ${pdfN}`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
