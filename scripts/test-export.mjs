#!/usr/bin/env node
// Manual smoke for the test-export pipeline. Requires a populated DB.
// Usage:
//   TEST_ID=<uuid> node scripts/test-export.mjs
//
// Writes /tmp/test.pdf and /tmp/test.docx and exits 0. The script intentionally
// has no fallback — run it from a shell where DATABASE_URL is set and the
// supabase env vars are available (otherwise lib/db/prisma + lib/export/branding
// will throw at import-time, which is what we want for a smoke test).

import { writeFile } from 'node:fs/promises'
import { generateTestPDF } from '../lib/export/pdf.ts'
import { generateTestDOCX } from '../lib/export/docx.ts'

const testId = process.env.TEST_ID
if (!testId) {
  console.error('Set TEST_ID=<uuid> before running.')
  process.exit(1)
}

const t0 = Date.now()
const pdf = await generateTestPDF(testId)
await writeFile('/tmp/test.pdf', pdf)
console.log(`PDF: ${pdf.length} bytes in ${Date.now() - t0} ms → /tmp/test.pdf`)

const t1 = Date.now()
const docx = await generateTestDOCX(testId)
await writeFile('/tmp/test.docx', docx)
console.log(`DOCX: ${docx.length} bytes in ${Date.now() - t1} ms → /tmp/test.docx`)
