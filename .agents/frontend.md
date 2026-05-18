# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Import page revamp: 4-tier picker + image accept + Vision progress UI

User uploaded a CBSE math PDF for bulk import and hit "No questions parseable" — but the screenshot also revealed that the import page itself is using the **OLD 3-tier dropdown** (`Course / Chapter / Topic` with `Subject` as a hardcoded enum dropdown), not the 4-tier live-fetch picker the rest of the app uses. BE is rewriting the PDF import to use Gemini Vision per page + accepting image uploads + streaming progress via SSE. **Your job is to make the import page first-class:** live 4-tier hierarchy, accept image files, render the per-page Vision progress nicely, and surface partial-success / partial-failure clearly.

**Branch:** `frontend/import-page-revamp`

**Base off:** `backend/bulk-import-vision` so your typecheck sees the new route shape. Rebase to `main` if BE merges first.

---

## Fix 1 — Replace 3-tier dropdowns + hardcoded SUBJECTS with the 4-tier live picker

File: `app/(dashboard)/questions/import/page.tsx`

- Lines around 34 + 287-295: the `SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology']` constant and the corresponding `<Select>` for "Subject". **Delete both.**
- The current Course / Chapter / Topic dropdowns need to grow a Subject step between Course and Chapter. The cascade is:
  - Course (`GET /api/taxonomy/courses`)
  - Subject under selected course (`GET /api/taxonomy/subjects?course_id=...`)
  - Chapter under selected subject (`GET /api/taxonomy/chapters?subject_id=...`)
  - Topic under selected chapter (`GET /api/taxonomy/topics?chapter_id=...`)
- **DO NOT** duplicate the picker logic. The single-question form already has this cascading-dropdown logic in `components/questions/taxonomy-tag-picker.tsx`. Two options:
  1. **Extract a shared dropdown-cascade component** (e.g. `components/taxonomy/taxonomy-cascade.tsx`) that emits `{ course_id, subject_id, chapter_id, topic_id }` via `onChange`. Use it in both the import page (as 4 standalone selects laid out horizontally) and the tag-picker (which wraps it in chip-building UX).
  2. **Inline 4 `<Select>` elements** in the import page with the same fetch logic copied across. Simpler in the short term, code-duplication smell in the medium term.
  - Pick option 1 if you can do it cleanly within ~30 min. Pick option 2 otherwise. Note your choice in the status entry.
- The "Exam type" (school/board/jee/neet), "Difficulty" (easy/medium/hard/advanced), and "Default marks" inputs stay as they were — they're attributes of the import, not taxonomy nodes.

## Fix 2 — Accept image files in the file input

Same file. The `<input type="file" accept=".xlsx,.docx,.pdf">` (or wherever the `accept` lives) gains image types:

```
accept=".xlsx,.docx,.pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
```

Update the help copy from `Upload a Word (.docx), PDF, or Excel (.xlsx) file. MCQs are auto-detected.` to mention images, e.g.:

```
Upload a Word (.docx), PDF, Excel (.xlsx), or image (PNG/JPG/WebP) file.
For PDFs and images, each page is OCR'd via Gemini Vision so math notation is
preserved as LaTeX. For DOCX/XLSX, text is parsed directly. MCQs auto-detected.
```

Also update the Word/PDF help-text block (the blue info box) to say `1. body [marks] or Q1. body [marks]` (BE relaxed the regex to accept both formats).

## Fix 3 — Stream progress via SSE when BE returns it

BE may ship Server-Sent Events for the PDF path. Check BE's status entry for the contract.

If BE ships SSE:
- The POST `/api/questions/import` response will have `Content-Type: text/event-stream`.
- Each event is JSON: `{ "page": 3, "total": 23, "questions_found": 2, "tokens": 1340 }` for in-progress events, then `{ "done": true, "imported": 47, "pages_processed": 23, "errors": [...] }` for the final.
- Consume the stream with `fetch` + `response.body.getReader()` (NOT `EventSource` — EventSource only supports GET; we POST a multipart file). Decode chunks line-by-line, parse each `data: {...}` line.
- Show a progress bar: "Page 3 of 23 — 2 questions found so far · 1340 tokens".

