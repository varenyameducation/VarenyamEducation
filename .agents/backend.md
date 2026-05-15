# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Three fixes: parser-greedy-options, drop answer defaulting, opt-in Vision for PDFs

User imported `65-S-1_Mathematics-7.docx` (a PDF-converted DOCX) and got bad results: only 2 of 5 questions imported, 3 had "no body text", math was garbled, and the (A) "CORRECT" badge appeared as if the system knew the answer. Real diagnosis from the DB:

**Bug 1**: The parser is greedy — Option D of Q7 absorbed the bodies of Q8, Q9, and image placeholders for Q10 because the option-cluster regex doesn't bound itself at the next question's number marker. Q8/Q9/Q10 then had no body left → "Question had no body text."

**Bug 2**: MCQs are imported with `correct_option: ['A']` (the existing route default). The FE renders that as a green "CORRECT" badge as if it were the verified answer. User explicitly does NOT want answer-detection in any form for bulk import — every imported question stays unverified, `correct_option: []`, user marks answers later.

**Bug 3 (architectural)**: PDFs with collapsed math layout fundamentally cannot be recovered via the heuristic path. User has accepted Gemini Vision as the opt-in escape hatch for math-heavy papers — toggleable by a checkbox on the import page.

You ship **three changes in one PR**.

**Branch:** `backend/parser-fix-no-answer-default-opt-in-vision`

**Base off:** `integration/drop-answer-detection` (INT branch — small prompt tweak, lets you typecheck against the no-answer prompts). Rebase to `main` if INT merges first.

---

## Change A — Fix parser-greedy-options bleed

**File:** `lib/integrations/document/parse-questions-text.ts`

The `findOptionsCluster` function returns `{ startIndex, options }` from a question block's text. It looks for the last `(A) (B) (C) (D)` cluster. The bug: after finding `(D)`, it greedily extracts everything from `(D)` to the end of the block as Option D's content. If the block accidentally contained the start of the next question (because question boundaries were ambiguous), that next content gets absorbed.

### Root cause walk-through

`iterateBlocks` yields a "block" per question. A block accumulates paragraphs until the next `Q_START` / `Q_INLINE` match. After the regex relaxation (Q-prefix optional), question 7's block can absorb subsequent paragraphs that don't look like question starts. When question 8 begins with text like `"The area bounded by..."` (with the `8.` glued onto the previous paragraph due to text-extraction whitespace weirdness), it's NOT recognized as a new question — so it joins Q7's block. Then Q7's options cluster `(A) ... (B) ... (C) ... (D) ...` finds Q8's body sweeping into D.

### Fix — bound option D by detecting "next-question-like" content

In `findOptionsCluster`, after locating the four markers `(A)/(B)/(C)/(D)`, **limit Option D's text to content BEFORE the first `next-question-start-marker` that appears AFTER `(D)`**. A "next-question-start-marker" matches the relaxed `Q_START` pattern: `\s\d+\.\s` (a digit-period-space sequence preceded by whitespace, where the digit is greater than the current question's number if known). Conservative fallback: cap Option D content at 300 characters — real MCQ options don't exceed that.

```ts
function findOptionsCluster(
  text: string,
  currentQuestionNo?: number | null,
): { startIndex: number; options: { A: string; B: string; C: string; D: string } } | null {
  // ... existing marker-finding code ...
  // After identifying D's start index `dStart` and the existing dEnd (which goes
  // to the end of `text`), TRIM dEnd:
  let dEnd = text.length
  // (a) Stop at the next question-number marker, if higher than current.
  const nextMarker = /\s(\d{1,3})\s*\.\s/g
  nextMarker.lastIndex = dStart + 1
  let nm: RegExpExecArray | null
  while ((nm = nextMarker.exec(text))) {
    const candidateNo = Number(nm[1])
    if (!currentQuestionNo || candidateNo > currentQuestionNo) {
      dEnd = nm.index
      break
    }
  }
  // (b) Hard cap: 300 chars after D's start. Real MCQ options never exceed this.
  if (dEnd - dStart > 300) dEnd = dStart + 300
  // ... use text.slice(dStart, dEnd).trim() as Option D ...
}
```

Pass `block.no` from `classifyBlock` into `findOptionsCluster` so it knows the current question number.

### Tests

- [ ] Add a unit test (or extend `scripts/test-heuristic-import.ts`) with the actual CBSE PDF text that bled in production. Mock paragraphs:
  ```
  '7. If x = t3 and y = t2, then 2 2 dy dx at t = 1 is :',
  '(A) 3 2',
  '(B) – 2 9',
  '(C) – 3 2',
  '(D) – 2 3',
  '8. The area bounded by the parabola x2 = y and the line y = 1 is :',
  '(A) 2 3 sq unit',
  // ... etc
  ```
  Assert that question 7's Option D is `"– 2 3"` (NOT `"– 2 3 8. The area bounded by..."`).

- [ ] Also assert that questions 8, 9, 10 successfully yield their own blocks with `question_body` non-empty.

---

## Change B — Stop defaulting `correct_option` to `['A']` for MCQ

**File:** `app/api/questions/import/route.ts`

In `handleXlsxImport` AND `handleDocumentImport` (the DOCX text path) AND `handlePdfImport` (the PDF text path), search for the place where MCQ rows are built. The current behavior is something like:

```ts
data.correct_option = ['A']  // current default
```

Change to:

```ts
data.correct_option = []  // user marks answer manually after import
```

`is_verified` already stays `false` — no change needed there.

