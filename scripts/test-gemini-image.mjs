// Smoke test for lib/integrations/ai/parse-question-image.ts.
// Verifies the Gemini wire (auth + transport + JSON shape). The logo PNG won't
// be a valid question, so a Zod-failed GeminiError('BAD_RESPONSE') with raw text
// in the message is a healthy outcome — it proves the request reached the model
// and came back with parseable JSON. Auth or network errors mean the wire is broken.
//
// Run: node scripts/test-gemini-image.mjs [path-to-image]
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
    // .env.local is optional; the helper itself will throw GeminiError('NO_KEY')
  }
}
loadEnvLocal()

const { parseQuestionFromImage } = await import('../lib/integrations/ai/parse-question-image.ts')

const imgPath = process.argv[2] ?? 'public/brand/varenyam-logo-mark.png'
const buf = readSync(resolve(process.cwd(), imgPath))
const mime = imgPath.endsWith('.jpg') || imgPath.endsWith('.jpeg')
  ? 'image/jpeg'
  : imgPath.endsWith('.webp')
    ? 'image/webp'
    : 'image/png'

console.log(`[smoke] ${imgPath} (${buf.length} bytes, ${mime})`)
try {
  const out = await parseQuestionFromImage(buf, mime)
  console.log('[smoke] parsed OK:', JSON.stringify(out, null, 2))
} catch (err) {
  console.log(`[smoke] ${err?.name ?? 'Error'} (${err?.code ?? '-'}): ${err?.message ?? err}`)
}