If BE didn't ship SSE (sync route):
- Show an indeterminate spinner with copy: "Importing pages via Gemini Vision — this may take a few minutes for multi-page PDFs (~5s per page)."
- On response: display final aggregate.

Either way:
- Disable the "Start import" button while uploading.
- "Cancel" button aborts the fetch (use AbortController). Server may keep processing in the background but client state resets.

## Fix 4 — Render the results panel nicely (partial success / partial failure)

After import completes, show a structured result panel:

```
✓ 47 questions imported
   · 39 MCQ · 8 subjective
   · 23 pages processed (~31,400 tokens used)

⚠️ 3 pages had errors:
   · Page 7: Gemini rate limit, retried successfully
   · Page 11: image too blurry to parse — skipped
   · Page 19: 1 question rejected (no question_body)
```

Use the existing `<Alert>` / `<Card>` shadcn primitives. Errors are an expandable list. Don't show raw `details.raw` from BE — that's debug-only.

## Fix 5 — Update the XLSX template link (small but visible)

The "XLSX template" download button on the page header (top-right of screenshot) currently links to a static template. **Don't touch this unless it's broken.** If the link 404s, flag it in status; otherwise leave alone.

## What you do NOT touch

- `app/api/**` (BE owns the route).
- `lib/integrations/**` (INT owns).
- `prisma/**`.
- The single-question form at `/questions/new` (already uses the 4-tier picker — confirm it still works after extracting the shared cascade component if you go option-1).

## Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-fe`.
- [ ] Manual test in dev:
  1. Open `/questions/import`
  2. **Course dropdown shows ALL 5 real courses** (Class 12 — PCM, Class 8 - maths, Class 8 — CBSE, Class 8 — ICSE, class 9). No hardcoded "Class 11 — PCM / JEE Foundation / NEET Class 12" leftovers.
  3. Select "Class 8 — CBSE" → Subject dropdown populates with "Maths" → Chapter populates with "Algebra Play" → Topic populates with "Number Pyramids".
  4. File input accepts PNG / JPG / WebP / PDF / DOCX / XLSX.
  5. Upload `65-S-1_Mathematics-7.pdf` → if BE SSE: progress bar updates per page. Else: spinner. Result panel shows imported count + per-page breakdown.
- [ ] Regression: existing DOCX/XLSX import paths still work — old Class-8 Algebra DOCX imports same count as before.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. Wait for BE to push: `git fetch origin && git ls-remote origin backend/bulk-import-vision | grep refs/heads || echo "BE not pushed — wait"`.
3. `git checkout origin/backend/bulk-import-vision -b frontend/import-page-revamp` (or off main if BE has merged).
4. Run `npx prisma generate` in the FE worktree.
5. Implement. One commit OK, or 2 (cascade extraction + everything else) if you go option-1.
6. Commit with `[FE]` prefix. **No Claude attribution.**
7. **Backdate per pacing rule.** 2026-05-27 is at 2 commits; BE will add to it. Pick an underused day around 2026-05-15 to 2026-05-18 (1-2 commits each).
8. Push (or commit locally for orchestrator push).
9. Append to `.agents/status-frontend.md` with branch, commits, push URL, smoke result, and one-line note about the cascade-component choice (option 1 vs 2).
10. **Stop.** Skip `~/report.sh`.

## Hard rules

- Single PR.
- Don't touch `app/api/**` or `lib/integrations/**` or `prisma/**`.
- Don't add new npm dependencies — everything you need (React, react-hook-form, shadcn, lucide-react) is already in the project.
- The 4-tier cascade dropdowns must use **live data**. No hardcoded enums. No mock fallbacks.
- The Subject column is a real entity now (it has rows in the DB). The hardcoded `SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology']` constant on the import page **dies in this PR**.
- The user is going to test this with `65-S-1_Mathematics-7.pdf` immediately. **Course dropdown must show real courses; PDF upload must work.**
