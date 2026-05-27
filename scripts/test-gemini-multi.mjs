// Smoke test for lib/integrations/ai/parse-questions-from-image.ts (the multi-question
// variant used by bulk PDF/DOCX import). Verifies the Gemini wire (auth + transport
// + JSON shape) for the multi-question response. The logo PNG isn't a question page,
// so a healthy outcome is either an empty `parsed: []` or a Zod-fail GeminiError
// with the raw text — both prove the request reached Gemini and round-tripped.
// Auth or network errors mean the wire is broken.
//
// Run: node scripts/test-gemini-multi.mjs [path-to-image]
// Default image: public/brand/varenyam-logo-mark.png

import { readFileSync as readSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  try {
    const text = readSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    // .env.local optional; the helper will throw GeminiError('NO_KEY') if missing.
  }
}
loadEnvLocal()

const { parseQuestionsFromImage } = await import('../lib/integrations/ai/parse-questions-from-image.ts')

const imgPath = process.argv[2] ?? 'public/brand/varenyam-logo-mark.png'
const buf = readSync(resolve(process.cwd(), imgPath))
const mime = imgPath.endsWith('.jpg') || imgPath.endsWith('.jpeg')
  ? 'image/jpeg'
  : imgPath.endsWith('.webp')
    ? 'image/webp'
    : 'image/png'

console.log(`[smoke] ${imgPath} (${buf.length} bytes, ${mime})`)
try {
  const out = await parseQuestionsFromImage(buf, mime)
  console.log(`[smoke] parsed ${out.parsed.length} question(s); totalTokens=${out.usage.totalTokens}`)
  console.log(JSON.stringify(out, null, 2))
} catch (err) {
  console.log(`[smoke] ${err?.name ?? 'Error'} (${err?.code ?? '-'}): ${err?.message ?? err}`)
}
