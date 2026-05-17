// Manual heuristic regression for 65-S-1_Mathematics-7.docx.
// Goal: all 5 questions parse with non-empty bodies post-Change-A
// (Option D bound).
//
// Run:  npx tsx scripts/test-cbse-docx-import.ts

import { readFileSync } from 'node:fs'
import { extractDocx } from '../lib/integrations/document/extract-docx'
import { parseQuestionsFromParagraphs } from '../lib/integrations/document/parse-questions-text'
import { normalizeMathToLatex } from '../lib/integrations/document/normalize-math-to-latex'

const DOCX = '/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.docx'

async function main() {
  const buf = readFileSync(DOCX)
  console.log(`DOCX bytes: ${buf.length}`)
  const extract = await extractDocx(buf)
  console.log(`paragraphs: ${extract.paragraphs.length}`)
  const parsed = parseQuestionsFromParagraphs(extract.paragraphs)
  console.log(`questions: ${parsed.questions.length}`)
  console.log(`errors:    ${parsed.errors.length}`)
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i]
    const body = normalizeMathToLatex(q.question_body)
    const tag = q.kind === 'mcq' ? 'mcq' : 'subj'
    console.log(`\nQ${i + 1} (${tag}, no=${q.question_no})`)
    console.log(`  body: ${body.slice(0, 180)}${body.length > 180 ? '...' : ''}`)
    if (q.kind === 'mcq') {
      console.log(`  A: ${normalizeMathToLatex(q.option_a).slice(0, 100)}`)
      console.log(`  B: ${normalizeMathToLatex(q.option_b).slice(0, 100)}`)
      console.log(`  C: ${normalizeMathToLatex(q.option_c).slice(0, 100)}`)
      console.log(`  D: ${normalizeMathToLatex(q.option_d).slice(0, 100)}`)
    }
  }
  for (const e of parsed.errors) {
    console.log(`\nparse error: Q${e.question_no ?? '?'} — ${e.reason}`)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
