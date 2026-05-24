# Integration status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

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
