# Backend status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

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
