// Heuristic regression for 65-S-1_Mathematics-7.pdf (no Vision).
// Goal post-Change-A: questions 7-10 each yield a block with body, and
// option D for each is bounded (does not bleed into the next question).

import { readFileSync } from 'node:fs'
import { extractPdfParagraphs } from '../lib/integrations/document/extract-pdf'
import { parseQuestionsFromParagraphs } from '../lib/integrations/document/parse-questions-text'
import { normalizeMathToLatex } from '../lib/integrations/document/normalize-math-to-latex'

const PDF = '/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf'

async function main() {
  const paragraphs = await extractPdfParagraphs(readFileSync(PDF))
  console.log(`paragraphs: ${paragraphs.length}`)
  const parsed = parseQuestionsFromParagraphs(paragraphs)
  console.log(`questions: ${parsed.questions.length}`)
  console.log(`errors:    ${parsed.errors.length}`)
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i]
    const body = normalizeMathToLatex(q.question_body)
    const tag = q.kind === 'mcq' ? 'mcq' : 'subj'
    console.log(`\nQ${i + 1} (${tag}, no=${q.question_no})`)
    console.log(`  body: ${body.slice(0, 200)}`)
    if (q.kind === 'mcq') {
      console.log(`  A: ${normalizeMathToLatex(q.option_a)}`)
      console.log(`  B: ${normalizeMathToLatex(q.option_b)}`)
      console.log(`  C: ${normalizeMathToLatex(q.option_c)}`)
      console.log(`  D: ${normalizeMathToLatex(q.option_d)}`)
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
