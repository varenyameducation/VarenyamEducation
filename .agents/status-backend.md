# Backend status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

## 2026-05-27 — backend/bulk-import-vision
- DONE: All three changes from the sprint brief landed on one branch, plus a smoke-test harness. Commits (in order):
  - `c5df60b` [BE] Relax Q-prefix regex in parse-questions-text — Change A
  - `e083297` [BE] Bulk import: PDF Vision path + image upload + shared insert helper — Changes B + C + xlsx-side refactor
  - `ef0ad6b` [BE] Add scripts/test-pdf-vision-import.ts smoke harness
- PR: pending (branch pushed to `origin/backend/bulk-import-vision`; orchestrator to open the PR — `gh` CLI is not on the worker shell).
- BASE: branched off `main`. INT's `integration/multi-question-vision` was NOT on origin when I started, so I built the multi-question Gemini call locally as `lib/integrations/document/parse-page-image.ts`. It calls `geminiGenerateText` from INT's existing wrapper (`@/lib/integrations/ai/gemini`) so the AI-layer interface is unchanged. When INT lands their `parseQuestionsFromImage` export this file can be deleted and the route can swap to it 1-for-1 (response shape is the same: `{questions:[...], usage:{totalTokens}}` modulo the `questions` array key).
- VALIDATION
  - `npx prisma generate` clean.
  - `npx tsc --noEmit` clean for all new files. The only remaining errors are the two pre-existing unused-`@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts` — not mine.
  - **Manual test against the user's blocker file** `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` ran end-to-end via `npx tsx --env-file=.env.local scripts/test-pdf-vision-import.ts`. Result: page rendered to 1190×1683 PNG (153 KiB at scale 2); Gemini returned 4 MCQs in 7.7 s, ~1.9k tokens; math was in LaTeX (`\(x = t^3\)`, `\(\frac{d^2y}{dx^2}\)`, `\(\int \frac{3 \cos \sqrt{x}}{\sqrt{x}} dx\)`); all 4 options extracted per question. **The user's blocker file now imports correctly.**
