// Manual integration smoke test for the bulk-import Vision pipeline.
// Renders the first 2 pages of the user-reported CBSE Class XII Maths
// board paper, then runs the multi-question Gemini parser against each.
// Confirms math becomes LaTeX and questions split correctly.
//
// Run:  npx tsx --env-file=.env.local scripts/test-pdf-vision-import.ts
//
// Not part of the test suite — leave in /scripts as a reference harness.

import { readFileSync } from 'node:fs'
import { renderPdfPagesToPng } from '../lib/integrations/document/render-pdf-pages'
import { parseQuestionsFromPageImage } from '../lib/integrations/document/parse-page-image'

const TARGET_PDF = '/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf'

async function main() {
  const pdfBuf = readFileSync(TARGET_PDF)
  console.log(`Loaded PDF: ${pdfBuf.length} bytes`)

  const rendered = await renderPdfPagesToPng(pdfBuf, { maxPages: 3 })
  console.log(`Total pages in doc: ${rendered.totalPagesInDoc}`)
  console.log(`Pages rendered: ${rendered.pages.length}`)
  for (const p of rendered.pages) {
    console.log(
      `  page ${p.pageNumber}: ${p.width}x${p.height} px, ${(p.pngBuffer.length / 1024).toFixed(1)} KiB, scale ${p.scaleUsed}`,
    )
  }
  for (const e of rendered.errors) {
    console.log(`  render error page ${e.pageNumber}: ${e.reason}`)
  }

  for (const page of rendered.pages.slice(0, 2)) {
    console.log(`\n-- Page ${page.pageNumber} -> Gemini --`)
    const t0 = Date.now()
    try {
      const result = await parseQuestionsFromPageImage(page.pngBuffer, 'image/png')
      const dt = Date.now() - t0
      console.log(`  ${result.questions.length} questions, ${result.usage.totalTokens} tokens, ${dt}ms`)
      result.questions.forEach((q, i) => {
        const body =
          q.question_body.length > 140 ? q.question_body.slice(0, 140) + '...' : q.question_body
        console.log(`    Q${i + 1} (${q.question_type}, marks ${q.marks ?? '?'}): ${body}`)
        if (q.options.length > 0) {
          q.options.slice(0, 4).forEach((o, j) => {
            const t = o.length > 80 ? o.slice(0, 80) + '...' : o
            console.log(`        ${String.fromCharCode(65 + j)}: ${t}`)
          })
        }
      })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      console.log(`  Gemini failure: ${err.code ?? '?'} -- ${err.message ?? e}`)
    }
    // Pace 5s between calls per route policy (12 RPM target).
    await new Promise((r) => setTimeout(r, 5000))
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
