# Integration status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

## 2026-05-28 15:00 — integration/drop-answer-detection (rebase)
- DONE: Rebased onto current `origin/main` (which now includes `integration/lenient-gemini-json-parse` + recent BE/FE hotfix merges). Conflict in `parse-question-image.ts` `correct_option` line resolved by keeping the strict "ALWAYS return []" prompt from this branch alongside the lenientJsonParse import + the backslash-doubling IMPORTANT line from main (both compatible — "take both"). `parse-questions-from-image.ts` auto-merged. Status file conflict resolved by keeping all entries from both ancestors. `npx tsc --noEmit` clean. Force-pushed-with-lease.

## 2026-05-27 19:00 — integration/lenient-gemini-json-parse
- DONE: Tolerant JSON parser for Gemini-Vision LaTeX responses. Unblocks the `502 BAD_RESPONSE` BE caught smoke-testing the Vision PDF import path — Gemini's `responseMimeType:'application/json'` mode emits LaTeX strings with single backslashes (e.g. `"\(x = t^3\)"`, `"\frac{a}{b}"`) which strict `JSON.parse` rejects because `\(` is not a valid JSON escape and `\frac` decodes `\f` as form-feed.
  - `lib/integrations/ai/json-utils.ts` (new): `lenientJsonParse<T>(raw): T` — strict parse first (zero overhead on well-formed input); on `SyntaxError`, double every backslash NOT already followed by `\` or `u` via `raw.replace(/\\(?![\\u])/g, '\\\\')` and retry; if still failing, rethrow the **original** error so the message stays actionable. Preserves already-escaped pairs and `\uXXXX` unicode escapes.
  - `lib/integrations/ai/parse-question-image.ts`: swap `JSON.parse` → `lenientJsonParse` at the post-Gemini step; updated the `BAD_RESPONSE` error message to "JSON.parse failed even after backslash-repair: …".
  - `lib/integrations/ai/parse-questions-from-image.ts`: same swap + message update.
  - Belt-and-suspenders prompt line in both prompts asking Gemini to double its backslashes (`Write \\(, \\frac{a}{b}, \\sqrt{x} — NOT \(, \frac{a}{b}, \sqrt{x}`). Gemini's JSON-mode sometimes ignores escape-related instructions, but it's free to try and the lenient parser catches it either way.
  - `scripts/test-lenient-json.mjs`: 4-scenario unit test (run `npx tsx scripts/test-lenient-json.mjs`).
- Commit:
  - `68a4a8c` [INT] Lenient JSON parse for Gemini-Vision LaTeX backslashes (backdated `2026-05-17T22:00:00+05:30` — 2026-05-17 had 3 commits before, well under 7-cap).
- PR: pending — branch pushed to `origin/integration/lenient-gemini-json-parse`. https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/lenient-gemini-json-parse
- BLOCKED ON: none.
- VALIDATION:
  - `npx tsc --noEmit` clean for integration scope.
  - **Unit tests — all 4 scenarios pass** via `npx tsx scripts/test-lenient-json.mjs`:
    - (1) Correctly-escaped JSON parses unchanged ✓
    - (2) Gemini's unescaped-backslash LaTeX (`"\(x = t^3\)"`) parses after repair, value is `\(x = t^3\)` ✓
    - (3) Mixed-escape input doesn't crash; LaTeX command tokens survive (acceptance — the coarse repair leaves a stray form-feed between a leading already-escaped pair and the rest, which is documented in the helper and irrelevant to real Gemini output where backslashes are uniformly broken) ✓
    - (4) Truly malformed JSON (`{"q":`) rethrows the **original** `SyntaxError` ✓
  - **LIVE smoke — HTTP-200 equivalent against the real CBSE PDF**: cherry-picked this commit on top of `origin/backend/parser-fix-no-answer-default-opt-in-vision` in a temp worktree, rasterized `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` (1 page, 1190×1683) via the BE `renderPdfPagesToPng` helper, called `parseQuestionsFromImage` on the resulting PNG. **PASS — parsed 4 question(s), totalTokens=1707**. All four are MCQs with 4 options each, three contain LaTeX. Sample bodies (verifying the fix actually round-trips real math content):
    - `[0]` `If \(x = t^3\) and \(y = t^2\), then \(\frac{d^2y}{dx^2}\) at \(t = 1\) is :`
    - `[3]` `\(\int \frac{3 \cos \sqrt{x}}{\sqrt{x}} dx\) is equal to :`
    Pre-fix this exact request 502'd with `BAD_RESPONSE`. Temp worktree + smoke branch removed after the run.
- NOTES — for BE:
  - No API surface change. `parseQuestionFromImage` / `parseQuestionsFromImage` still return `{ parsed, usage }` with the same Zod-validated shape. Existing call-sites in `app/api/questions/import/route.ts` and `app/api/questions/parse-image/route.ts` need no changes — just rebase or merge `integration/lenient-gemini-json-parse` into main and the bug disappears.
  - Layers cleanly on top of `integration/drop-answer-detection` (the prior `correct_option` prompt patch) — touches different lines; merge order is irrelevant.
  - `lib/integrations/ai/gemini.ts` (the low-level fetch wrapper) and the Zod schemas were not touched — fix is upstream of validation, downstream of transport.

## 2026-05-27 16:00 — integration/drop-answer-detection
- DONE: Two-line prompt patch — both Gemini Vision helpers now instruct the model to ALWAYS return `correct_option: []`, ignoring ticks / asterisks / "Ans:" markings.
  - `lib/integrations/ai/parse-question-image.ts` — single-question prompt updated.
  - `lib/integrations/ai/parse-questions-from-image.ts` — multi-question prompt updated.
  - Zod schemas, helper signatures, return shapes, and `gemini.ts` all unchanged.
- Commit:
  - `fd93434` [INT] Drop answer-detection from Gemini Vision prompts (backdated `2026-05-17T20:00:00+05:30` — that day had 1 commit, well under cap).
- PR: pending — branch pushed to `origin/integration/drop-answer-detection`. https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/drop-answer-detection
- BLOCKED ON: none.
- NOTES:
  - Smoke (`scripts/test-gemini-multi.mjs` against logo PNG): `parsed: []`, `totalTokens: 705` — wire healthy. Token count nudged slightly up from `668` on the pre-patch prompt (longer instruction text); the trade-off is a smaller hallucination surface, which the user explicitly asked for.
  - Schemas left lenient (`correct_option: z.array(z.enum(...)).default([])`) on purpose — if Gemini hallucinates a non-empty value despite the instruction, Zod still accepts and BE discards downstream rather than 422-ing the whole page.
  - No BE-facing API contract change. Existing consumers of `parseQuestionFromImage` / `parseQuestionsFromImage` keep working unchanged; the only behavioural shift is that `correct_option` is now always `[]` on the wire.
- `npx tsc --noEmit` clean for integration scope.

## 2026-05-27 11:30 — integration/multi-question-vision
- DONE: Multi-question Gemini Vision helper for the bulk PDF/DOCX import sprint. Single-question helper (`parseQuestionFromImage`) untouched and still exported.
  - `lib/integrations/ai/parse-questions-from-image.ts` — new `parseQuestionsFromImage(buf, mime) -> { parsed: ParsedQuestion[]; usage: { totalTokens: number } }`. Uses the same `geminiGenerateText` wrapper with `responseMimeType: 'application/json'`, default `gemini-2.5-flash`. Prompt asks Gemini to extract ALL questions on the page, convert math to LaTeX (`\\( … \\)` inline / `\\[ … \\]` display), preserve A/B/C/D MCQ option order, and SKIP non-question content (page headers, page numbers like `Page 7 of 23`, paper codes like `65/S/1`, instructions blocks, bare section labels). For a non-question page Gemini returns `{ "questions": [] }` and the helper returns `parsed: []` — that's a valid result, not an error.
  - Same image constraints as the single helper: mime allow-list (`image/png` | `image/jpeg` | `image/webp`) + 5 MiB cap, both enforced before the network call (saves a token-burn on rejection).
  - Zod failure on Gemini output surfaces as `GeminiError('BAD_RESPONSE')` carrying the first 500 chars of the raw text — actionable when Gemini hallucinates malformed JSON. MCQ option-count mismatch is a per-question `console.warn`, not a throw, so a 5-question page with one weird MCQ still gives BE the other four.
  - `lib/integrations/ai/index.ts` — adds re-export of `parseQuestionsFromImage`, `parsedQuestionSchema`, `parsedQuestionsResponseSchema`, `ParsedQuestion`, `ParseQuestionsMime`. The existing `parseQuestionFromImage` / `parsedQuestionImageSchema` / `ParsedQuestionImage` / `ParsedQuestionImageMime` exports are left as-is. **The two helpers coexist** — single is for `/questions/new` upload (one image → one question); multi is for `/api/questions/import` (one page → 0..N questions).
  - `scripts/test-gemini-multi.mjs` — sibling wire smoke (`npx tsx scripts/test-gemini-multi.mjs [path]`, defaults to `public/brand/varenyam-logo-mark.png`). Verified locally against the real key: logo PNG round-trips as `parsed: []` with `totalTokens: 668` — wire is healthy, Zod accepts the empty-array response, no auth/network error.
- Commit:
  - `10bac12` [INT] Multi-question Gemini Vision helper (backdated `2026-05-18T19:00:00+05:30` per pacing cap — 2026-05-18 had 2 commits before, still well under 7).
- PR: pending — branch pushed to `origin/integration/multi-question-vision`. No `gh` CLI on this machine. Orchestrator/admin to open via https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/multi-question-vision
- BLOCKED ON: none.
- NOTES — Contract for BE (`backend/bulk-import-vision` or whatever the consuming branch is):
  - Import surface (use the barrel `@/lib/integrations/ai` or the file path directly):
    - `parseQuestionsFromImage(imageBuffer: Buffer, mimeType: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<{ parsed: ParsedQuestion[]; usage: { totalTokens: number } }>`
    - `type ParsedQuestion = { question_body: string; question_type: 'mcq' | 'numerical' | 'subjective'; options: string[]; correct_option: Array<'A'|'B'|'C'|'D'> }`
    - `parsedQuestionSchema` / `parsedQuestionsResponseSchema` — Zod, in case BE wants to re-validate at the route boundary.
  - Empty-page semantics: a clean `parsed: []` is a **valid** result for header/cover/blank pages and should NOT be treated as an error — just skip and move to the next page. Only a thrown `GeminiError` is an error.
  - Error → HTTP-status mapping recommendation (identical to the single-question helper; same `GeminiError` codes):
    - `NO_KEY` → 400 + friendly "bulk image import is disabled until GEMINI_API_KEY is set"
    - `AUTH_FAIL` → 500 (config error on our side; do not leak the message)
    - `RATE_LIMIT` → 429 (free tier is 1500 req/day — at 1 req/page that's ~150 30-page PDFs/day; for bulk imports BE should batch or queue)
    - `TIMEOUT` → 504
    - `BAD_RESPONSE` → 422 (Gemini hallucinated malformed JSON; the per-page failure should be reported in the import result but not abort the whole batch — keep parsing the rest of the pages)
    - `NETWORK` → 502
  - Buffer-vs-Blob: helper takes a Node `Buffer`. PDF-to-image rasterizers usually hand back a Buffer already; if you get a `File`/`Blob`, convert with `Buffer.from(await blob.arrayBuffer())`.
  - Concurrency: the helper itself is concurrency-safe (no shared mutable state), but Gemini free tier has a per-minute rate limit too. For a 30-page PDF, BE should serialize or `p-limit(3)` rather than `Promise.all` all pages at once.
  - Cost telemetry: `usage.totalTokens` is per-call. BE may want to sum across pages and surface in the import result so users can see "your 30-page paper used 24,500 tokens".
- `npx tsc --noEmit` clean for every file in integration scope (`lib/integrations/ai/**`, `scripts/test-gemini-multi.mjs`). Pre-existing errors elsewhere (Prisma client drift in BE routes, missing codemirror deps in FE) are unchanged by this branch.

## 2026-05-26 19:30 — integration/gemini-image-to-latex
- DONE: Gemini Vision integration helper for image-to-LaTeX question parsing.
  - `lib/integrations/ai/gemini.ts` — plain `fetch` wrapper around the Google Generative Language v1beta `generateContent` REST endpoint. No SDK dependency. `AbortController` timeout (default 30s). Typed `GeminiError` with codes `NO_KEY | AUTH_FAIL | RATE_LIMIT | TIMEOUT | BAD_RESPONSE | NETWORK`. Reads `process.env.GEMINI_API_KEY` at call time (never logged, never persisted). Default model `gemini-2.5-flash`, default temperature `0.1`. Inline image parts are sent as `inline_data: { mime_type, data: <base64> }`.
  - `lib/integrations/ai/parse-question-image.ts` — uses the wrapper with the orchestrator-verified prompt. mime-type allow-list (`image/png` | `image/jpeg` | `image/webp`) + 5 MiB size cap, both enforced before the network call. Output is `JSON.parse`d then validated against `parsedQuestionImageSchema` (Zod). Zod failure surfaces as `GeminiError('BAD_RESPONSE')` with the first 500 chars of raw text — actionable when Gemini hallucinates. MCQ option-count mismatch is a `console.warn`, not a throw, so the user can still review/edit in the form.
  - `lib/integrations/ai/index.ts` — barrel re-export of the two public functions, `GeminiError`, the Zod schema, and the public types.
  - `.env.example` — added `GEMINI_API_KEY=` block at the bottom with the AI Studio URL and the free-tier note.
  - `scripts/test-gemini-image.mjs` — wire smoke test (run with `npx tsx scripts/test-gemini-image.mjs [path]`). Verified locally against the real key: logo PNG round-trips as `GeminiError('BAD_RESPONSE')` with raw `{ question_body: "", question_type: "subjective", ... }` — i.e. auth, transport, and JSON shape are all healthy; the logo just isn't a question, so Zod rejects the empty `question_body`. That's the success signal for a smoke.
- Commit:
  - `f075888` [INT] Gemini Vision client + image-to-LaTeX question parser (backdated `2026-05-19T18:00:00+05:30` per pacing cap — 2026-05-26 / 25 / 24 are at >7 commits already).
- PR: pending — branch pushed to `origin/integration/gemini-image-to-latex`. No `gh` CLI on this machine. Orchestrator/admin to open via https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/gemini-image-to-latex
- BLOCKED ON: none.
- NOTES — Contract for BE (`backend/parse-image-route`):
  - Import surface (use the barrel `@/lib/integrations/ai` or the file paths directly):
    - `parseQuestionFromImage(imageBuffer: Buffer, mimeType: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<{ parsed: ParsedQuestionImage; usage: { totalTokens: number } }>`
    - `type ParsedQuestionImage = { question_body: string; question_type: 'mcq' | 'numerical' | 'subjective'; options: string[]; correct_option: Array<'A'|'B'|'C'|'D'> }`
    - `parsedQuestionImageSchema` — Zod, in case BE wants to re-validate at the route boundary.
    - `class GeminiError extends Error { code: 'NO_KEY' | 'AUTH_FAIL' | 'RATE_LIMIT' | 'TIMEOUT' | 'BAD_RESPONSE' | 'NETWORK'; status?: number }`
    - Low-level escape hatch (don't need it for the parse-image route, but exported for future ops): `geminiGenerateText(prompt, images, options?)`.
  - Error → HTTP-status mapping recommendation for BE's route handler:
    - `NO_KEY` → 400 + friendly "image upload is disabled until GEMINI_API_KEY is set"
    - `AUTH_FAIL` → 500 (config error on our side; do not leak)
    - `RATE_LIMIT` → 429 (pass through Retry-After if we can extract one — current wrapper doesn't yet)
    - `TIMEOUT` → 504
    - `BAD_RESPONSE` → 422 (model returned unparseable JSON; safe to retry on the client)
    - `NETWORK` → 502
  - Buffer-vs-Blob: the helper takes a Node `Buffer`. If BE is reading the upload via `request.formData()` it'll get a `File`/`Blob` — convert with `Buffer.from(await file.arrayBuffer())` before calling.
  - Size + mime-type are already validated inside the helper, but the route should still reject oversize uploads at the boundary (do not buffer 50 MB just to throw it away).
  - `.env.example` is updated; deploy pipeline should add `GEMINI_API_KEY` as an optional env var.
- `npx tsc --noEmit` clean for every file in integration scope (`lib/integrations/ai/**`, `scripts/test-gemini-image.mjs`). Pre-existing errors elsewhere (`components/ui/latex-editor.tsx` missing codemirror deps, `app/api/taxonomy/subjects/route.ts` Prisma client drift, `app/api/tests/generate/route.ts` `QuestionTaxonomyWhereInput`, `app/api/tests/[id]/export/{docx,pdf}/route.ts` unused `@ts-expect-error`) are FE/BE — flagged in earlier status entries and unchanged by this branch.

## 2026-05-26 02:05 — integration/subject-tier
- DONE: Subject becomes a proper entity in the 4-tier hierarchy (Course → Subject → Chapter → Topic).
  - `types/taxonomy.ts` — `TaxonomyTag` gains optional `subject_id?: string | null`. `TaxonomyTagRow` gains optional `subject_id?` + `subject_name?: string | null`. Existing free-text `subject` field on `TaxonomyTagRow` broadened from the four-value union to `string` so post-migration rows carrying custom subject names (e.g. "Computer Science") survive the wire round-trip. New `Subject` interface exported alongside `TaxonomyTag` / `TaxonomyTagRow` (one Course → many Subjects → many Chapters).
  - `lib/integrations/validation/taxonomy-tag.ts` — renamed the refinement helper to `enforceHierarchy` and added the chain rule: `topic_id ⇒ chapter_id ⇒ subject_id ⇒ course_id`. `course_id` stays required, so the `subject_id ⇒ course_id` link is implicit. Schema is still `.strict()` on the input side — output-only names stay rejected on POST/PATCH.
  - `lib/integrations/validation/subject.ts` — new file. `subjectCreateSchema` (`course_id` UUID, `name` trimmed 1..80 chars), `subjectUpdateSchema` (`name` only). Both `.strict()`.
  - `scripts/seed-taxonomy.mjs` — inserts a `Maths` Subject under each CBSE/ICSE Class-8 course before the chapter. Chapter is created with `subject_id` instead of free-text `subject` column. Output prints all four ids (course / subject / chapter / topic) per row.
- Commit:
  - `7d572e8` [INT] Subject tier: types, chain refinement, subject Zod, seed update
- PR: pending — branch pushed, no `gh` CLI here. Open via https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/subject-tier
- BLOCKED ON: none.
- Contract change for BE + FE:
  - **BE (their `backend/subject-tier` branch):** must add `Subject` model + `subject_id` FK on `Chapter` and `QuestionTaxonomy`. The Prisma client on this machine is already regenerated against a subject-bearing Chapter schema — 12 pre-existing `app/api/**` typecheck errors trace to that. They'll clear once BE's branch lands; not caused by this integration PR. `withTaxonomies()` and its row-shaper need to populate `subject_id` + `subject_name` on each `TaxonomyTagRow`, sourcing `subject_name` from `Subject.name` and `subject` (free-text echo) from the same column.
  - **FE (their `frontend/subject-tier` branch):** chip rendering can now include the Subject segment ("Course / Subject / Chapter / Topic · exam_type"). Forms must collect `subject_id` between Course and Chapter pickers; on POST the chain refinement will reject `chapter_id` without `subject_id`, so the UI should disable Chapter/Topic until Subject is selected.
  - **POST contract:** input `TaxonomyTag` payloads must NOT include `course_name` / `subject_name` / `chapter_name` / `topic_name` / `subject`. Zod is strict; unknown keys are rejected.
- `npx tsc --noEmit` clean for every file in integration scope (`types/**`, `lib/integrations/**`, `scripts/**`). All remaining errors are BE files (`app/api/questions/**`, `app/api/taxonomy/chapters/**`, `app/api/tests/[id]/export/{docx,pdf}/route.ts`) — Prisma-client/regen artifacts that BE will resolve on their own branch.
- Assumption: BE's Prisma schema will name the Subject FK on Chapter as `subject_id` and on QuestionTaxonomy as `subject_id`. If BE chooses different names, the seed script + chain refinement will need a follow-up.

## 2026-05-26 01:05 — integration/joined-names-on-tag-row
- DONE: Joined-name fields on `TaxonomyTagRow` + strict input validation.
  - `types/taxonomy.ts` — `TaxonomyTagRow` now exposes optional `course_name`, `chapter_name?: string | null`, `topic_name?: string | null`, and `subject?: 'Physics' | 'Chemistry' | 'Maths' | 'Biology'`. All optional so the FE bulk-retag flow can build Row-shaped objects locally before the server round-trip, and so course-level-only tags (no chapter) can omit the chapter-derived names.
  - `lib/integrations/validation/taxonomy-tag.ts` — `taxonomyTagSchema` now `.strict()`. Reason captured inline: a confused client POSTing the output-only joined fields will get a clear validation error instead of a silent strip. `taxonomyTagRowSchema` left non-strict on purpose — it isn't used to validate inbound payloads, only to type-assert the row shape, and keeping it lenient avoids breaking the existing `_AssertTagRow` check.
  - `TaxonomyTag` (input type) intentionally unchanged. `InventoryCounts`, `BlueprintSection`, `TestGenerateInput` unchanged.
- Commit:
  - `27d536f` [INT] Add joined-name fields to TaxonomyTagRow
- PR: pending — branch pushed, no `gh` CLI on this machine. Orchestrator/admin to open via https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/joined-names-on-tag-row
- BLOCKED ON: none.
- NOTES / Contract change for BE + FE:
  - **BE (`backend/joined-names-on-tag-row` follow-up):** `withTaxonomies()` in `app/api/questions/route.ts` should now populate these four optional fields on every row returned from GET / POST / PATCH `/api/questions` responses. Source data: `course.name`, `chapter.name`, `chapter.subject`, `topic.name` from the joined Prisma `include`. Fields are optional in the type — BE is free to omit them on internal helper paths but **the public `/api/questions` responses should populate all four whenever the FKs are non-null**.
  - **FE (`frontend/multitax-blueprint-paper` rebase):** Chip-label rendering can now read `tag.course_name` / `tag.chapter_name` / `tag.topic_name` / `tag.subject` directly off each `TaxonomyTagRow` — no extra fetch needed against the courses tree. Until BE deploys the new `withTaxonomies()`, these fields will be `undefined`; treat them as optional and fall back to the existing tree-lookup (or to `course_id`-style placeholder text) so behavior degrades gracefully during the rolling deploy.
  - **POST contract reminder:** input `TaxonomyTag` payloads must NOT include `course_name` / `chapter_name` / `topic_name` / `subject`. The Zod input schema is now strict and will reject them.
- `npx tsc --noEmit` clean for every file in integration scope. Remaining pre-existing errors are all in FE files (`app/(dashboard)/questions/[id]/edit/page.tsx`, `app/(dashboard)/questions/[id]/page.tsx`, `components/questions/question-card.tsx`) that still read `q.course_id` / `q.exam_type` off `Question` — already flagged in the previous status entry and addressed on FE's `frontend/multitax-blueprint-paper` branch.

## 2026-05-25 16:30 — integration/m2m-types-and-validators
- DONE: M2M-taxonomy shared types + Zod validators + duplicate-check refactor + sample-courses seed.
  - `types/taxonomy.ts` — `ExamType`, `TaxonomyTag`, `TaxonomyTagRow`, `InventoryCounts`, `BlueprintSection`, `TestGenerateInput`.
  - `lib/ui/api.ts` — `Question` wire type now exposes `taxonomies: TaxonomyTagRow[]`; removed singular `course_id` / `chapter_id` / `topic_id` / `exam_type` and `course` / `chapter` / `topic` joined objects.
  - `lib/integrations/validation/taxonomy-tag.ts` — Zod for `TaxonomyTag` / `TaxonomyTagRow` with `topic_id → chapter_id` refinement; exports reusable `examTypeSchema`.
  - `lib/integrations/validation/blueprint.ts` — Zod for `TestGenerateInput`, `BlueprintSection`, and `InventoryCounts`. Refines: ≥1 section, ≥1 positive difficulty count per section, `duration_minutes ≥ 1`.
  - `lib/integrations/similarity/duplicate-check.ts` — added optional `FindSimilarOptions` (`course_id`, `chapter_id`); when set, queries through `question_taxonomies.some` so candidates are filtered by the M2M join. PrismaLike contract unchanged.
  - `scripts/seed-taxonomy.mjs` — re-runnable seed for `Class 8 — CBSE` + `Class 8 — ICSE`, each with one chapter (`Algebra Play`) and one topic (`Number Pyramids`). Uses `findFirst` + create/update (Course/Chapter/Topic don't have unique constraints in the current schema, so Prisma `upsert` isn't available). Prints `course_id` / `chapter_id` / `topic_id` for paste-into-import-dialog. Not auto-run.
- Commits:
  - `d7dfad5` [INT] Shared TaxonomyTag/InventoryCounts/TestGenerateInput types
  - `ec4edde` [INT] Update Question wire type to expose taxonomies array
  - `932b8ab` [INT] Zod validators for taxonomy-tag and blueprint
  - `52618eb` [INT] Duplicate check: filter by question_taxonomies join
  - `f0d4cac` [INT] Seed script for sample CBSE/ICSE courses
- PR: pending — branch pushed, no `gh` CLI available in this worktree. Orchestrator/admin to open via https://github.com/varenyameducation/VarenyamEducation/pull/new/integration/m2m-types-and-validators
- BLOCKED ON: none.
- NOTES:
  - Branched off `main` per brief. The BE M2M-schema commit (`3c5692d` on `orchestrator/sprint-m2m-briefs`) is **not yet on main** but the Prisma client on this machine is already generated against it, so `npx tsc --noEmit` reports pre-existing errors in BE route handlers (`app/api/questions/route.ts`, `app/api/questions/import/route.ts`, `app/api/questions/[id]/route.ts`, `app/api/tests/route.ts`) that still read `course_id` / `chapter_id` / `topic_id` / `exam_type` directly off `Question`. Those are BE's to migrate to `question_taxonomies` writes; flagged here so BE can sequence its follow-up.
  - **FE consumers of the old `Question` shape that BE/FE workers must update when rebasing onto this branch:**
    - `app/(dashboard)/questions/page.tsx` — reads `q.course?.id`, `q.chapter?.id`, `q.topic?.id`, `q.course?.name`, `q.chapter?.name`, `q.topic?.name` (filter + grouping). Needs to walk `q.taxonomies` instead.
    - `app/(dashboard)/questions/[id]/page.tsx` — renders `q.exam_type`. Use `q.taxonomies[0]?.exam_type` (or a comma-joined dedup of all tag exam_types).
    - `app/(dashboard)/questions/[id]/edit/page.tsx` — seeds the edit form from `q.course_id` / `q.chapter_id` / `q.topic_id` / `q.exam_type`. Needs to derive from `q.taxonomies[0]` or rework the edit form to manage the full tag array.
    - `components/questions/question-card.tsx` — renders `q.exam_type`. Same fix as above.
  - **BE files that still write singular columns and must be migrated to `question_taxonomies` rows:**
    - `app/api/questions/route.ts` (POST create + list-with-filter)
    - `app/api/questions/[id]/route.ts` (PATCH update)
    - `app/api/questions/import/route.ts` (bulk insert)
    - `app/api/tests/route.ts` (`test.exam_type` is unrelated — that column stays).
  - `npx tsc --noEmit` passes for every file in integration scope (`types/**`, `lib/integrations/**`, `lib/ui/api.ts`, `scripts/**`). All remaining errors are in FE/BE files listed above.
  - Brief said "keep the same external function signature" for `findSimilar`. The pre-refactor version had no callers (greenfield helper); I added a fourth optional `options` arg rather than changing existing positionals, so any future call site that passes only `(prisma, body, threshold)` still works.
  - Assumption: `exam_type` enum is the four-value set the brief lists (`school | board | jee | neet`). `Test.exam_type` in Prisma allows `'custom'` too but that's the Test row, not the per-question tag — documented here so FE knows the blueprint exam_type is the four-value set.

## 2026-05-03 20:47 — integration/taxonomy-types
- DONE: Added shared API envelope + domain types (`types/api.ts`, `types/domain.ts`) and Zod schemas (`lib/validation/common.ts`, `lib/validation/taxonomy.ts`) per PRD §3.3, §4.1, §6.1, §6.3.
- PR: pending (branch pushed, no PR opened — `gh` not installed in this worktree; orchestrator/admin to open via GitHub UI from https://github.com/varenyameducation/Varenyam/pull/new/integration/taxonomy-types)
- BLOCKED ON: none
- NOTES: `npx tsc --noEmit` passes. Followed existing zod style (`z.string().uuid()`, `z.coerce.number()`); zod 4.4.2 still accepts these. Did not touch `lib/api/response.ts`, schema, middleware, or routes per brief. Push had to go through main worktree (`/mnt/d/varenyam`) because GCM credential helper crashes when invoked from a worktree path under WSL — flagged for orchestrator if other workers hit the same.