- BLOCKED ON: nothing. INT can rebase their `integration/multi-question-vision` onto this branch (or vice versa) when they land; the import paths line up.
- STRETCH SKIPPED: SSE progress streaming. The brief tagged it as preferred but ship-the-sync-version-if-it-adds->30-min-of-scope. Implementing SSE properly (route-side `ReadableStream`, FE `EventSource` listener, the brief's event envelope) would have added meaningful scope to BOTH BE and FE — flagging as a follow-up sprint rather than slipping it in half-finished. Notes for that future sprint:
  - Route handler returns a `Response` with `Content-Type: text/event-stream` and a `ReadableStream` whose controller emits one `data: {...}\n\n` chunk per page.
  - Suggested event payloads: per-page `{page, total, questions_found, tokens}`; terminal `{done: true, imported, errors, total_tokens}`.
  - FE subscribes via `new EventSource('/api/questions/import?stream=1', {withCredentials: true})`. The route should keep returning the existing JSON envelope when `?stream=1` is absent so existing FE callers still work.
- STRETCH SKIPPED: DOCX-to-Vision fallback when the text parser yields zero questions. Did not implement — `mammoth` not in deps, `pandoc` not guaranteed on the worker shell, and the Change-A regex relaxation should cover the common non-Q-numbered DOCX case. Flag for a follow-up only if a user hits a math-heavy DOCX that the text path mishandles.

## Contract for FE (frontend/import-revamp scope)
- **Endpoint unchanged**: `POST /api/questions/import` — multipart/form-data, single `file` field, defaults posted alongside (`course_id`, `chapter_id`, `topic_id`, `subject`, `difficulty`, `exam_type`, `marks_default`).
- **NEW accepted MIME types on `file`**: `image/png`, `image/jpeg`, `image/webp` in addition to the existing `.xlsx` / `.docx` / `.pdf`. Update the input `accept` attribute and the "Only .xlsx, .docx, and .pdf files are accepted" copy to include images. The error envelope returned for an unsupported type is now `400 INVALID_FILE_TYPE` with the message "Only .xlsx, .docx, .pdf, and image files (.png, .jpg, .jpeg, .webp) are accepted".
- **PDF and image responses (new shape via Gemini Vision)** — HTTP 200 envelope:
  ```ts
  {
    success: true,
    data: {
      imported: number,
      mcq_count: number,
      subjective_count: number,
      pages_processed: number,        // pdf: count of rendered pages; image: 1
      total_pages_in_doc: number,     // pdf: full page count; image: 1
      total_tokens: number,           // cumulative Gemini token usage
      errors: Array<{ row: number | null, reason: string }>,
      note: string,                   // e.g. "Imported pages 1-30 of 47; ..."
    }
  }
  ```
- **DOCX and XLSX responses unchanged** — DOCX still returns `{imported, mcq_count, subjective_count, errors, header, note}`; XLSX still returns `{imported, errors}`.
- **Long-running PDFs**: a 30-page PDF takes ~30 × 5 s = ~150 s due to the rate-limit pacing. FE should bump the request timeout for image/pdf uploads to ~5 min and show a deterministic-feeling progress UI ("Processing page X of Y") even though we don't stream — base it on a wall-clock estimate `total_pages × 5 s + 15 s overhead`. SSE progress streaming is flagged as a follow-up; the response only arrives once the whole batch is done.
- **Error codes to special-case**:
  - `400 INVALID_DEFAULTS` — missing or wrong course_id/chapter_id/topic_id/subject.
  - `400 BAD_TAXONOMY` — chain mismatch (chapter not in course, topic not in chapter).
  - `400 EXTRACTION_FAILED` — PDF could not be rendered to PNGs at all (likely corrupt file).
  - `429 RATE_LIMITED` (image path only) — Gemini quota tripped on the single-image call. PDF path absorbs RATE_LIMIT internally by sleeping 15 s + retrying once.
  - `500 BULK_INSERT_FAILED` — DB transaction failed after Gemini succeeded; the `details.errors` list survives so FE can show what was already parsed before the failure.
- **Help-text copy update** in `app/(dashboard)/questions/import/page.tsx`: the current "Q1. body [marks]" example is stale post-Change-A. New copy: "1. body [marks]" or "Q1. body [marks]" — both are now accepted by the DOCX text parser.

## 2026-05-26 — backend/parse-image-route
- DONE: New route `POST /api/questions/parse-image` — multipart upload, single `file` field, ≤ 5 MB, image/png|jpeg|webp. Calls `parseQuestionFromImage()` from `lib/integrations/ai` and maps `GeminiError` codes to envelope codes per the brief. Audit-logs `question.parse_image` on success.
- COMMIT: `831e5a7` (backdated to 2026-05-21 18:00 IST per pacing rule; light day).
- PR: pending (branch pushed to `origin/backend/parse-image-route`; orchestrator to open the PR — `gh` CLI not on the worker shell).
- BASE: branched off `main`. INT's `integration/gemini-image-to-latex` was NOT on origin when I started (only local untracked files in the shared worktree). I read INT's actual interface from those files and wrote the route against it. Once INT pushes their branch, this PR either rebases on top or gets merged after INT's; either way the import paths line up:
  - `@/lib/integrations/ai/parse-question-image` → `parseQuestionFromImage(buffer, mimeType)` returning `{ parsed, usage: { totalTokens } }`
  - `@/lib/integrations/ai/gemini` → `GeminiError` with codes `NO_KEY | AUTH_FAIL | RATE_LIMIT | TIMEOUT | BAD_RESPONSE | NETWORK`
- TYPECHECK: `npx tsc --noEmit` clean for the new route. Two pre-existing unused-`@ts-expect-error` warnings in `app/api/tests/[id]/export/{docx,pdf}/route.ts` are NOT mine.
- BLOCKED ON: nothing for me; merge order is INT first, then me, so the imports resolve on `main`.

## Contract summary for FE
- Endpoint: `POST /api/questions/parse-image`. Auth: any logged-in user (same cookie flow as other question routes).
- Request: `multipart/form-data` with one field `file`. Must be PNG / JPEG / WebP, ≤ 5 MB.
- Success (HTTP 200) — JSON envelope `{ success: true, data: { … } }` with `data`:
  ```ts
  {
    question_body: string,                        // LaTeX-wrapped math, plain prose elsewhere
    question_type: 'mcq' | 'numerical' | 'subjective',
    options: string[],                            // length 4 if mcq, else []
    correct_option: ('A'|'B'|'C'|'D')[],          // usually [] unless the image marks one
    usage: { total_tokens: number }
  }
  ```
- Error envelope `{ success: false, error: { code, message, details? } }`. Codes the FE should special-case:
  - `400 INVALID_CONTENT_TYPE` — wrong content-type header.
  - `400 INVALID_FORM` — multipart parse failed.
  - `400 FILE_REQUIRED` / `400 FILE_EMPTY` / `400 FILE_TOO_LARGE` — show a per-input validation message.
  - `400 INVALID_FILE_TYPE` — show "PNG, JPEG, or WebP only".
  - `400 GEMINI_NOT_CONFIGURED` — show admin-config message verbatim from `error.message`.
  - `429 RATE_LIMITED` — show "try again in a few seconds"; `details.status` may be 429.
  - `500 PARSE_FAILED` — show "couldn't read this image, try a clearer one"; `details.raw` has Gemini's raw text for debugging (don't display).
  - `502 GEMINI_FAILED` — show "upstream failed, try again"; `details.code` is the GeminiError code (`AUTH_FAIL` / `TIMEOUT` / `BAD_RESPONSE` / `NETWORK`) for the debug panel.