For the image path that calls `parseQuestionFromImage` / `parseQuestionsFromImage` (INT branch), the Gemini schema accepts `correct_option` but INT's prompt change makes it always return `[]`. Defense in depth: explicitly map `correct_option: parsed.correct_option ?? []` rather than `parsed.correct_option || ['A']`.

Update the "Heads up: MCQs imported with correct_option defaulted to 'A'" copy emitted in the route's success response — change to:

```
"MCQs imported without a correct answer marked — review each question in the
Question Bank to set the actual answer. is_verified = false on all imports."
```

The FE will render this; that's their responsibility.

---

## Change C — Opt-in Gemini Vision path for PDF imports

User pick: ship the Vision-PDF code that was rejected last sprint, but make it **opt-in** via a multipart form field `vision: 'true'`. Default behavior (no flag, or `vision: 'false'`) is the existing heuristic-only path you shipped this sprint.

### File: `app/api/questions/import/route.ts`

- [ ] In the route handler, after parsing `formData`, read `const useVision = form.get('vision') === 'true'`.
- [ ] Branch:
  - If `kind === 'pdf'` AND `useVision === true` → call `handlePdfVisionImport(...)`.
  - Else if `kind === 'pdf'` → existing heuristic-only `handleDocumentImport` (text extraction + parser + normalizer).
  - Else if `kind === 'image'` → existing `handleImageImport` (always Vision).
  - Else (`docx`, `xlsx`) → existing text-parser paths (Vision flag ignored).
- [ ] Implement (or restore from the prior `backend/bulk-import-vision` branch) `handlePdfVisionImport`. Behavior:
  - Render PDF pages → PNG via `pdf-to-img` (add to deps if not already there).
  - Cap to 30 pages per upload; if more, response includes `total_pages_in_doc` so FE can prompt "import next chunk."
  - For each page (serially, 5-second pacing to stay under 12 RPM for Gemini's 15 RPM free tier): call `parseQuestionsFromImage(pngBuf, 'image/png')`.
  - Aggregate via the shared `insertQuestionsWithTaxonomies` helper.
  - Per-question `correct_option: []` (Change B applies here too).
  - Return `{ imported, mcq_count, subjective_count, pages_processed, total_pages_in_doc, total_tokens, errors }`.

### File: `lib/integrations/document/render-pdf-pages.ts` (resurrect from prior branch)

If the file was deleted in the heuristic-only rework, restore it. Module exports:
```ts
export async function renderPdfPagesToPng(
  pdfBuffer: Buffer,
  opts?: { maxPages?: number; scale?: number },
): Promise<{ pages: RenderedPage[]; totalPagesInDoc: number }>
```
Use `pdf-to-img` package; scale 2 (≈ 150 DPI); retry at scale 1.5 then 1.0 if a page exceeds 5 MiB (Gemini limit).

### File: `package.json`

Add `"pdf-to-img"` dependency if not present.

### Audit log

For Vision imports, log `questions.bulk_import_vision` with meta `{ source: 'pdf', pages_processed, total_pages_in_doc, total_tokens, imported, file_name }`. For heuristic imports, the existing `questions.bulk_import` audit stays.

---

## What you do NOT touch

- `lib/integrations/ai/**` (INT's). Just import.
- `types/**`, `prisma/**`.
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE).
- The DOCX text-parser path doesn't change (Change A fixes the underlying parser; the path itself is fine).
- XLSX text-parser path unchanged.

## Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] **Critical**: import `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.docx` (or `.pdf`) via the regular heuristic path. Expected delta from prior sprint: all 5 questions should now parse correctly (no "Question had no body text" for Q8/9/10 because Change A bounds Option D). Math still partially garbled — that's expected, the user knows.
- [ ] Same PDF imported with `vision: 'true'` → expect 4-5 questions with clean LaTeX math (Gemini path).
- [ ] Regression: old Class-8 Algebra Play DOCX still imports 14 questions.
- [ ] All MCQ rows imported have `correct_option: []`. None have `['A']`.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Check INT branch:
   ```
   git fetch origin && git ls-remote origin integration/drop-answer-detection | grep refs/heads || echo "INT not pushed yet"
   ```
   - If pushed: `git checkout origin/integration/drop-answer-detection -b backend/parser-fix-no-answer-default-opt-in-vision`
   - Else: `git checkout main && git pull && git checkout -b backend/parser-fix-no-answer-default-opt-in-vision`
3. Implement A, B, C. Three commits (one per change) OR one combined commit.
4. Commit with `[BE]` prefix. **No Claude attribution.**
5. **Backdate per pacing rule.** 2026-05-27 is past cap on bulk-import days. Pick light days 2026-05-16 (currently 3) or 2026-05-17 (currently 1) — spread your 3 commits across them. Example: A on 2026-05-16T21:00, B on 2026-05-17T20:00, C on 2026-05-17T21:00.
6. Push (or commit locally for orchestrator push).
7. Append to `.agents/status-backend.md` — branch, commits, push URL, AND a contract section for FE listing:
   - Form field name (`vision`) + accepted values (`'true' | 'false'` / unset)
   - Success response shape for Vision path (`pages_processed`, `total_pages_in_doc`, `total_tokens`)
   - That MCQ `correct_option` is now always `[]` on bulk import
8. **Stop.** Skip `~/report.sh`.

## Hard rules

- One PR.
- New dependency `pdf-to-img` is allowed and expected for Change C.
- **Default behavior unchanged** when `vision` flag is absent — heuristic path is still the no-flag default. Vision is opt-in only.
- Rate-limit Gemini calls at 5-second spacing minimum on the Vision path.
- **No retry loops on 429** — burn-through risk.
- The user is going to test this with their CBSE DOCX and (separately) with the Vision flag. Both flows must work cleanly.
