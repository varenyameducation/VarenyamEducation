// Vision-pipeline test for 65-S-1_Mathematics-7.pdf (opt-in path).
// Renders all pages of the PDF, calls INT's parseQuestionsFromImage on
// each (5s pacing), and prints the aggregated questions to confirm clean
// LaTeX math comes out the other side.
//
//   npx tsx --env-file=.env.local scripts/test-cbse-pdf-vision.ts

import { readFileSync } from 'node:fs'
import { renderPdfPagesToPng } from '../lib/integrations/document/render-pdf-pages'
import { parseQuestionsFromImage } from '../lib/integrations/ai/parse-questions-from-image'

const PDF = '/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf'

async function main() {
  const buf = readFileSync(PDF)
  console.log(`PDF bytes: ${buf.length}`)
  const rendered = await renderPdfPagesToPng(buf, { maxPages: 30 })
  console.log(`total pages: ${rendered.totalPagesInDoc}`)
  console.log(`rendered:    ${rendered.pages.length}`)
  for (const p of rendered.pages) {
    console.log(
      `  page ${p.pageNumber}: ${p.width}x${p.height} ${(p.pngBuffer.length / 1024).toFixed(1)}KiB scale=${p.scaleUsed}`,
    )
  }

  let totalTokens = 0
  for (let i = 0; i < rendered.pages.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 5000))
    const page = rendered.pages[i]
    console.log(`\n-- Page ${page.pageNumber} -> Gemini --`)
    const t0 = Date.now()
    try {
      const result = await parseQuestionsFromImage(page.pngBuffer, 'image/png')
      const dt = Date.now() - t0
      totalTokens += result.usage.totalTokens
      console.log(
        `  ${result.parsed.length} questions, ${result.usage.totalTokens} tokens, ${dt}ms`,
      )
      result.parsed.forEach((q, idx) => {
        console.log(
          `\n  Q${idx + 1} (${q.question_type}, correct_option=${JSON.stringify(q.correct_option)})`,
        )
        const body =
          q.question_body.length > 220 ? q.question_body.slice(0, 220) + '...' : q.question_body
        console.log(`    body: ${body}`)
        q.options.forEach((o, j) =>
          console.log(`        ${String.fromCharCode(65 + j)}: ${o.length > 100 ? o.slice(0, 100) + '...' : o}`),
        )
      })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      console.log(`  failure: ${err.code ?? '?'} — ${err.message ?? e}`)
    }
  }
  console.log(`\nTotal tokens: ${totalTokens}`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