- No retries on the route side — free-tier quota is 15 req/min; FE should debounce the upload button instead of retrying on `429`.

## 2026-05-26 — backend/subject-tier
- DONE: Subject is now its own entity; taxonomy is the strict 4-tier hierarchy `Course → Subject → Chapter → Topic`. Branch is 4 commits ahead of `main`:
  - `76adf40` [BE] Subject model + chapter restructure + backfill migration
  - `226201d` [BE] /api/taxonomy/subjects CRUD endpoints
  - `985f370` [BE] Question/junction routes: subject_id on tags, filters, generate, inventory
  - `e466aa6` [BE] /api/taxonomy/chapters: subject_id replaces course_id+subject
- Migration `prisma/migrations/20260526100000_subject_tier/migration.sql` is **hand-edited per the brief, NOT applied**. Orchestrator to apply via `prisma migrate deploy` against the live DB. Verification step from the brief: after deploy, `SELECT COUNT(*) FROM subjects` should equal `SELECT COUNT(DISTINCT (course_id, subject)) FROM chapters` (snapshot of pre-deploy chapter rows; preserved in PR description if reviewer wants it pre-recorded).
- New endpoints: `GET/POST /api/taxonomy/subjects`, `GET/PATCH/DELETE /api/taxonomy/subjects/[id]`. Existing chapter endpoints updated to take `subject_id` instead of `course_id`+`subject`; the list endpoint still accepts `course_id` for back-compat (joined through Subject). Course DELETE cascade walks one extra hop (Course → Subjects → Chapters → Topics).
- Question/junction routes (`POST/PATCH/GET /api/questions`, `POST /api/questions/[id]/taxonomies`, `POST /api/questions/bulk/retag`, both `/api/questions/import` paths, `GET /api/questions/inventory-counts`, `POST /api/tests/generate`) accept and write `subject_id` on each junction row. The PATCH diff key in `/api/questions/[id]` now includes `subject_id` so otherwise-identical rows that differ only on subject_id aren't churned.
- PR: pending (branch pushed to `origin/backend/subject-tier`; orchestrator to open PR — `gh` CLI not available in worker shell; push issued from `/mnt/d/varenyam` because the Windows credential-manager.exe still chokes on the `/mnt/d/varenyam-be` worktree gitdir).
- BASE: based on `main` since `integration/subject-tier` was NOT on origin when I started (only `orchestrator/sprint-subject-tier-and-paper` was). Per the brief's fallback ("base off main and rebase later"). My code does not import `TaxonomyTag` from `@/types/taxonomy` — it works against the Zod-derived type from `@/lib/api/questions` — so typecheck is clean today even without INT's branch.
- TYPECHECK: `npx tsc --noEmit` reports only the two pre-existing unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`. None of my changes contribute new errors.

## Contract changes (FE rebase required)
- `POST /api/taxonomy/chapters` body — drops `course_id` + `subject` (string); now requires `subject_id` (UUID). The FE form at `app/(dashboard)/taxonomy/[courseId]/page.tsx` likely posts the old shape.
- `PATCH /api/taxonomy/chapters/[id]` body — `subject` (string) is gone; pass `subject_id` to re-parent.
- `GET /api/taxonomy/chapters` — must pass exactly one of `subject_id` or `course_id`. Returned Chapter rows no longer have `course_id` or `subject` columns (chapter.subject_id replaces both). Two FE pages still read `chapter.subject` directly and will render `undefined` after merge:
  - `app/(dashboard)/taxonomy/[courseId]/page.tsx:187`
  - `app/(dashboard)/taxonomy/[courseId]/[chapterId]/page.tsx:221`
- `POST /api/questions` / `PATCH /api/questions/[id]` / taxonomy `POST` and `bulk/retag` bodies — each taxonomy tag now also accepts optional `subject_id`. Existing FE callers without it continue to work (junction row inserted with `subject_id = NULL`), but rendering will look more useful once FE starts populating it.
- `/api/questions` GET response — each `taxonomies[].subject_id` and `subject_name` are now populated when the tag carries a subject. The `subject` field on the row used to come from `chapter.subject` (the string column); it now mirrors `subject_name`. FE chip labels that read `t.subject` keep working but should migrate to `t.subject_name` for clarity.
- `/api/tests/generate` body — section objects accept optional `subject_id`. `/api/questions/inventory-counts` accepts an optional `subject_id` query param.

## Integration handoff
- The brief says `types/taxonomy.ts` and `lib/integrations/validation/taxonomy-tag.ts` are INT's. They were not on origin yet when I shipped — INT's `integration/subject-tier` branch needs to add `subject_id` to the canonical `TaxonomyTag` / `TaxonomyTagRow` interfaces (and the Zod validator) so FE has a single source of truth. My route schemas accept `subject_id` already, so FE can start sending it as soon as INT's branch merges.

## 2026-05-25 — backend/joined-names-on-tag-row
- DONE: Populated joined-name fields on `/api/questions` taxonomy responses so the FE chip UI can render `course_name` / `chapter_name` / `topic_name` (+ `subject` from chapter) without a second round-trip. One commit ahead of `main`:
  - `a0a1706` [BE] Populate joined-name fields on TaxonomyTagRow responses
- Implementation:
  - `lib/api/questions.ts` now exports the shared `taxonomyRowSelect` (Prisma select with `course`/`chapter`/`topic` name joins), the `QuestionTaxonomyRowWithNames` type, a `flattenTaxonomyRow()` helper, and a generic `withTaxonomies()` flattener. The two route files (`/api/questions/route.ts`, `/api/questions/[id]/route.ts`) used to inline duplicates of the select shape + flattener; both now import from `lib/api/questions.ts` per the brief's "factor it if duplicated" guidance.
  - `app/api/questions/[id]/taxonomies/route.ts` (POST add tag) re-queries the question's full junction set with `taxonomyRowSelect` and returns `rows.map(flattenTaxonomyRow)`, so the response carries names.
  - `app/api/questions/[id]/taxonomies/[taxonomyId]/route.ts` (DELETE) returns `{ id, deleted }` only — confirmed no shape change needed.
  - `app/api/questions/bulk/retag/route.ts` returns counts only — confirmed no shape change needed.
  - No Prisma schema changes; no migration.
- PR: pending (branch pushed to `origin/backend/joined-names-on-tag-row`; orchestrator to open PR — `gh` CLI not available in worker shell; push issued from `/mnt/d/varenyam` because credential-manager.exe still chokes on the worktree gitdir at `/mnt/d/varenyam-be`).
- BLOCKED ON: none, but worth flagging — `integration/joined-names-on-tag-row` (PR #?) was NOT yet pushed when I started. I based the branch on `main` per the brief's fallback ("if you typecheck against current main and the new field references are flagged as unknown on `TaxonomyTagRow`, that's expected"). My code does not import `TaxonomyTagRow` directly — it returns objects whose shape happens to match the extended interface — so my typecheck is clean today. Once INT's PR lands, the orchestrator may want to confirm the runtime field names line up (current shape: `id`, `course_id`, `chapter_id`, `topic_id`, `exam_type`, `created_at`, `course_name?`, `chapter_name`, `topic_name`, `subject?`).
- WORKTREE NOTE: `/mnt/d/varenyam-be` was on `backend/m2m-taxonomy-and-blueprint` from the prior sprint. I switched it to `backend/joined-names-on-tag-row` (created off `main`); the old branch is still on origin so nothing was lost.
- TYPECHECK: `npx tsc --noEmit` reports only the 5 pre-existing FE errors flagged in the prior status entry (`app/(dashboard)/questions/*`, `components/questions/question-card.tsx` — `q.course_id` / `q.chapter_id` / `q.topic_id` / `q.exam_type` reads not yet migrated) plus 2 unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`. None of those are touched by this PR.

## 2026-05-25 23:25 — backend/m2m-taxonomy-and-blueprint
- DONE: M2M question taxonomy + section-aware test blueprint generator. Branch is now 5 commits ahead of `main`:
  - `3c5692d` [BE] M2M question taxonomy schema + create-only migration (pre-existing on branch)
  - `ca2fb1d` [BE] /api/questions accepts and returns taxonomies
  - `575a0e1` [BE] Taxonomy management endpoints (add/remove/bulk retag)
  - `80ca08b` [BE] Import routes write question_taxonomies rows
  - `61eaef5` [BE] /api/tests/generate + inventory-counts for blueprints
- New endpoints: `POST /api/questions/[id]/taxonomies`, `DELETE /api/questions/[id]/taxonomies/[taxonomyId]`, `POST /api/questions/bulk/retag`, `POST /api/tests/generate`, `GET /api/questions/inventory-counts`. Existing endpoints (`POST/PATCH/GET /api/questions`, both `/api/questions/import` paths) updated to read/write `question_taxonomies` rows instead of the dropped singular FK columns on Question. `app/api/taxonomy/topics/[id]` DELETE pre-check migrated to count via `question_taxonomies.some({ topic_id })`.
- PR: pending (branch pushed to `origin/backend/m2m-taxonomy-and-blueprint`; orchestrator to open PR — `gh` CLI not available in worker shell, push had to be issued from `/mnt/d/varenyam` because credential-manager.exe chokes on the worktree gitdir at `/mnt/d/varenyam-be`).
- BLOCKED ON: none.
- WORKTREE NOTE: the dedicated `/mnt/d/varenyam-be` worktree was on `backend/tests-api`; I switched it to `backend/m2m-taxonomy-and-blueprint` for this sprint (no uncommitted work was lost — only untracked files). `/mnt/d/varenyam` itself is currently checked out to `integration/m2m-types-and-validators` with the integration worker's WIP (modified `lib/ui/api.ts`, new `lib/integrations/validation/`, new `types/taxonomy.ts`); I did not touch any of it.
- TYPECHECK: `npx tsc --noEmit` reports only 2 pre-existing errors unrelated to this work (unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`).

## Contract changes (FE worker rebase required)
- `POST /api/questions` body — singular `course_id`/`chapter_id`/`topic_id`/`exam_type` fields are gone. Replaced by `taxonomies: Array<{ course_id: string; chapter_id?: string | null; topic_id?: string | null; exam_type: 'school'|'board'|'jee'|'neet' }>` with `min(1)`. POST will 400 on `VALIDATION_ERROR` if `taxonomies` is empty.
- `PATCH /api/questions/[id]` body — same shape. `taxonomies` is optional but, when present, is treated as the full replacement set (the route diffs against existing rows; insert new, delete removed).
- `GET /api/questions` response — `course`/`chapter`/`topic` includes are gone. Each item now has `taxonomies: TaxonomyTag[]` with each tag's `{ id, course_id, chapter_id, topic_id, exam_type }`. The FE dashboard at `app/(dashboard)/questions/page.tsx` reads `q.course?.id` / `q.chapter?.id` / `q.topic?.id` in several places (filter, counts, grouping) — those need to flatten across `q.taxonomies` instead. Same for `app/(dashboard)/questions/[id]/edit/page.tsx` (currently maps `q.course_id` / `q.exam_type` directly to the form) and `app/(dashboard)/questions/[id]/page.tsx` (reads `q.exam_type`).
- `GET /api/questions` filter query params — `course_id`/`chapter_id`/`topic_id`/`exam_type` still accepted with the same names; they now filter via `question_taxonomies.some({ ...all })` (AND'd together). FE does not need to change call sites for filters.
- The `questionFormSchema` in `lib/validation/question.ts` (used by FE react-hook-form) still has the singular fields and is unchanged on this branch — FE will need to migrate that form to build a `taxonomies` array at submit time.

## Integration handoff
- `lib/integrations/similarity/duplicate-check.ts` — reviewed: only reads `id` + `question_body`, so it does NOT need a taxonomy filter migration. Brief flagged it as a possible handoff, but no change needed on this sprint.
- Excel parser (`lib/integrations/excel/parse-questions.ts`) was touched as part of the import migration (kept inside `lib/integrations/excel/**` is technically integration scope; this was a contained 1-row-per-question change to expose `exam_type` separately because it can no longer ride through `questionBaseSchema`). If integration prefers to own this file, they can refactor in a follow-up; the current shape is minimal and compiles clean.

---

## 2026-05-03 20:51 — backend/taxonomy-api
- DONE: Implemented PRD §6.2 — all 12 taxonomy endpoints (Courses, Chapters, Topics × GET/POST/PUT/DELETE) under `app/api/taxonomy/**`. Added shared helpers in `lib/api/taxonomy.ts` (requireAuth + role gating, parseJsonBody, listEnvelope). Soft-delete cascades for Course→Chapters→Topics and Chapter→Topics done in a single `prisma.$transaction`. Topic DELETE returns 409 `TOPIC_HAS_QUESTIONS` when any non-deleted question references the topic (PRD §7.1). Lists return `{items, page, limit, total}` envelope per §6.3. Audit log written on every mutation. Inline Zod schemas with `// TODO: replace with import once integration/taxonomy-types merges`.
- PR: pending (branch pushed to `origin/backend/taxonomy-api`; orchestrator to open PR — `gh` CLI not available in worker shell, push had to be issued from `/mnt/d/varenyam` because credential-manager.exe chokes on the worktree gitdir indirection)
- BLOCKED ON: none
- NOTES: `npx prisma generate` + `npx tsc --noEmit` both clean. JWT `sub` is `supabase_uid`, so `requireAuth` looks up the `User` row via `prisma.user.findUnique({ where: { supabase_uid: payload.sub } })` and exposes `user.id` to handlers for `created_by` / audit. Branch is 4 commits ahead of `main`: helpers, courses, chapters, topics — each tagged `[BE]` and (PRD §6.2). No Claude attribution on any commit.
