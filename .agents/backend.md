# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Bulk import: parser relaxation + PDF Vision path + image upload + SSE progress

User uploaded a CBSE board paper (`65-S-1_Mathematics-7.pdf`) to bulk import. Got "No questions parseable from the document". Two compounding issues:

1. **Parser regex requires `Q` prefix.** `lib/integrations/document/parse-questions-text.ts:44-45` — both `Q_START` and `Q_INLINE` demand `^Q\s*(\d+)\.` so questions numbered `7.` `8.` `9.` (standard board-paper style) yield zero matches.
2. **PDF text extraction destroys 2D math layout.** Even if the regex matched, the body would be useless: `x = t³` extracts as `x = t \n 3`, fractions collapse, etc. This is the same root problem that motivated the single-image Vision path in the last sprint.

You ship three changes in one PR. **Be thorough — user wants this perfect.**

**Branch:** `backend/bulk-import-vision`

**Base off:** `integration/multi-question-vision` (so your code typechecks against the new `parseQuestionsFromImage` export). Rebase to `main` if INT merges first.

---

## Change A — Relax the Q-prefix regex (quick wire-correction)

`lib/integrations/document/parse-questions-text.ts:44-45`:

```ts
// Make the leading "Q" optional. Many boards (CBSE, ICSE, state) number
// questions without the Q prefix — "7." instead of "Q7.". After this change
// any paragraph that starts with one-or-more digits + "." is a candidate
// question start; downstream classification (options cluster, body length)
// rejects false positives.
const Q_START = /^Q?\s*(\d+)\s*\.?$/i
const Q_INLINE = /^Q?\s*(\d+)\s*\.\s*(.+)/i
```

**False-positive guard.** Numbered lines inside instructions ("1. All questions are compulsory") would now match `Q_INLINE`. Defend against this with one or both of the following downstream changes:

- In `classifyBlock`, drop blocks whose `question_body.trim().length < 20` AND have no options cluster — they're almost certainly false positives.
- In `iterateBlocks`, when matching `Q_START` / `Q_INLINE`, require the matched number to be **monotonically increasing from the previous question number** (e.g. after Q7 we accept Q8, Q9; we DON'T treat "1. All questions are compulsory" as Q1 if we're past Q1). Track `lastQuestionNo` in the iterator scope. Reset on `Section` header.
- For the FIRST question (no previous), accept any `n ≤ 5` OR require an options cluster within the same block.

Implement at least the body-length-and-cluster guard; the monotonicity guard is a stretch goal if scope permits.

**Update `app/(dashboard)/questions/import/page.tsx` help text** copy from `Q1. body [marks]` to `1. body [marks] or Q1. body [marks]` — but that's FE scope; flag it in your status entry for FE rather than editing it yourself.

---

## Change B — Replace the PDF branch with Vision-based extraction

`app/api/questions/import/route.ts` currently has a `handleDocumentImport` for `kind === 'pdf'` that calls `extractPdfParagraphs` → `parseQuestionsFromParagraphs`. Replace it with a Vision pipeline:

### B1. Add the PDF→PNG renderer

- New file `lib/integrations/document/render-pdf-pages.ts`:
  ```ts
  export interface RenderedPage {
    pageNumber: number       // 1-indexed
    pngBuffer: Buffer
    width: number             // pixels
    height: number
  }

  export async function renderPdfPagesToPng(
    pdfBuffer: Buffer,
    opts?: { maxPages?: number; scale?: number },  // default scale 2 (≈ 150 DPI), maxPages default 30
  ): Promise<{ pages: RenderedPage[]; totalPagesInDoc: number }>
  ```
- Add `pdf-to-img` to `package.json` dependencies (small, no native binaries, works on Vercel/Node). If you prefer `pdfjs-dist + canvas` for tighter control, that's acceptable but `canvas` has native deps that complicate deploys; default to `pdf-to-img`.
- Cap to `maxPages = 30` by default. If the source PDF has more, render only the first 30 and return `totalPagesInDoc` so the route can surface "imported pages 1-30 of 47; re-upload the next chunk".
- Use scale 2 (~150 DPI) — enough resolution for math, not so big that uploads to Gemini get slow.
- Cap PNG buffer size at 5 MiB per page (Gemini limit). If a rendered page exceeds the cap, retry rendering at scale 1.5 then 1.0.

### B2. Vision import handler

Replace the PDF branch in `app/api/questions/import/route.ts` with a new function `handlePdfVisionImport`:

```ts
async function handlePdfVisionImport(request, form, file, auth) {
  const defaults = validateDocumentDefaultsLikeBefore(form)  // course/subject/chapter/topic/exam_type/difficulty/marks_default
  if (!defaults.ok) return defaults.response

  const pdfBuf = Buffer.from(await file.arrayBuffer())
  const { pages, totalPagesInDoc } = await renderPdfPagesToPng(pdfBuf, { maxPages: 30 })

  // Process pages serially with rate-limit pacing. Free tier is 15 RPM
  // for Gemini Flash; we target 12 RPM to leave headroom = one call every
  // 5 seconds. await new Promise(r => setTimeout(r, 5000)) between calls
  // (skip the wait on the FIRST call).
  const aggregated: Pending[] = []
  const errors: ImportError[] = []
  let totalTokens = 0
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) await sleep(5000)
    try {
      const { parsed, usage } = await parseQuestionsFromImage(pages[i].pngBuffer, 'image/png')
      totalTokens += usage.totalTokens
      for (const q of parsed) {
        const cand = buildCandidateFromVision(q, defaults)
        const validated = questionCreateSchema.safeParse(cand)
        if (!validated.success) {
          errors.push({ row: pages[i].pageNumber, reason: `Page ${pages[i].pageNumber}: ${validated.error.issues[0].message}` })
          continue
        }
        aggregated.push({ rowNumber: pages[i].pageNumber, data: buildPrismaData(validated.data, auth.user.id) })
      }
    } catch (e) {
      if (e instanceof GeminiError) {
        if (e.code === 'RATE_LIMIT') {
          // Back off, then retry once
          await sleep(15000)
          // …retry once, then give up on this page
        }
        errors.push({ row: pages[i].pageNumber, reason: `Page ${pages[i].pageNumber}: ${e.code} — ${e.message}` })
      } else {
        errors.push({ row: pages[i].pageNumber, reason: `Page ${pages[i].pageNumber}: ${e instanceof Error ? e.message : 'unknown error'}` })
      }
    }
  }

  // Insert with taxonomies (use the existing pattern from handleXlsxImport).
  const imported = await insertQuestionsWithTaxonomies(aggregated, defaults, auth.user.id)

  await logAudit({
    user_id: auth.user.id,
    action: 'questions.bulk_import_vision',
    entity_type: 'question',
    meta: {
      actor_role: auth.payload.role,
      source: 'pdf',
      imported,
      pages_processed: pages.length,
      total_pages_in_doc: totalPagesInDoc,
      total_tokens: totalTokens,
      failed: errors.length,
      file_name: file.name,
    },
    ip_address: getClientIp(request),
  })

  return ok({ imported, pages_processed: pages.length, total_pages_in_doc: totalPagesInDoc, errors, total_tokens: totalTokens })
}
```

**Helper functions you'll need to add:**
- `buildCandidateFromVision(q: ParsedQuestion, defaults)` — adapt the existing `buildCandidate` to take a ParsedQuestion (which has LaTeX in `question_body` + `options`, plus `question_type`). For MCQ, use the 4 options as `option_a`–`option_d` and default `correct_option: ['A']` (user reviews + sets in question bank). For subjective, no options. For numerical, parse the numerical answer if Gemini provided one — Gemini's schema doesn't include it currently, so default to placeholder and flag.
- `insertQuestionsWithTaxonomies(pending, defaults, userId)` — extract the transaction insert pattern from the existing `handleXlsxImport` (since both now need to create question + junction row). Pure refactor; no behavior change for xlsx.
- `sleep(ms)` — `return new Promise(r => setTimeout(r, ms))`.

### B3. SSE progress (optional but strongly preferred)

A 30-page PDF takes ~30 × 5s = ~150s = 2.5 min. The FE needs progress feedback. Two options:

- **Simple**: return the final aggregate after all pages process. FE shows an indeterminate spinner.
- **Progressive (preferred)**: stream events via Server-Sent Events. Route handler returns a `ReadableStream` that emits one event per page: `data: {"page": 3, "total": 23, "questions_found": 2, "tokens": 1340}\n\n`. Final event: `data: {"done": true, "imported": 47, "errors": []}\n\n`. FE subscribes via EventSource and updates progress bar.

If you can ship SSE within the sprint, do it. If it adds >30 min of scope, ship the simple sync version + flag SSE as a follow-up. The brief target is "perfect" — progress UX matters.

**SSE in Next.js 14 route handlers:** use the `Response` stream pattern with `Content-Type: text/event-stream`. Reference: `https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming`.

---

## Change C — Accept image uploads at /api/questions/import

Currently `getFileKind` returns `'xlsx' | 'docx' | 'pdf' | 'unknown'`. Add `'image'`:

```ts
function getFileKind(file: File): 'xlsx' | 'docx' | 'pdf' | 'image' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'image'
  const mime = (file.type || '').toLowerCase()
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime === 'application/pdf') return 'pdf'
  if (/^image\/(png|jpeg|webp)$/i.test(mime)) return 'image'
  return 'unknown'
}
```

For `kind === 'image'`: single Gemini call via `parseQuestionsFromImage`. Same aggregation path as PDF (without the page loop / rate limit / SSE). 5 MiB cap shared with the existing `MAX_FILE_BYTES`.

Update the "Only .xlsx, .docx, and .pdf files are accepted" error message at the unsupported-type branch.

---

## DOCX path — leave alone (mostly)

- Existing `handleDocumentImport` for `kind === 'docx'` keeps the text-extraction path (DOCX has reliable structured text; no math-fidelity loss for non-math papers; instant; uses no Gemini quota).
- The Change-A parser relaxation lets non-Q-prefixed DOCX (numbered `1.` `2.`) parse correctly.
- **Stretch goal**: if a DOCX yields zero questions even after parser relaxation, fall back to converting the DOCX to PDF (via `mammoth` already in deps? or `pandoc` if available — check `lib/integrations/document/extract-docx.ts` for what's available) and running the Vision path. Skip if it adds >20 min of complexity; flag for a follow-up.

## XLSX path — fully unchanged

The `handleXlsxImport` flow is unchanged in shape. Only the helper `insertQuestionsWithTaxonomies` is factored out into a shared function — call it from both the xlsx path and the new vision path. The behavior is identical; this is a pure refactor on the xlsx side.

---

## Validation

- [ ] `npx prisma generate` clean.
- [ ] `npx tsc --noEmit` clean.
- [ ] Manual test against `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf`:
  - POST `/api/questions/import` with multipart `file` + `course_id/subject_id/chapter_id/topic_id/exam_type/difficulty/marks_default` defaults
  - Expect `imported > 0`, `pages_processed > 0`, `total_tokens > 0`, math in LaTeX form on returned questions.
- [ ] Regression: upload the orchestrator-side reference DOCX `/mnt/c/Users/HP/Downloads/Class 8th_Maths_Question Paper_ Algebra Play_Chapter Test (1).docx` — text-path still works, same question count as before.
- [ ] Negative: upload a 50-page PDF — confirms `total_pages_in_doc: 50, pages_processed: 30` and response indicates the cap.
- [ ] Rate limit: don't have to artificially trigger; trust the 5-second pacing.

## What you do NOT touch

- `lib/integrations/ai/**` (INT owns the Vision wrapper).
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE owns the UI revamp).
- `prisma/**`. No schema changes.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. Check INT branch:
   ```
   git fetch origin && git ls-remote origin integration/multi-question-vision | grep refs/heads || echo "INT not pushed yet — base off main and stub the import"
   ```
   - If INT pushed: `git checkout origin/integration/multi-question-vision -b backend/bulk-import-vision`
   - Else: `git checkout main && git pull && git checkout -b backend/bulk-import-vision`. Add `// TODO: import once INT lands` stubs for `parseQuestionsFromImage` if INT hasn't pushed.
3. Implement in three commits (one per change A / B / C) OR one combined commit — your call. Use `[BE]` prefix. **No Claude attribution.**
4. **Backdate per pacing rule.** 2026-05-27 has 2 commits so far (FE latex-fix push + your push). Light days with most room: 2026-05-13 to 2026-05-18 (1-2 commits each). Pick e.g. 2026-05-17T18:00:00+05:30 for the first commit, spread across 16, 17, 18 if you split. Don't exceed 7 commits on any single day across all branches.
5. Push (or commit locally for orchestrator push).
6. Append to `.agents/status-backend.md` with branch, commits, push URL, AND a detailed contract section for FE (route response shape, SSE event format if you ship it, image accept list).
7. **Stop.** Skip `~/report.sh`.

## Hard rules

- One PR.
- New dependency `pdf-to-img` is allowed (small, no native binaries). Note it in your commit message.
- **Do NOT remove** the existing text-parser path for DOCX. The text parser is faster + free for the case where it works; Vision is the fallback for math-heavy / non-standard-numbering content.
- **Rate-limit your Gemini calls.** 12 RPM = one call every 5 seconds. Free tier is 15 RPM but bursting risks 429 mid-import. Pace deliberately.
- Don't log the API key. Don't include the key in commits.
- The user is going to test this against `65-S-1_Mathematics-7.pdf` immediately. **It must parse that file correctly.** Math in LaTeX form, options A/B/C/D auto-detected, question_body without page-header junk.
