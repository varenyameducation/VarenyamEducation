# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Shared types, Zod, and duplicate-check for M2M taxonomy

**Sprint goal:** Provide the cross-cutting types, validators, and integration-layer updates that BE and FE both need for the M2M-taxonomy + blueprint sprint. You're the unblocker for both tracks.

**Branch:** `integration/m2m-types-and-validators`

### Track 1 — Shared types

- [ ] `types/taxonomy.ts` — new file. Export:
  ```ts
  export type ExamType = 'school' | 'board' | 'jee' | 'neet'

  export interface TaxonomyTag {
    course_id: string
    chapter_id?: string | null
    topic_id?: string | null
    exam_type: ExamType
  }

  // Wire-format echo of QuestionTaxonomy row from BE, includes server-assigned id
  export interface TaxonomyTagRow extends TaxonomyTag {
    id: string
    created_at: string
  }

  export interface InventoryCounts {
    easy: number
    medium: number
    hard: number
    advanced: number
    total: number
  }

  export interface BlueprintSection {
    label: string
    blueprint: Partial<Record<'easy' | 'medium' | 'hard' | 'advanced', number>>
    chapter_ids?: string[]
    topic_ids?: string[]
    question_type?: 'mcq' | 'numerical' | 'subjective' | 'multi_select'
  }

  export interface TestGenerateInput {
    title: string
    course_id: string
    subject: 'Physics' | 'Chemistry' | 'Maths' | 'Biology'
    exam_type: ExamType
    duration_minutes: number
    instructions?: string
    sections: BlueprintSection[]
  }
  ```
- [ ] Update `lib/ui/api.ts` — change `Question` interface:
  - Remove the singular `course?: { id; name }`, `chapter?: { id; name }`, `topic?: { id; name }`, `exam_type` fields.
  - Add `taxonomies: TaxonomyTagRow[]` (always present; can be empty array for legacy untagged rows).
  - Keep `subject` as-is.
- [ ] Search for every TS file that destructures `q.course_id` / `q.chapter_id` / `q.topic_id` / `q.exam_type` and either rewrite to use `q.taxonomies[0]?.…` or — if the location is in `components/**` or `app/(dashboard)/**` — flag in status for FE. **Do not edit FE or BE files directly.** Your edits are confined to `types/**`, `lib/integrations/**`, and `lib/ui/api.ts` (the shared types file, which is integration territory).

### Track 2 — Zod schemas

- [ ] `lib/integrations/validation/taxonomy-tag.ts` — Zod schema for `TaxonomyTag` and `TaxonomyTagRow`. Constraints:
  - `course_id` UUID, required.
  - `chapter_id`, `topic_id` UUID or null/omitted.
  - `exam_type` enum of the four values.
  - Refinement: if `topic_id` is set, `chapter_id` must also be set.
- [ ] `lib/integrations/validation/blueprint.ts` — Zod schema for `TestGenerateInput`. Refinements:
  - At least one section.
  - Each section's blueprint has at least one positive count.
  - `duration_minutes` ≥ 1.

### Track 3 — Duplicate check refactor

- [ ] `lib/integrations/similarity/duplicate-check.ts` — currently filters candidates by `course_id` / `chapter_id` from the Question table. Update to query candidates whose `question_taxonomies` share at least one course (or course+chapter if provided). Keep the same external function signature; only internals change. **Use the Prisma client through the existing `find` callback contract — don't import Prisma directly here.**

### Track 4 — Seed script (small, optional but encouraged)

- [ ] `scripts/seed-taxonomy.mjs` — a one-off seed (Node script, similar style to `scripts/bootstrap-admin.mjs`) that creates:
  - 2 sample Courses: "Class 8 — CBSE" and "Class 8 — ICSE".
  - 1 chapter per course: "Algebra Play" (or similar).
  - 1 topic per chapter: "Number Pyramids".
  - Re-runnable (upsert by `name + grade + stream` for Course; by `course_id + name` for Chapter; by `chapter_id + name` for Topic).
  - Output: print IDs so the user can plug them into the import dialog without UI clicking.
  - The script lives in `scripts/`. Do not auto-run it.

### Scope

- `types/**`, `lib/integrations/**`, `lib/ui/api.ts` (the shared API types only — not the React components in lib/ui/render-body etc.), `scripts/**`, `.env.example` if env additions are needed.
- Out of scope: `app/**` (including `app/api/**`), `components/**`, `lib/api/**`, `lib/db/**`, `lib/auth/**`, `prisma/**`, `middleware.ts`, `lib/export/**`, `lib/ui/render-body.tsx`, `.agents/**`, `docs/**`.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git checkout main && git pull && git checkout -b integration/m2m-types-and-validators`
3. Implement. Typecheck passes.
4. Commit with `[INT]` prefix:
   - `[INT] Shared TaxonomyTag/InventoryCounts/TestGenerateInput types`
   - `[INT] Update Question wire type to expose taxonomies array`
   - `[INT] Zod validators for taxonomy-tag and blueprint`
   - `[INT] Duplicate check: filter by question_taxonomies join`
   - `[INT] Seed script for sample CBSE/ICSE courses`
   **No `Co-Authored-By: Claude` footer.**
5. Push. Record `pull/new` URL.
6. Append entry to `.agents/status-integration.md` with branch, commits, PR URL, list of FE/BE files that still consume the old `Question` shape (so other workers can rebase cleanly).
7. Run `~/report.sh integration "<short summary>"`.
8. **Stop.**

### Hard rules

- Your PR is the unblocker. Both FE and BE will import from `types/taxonomy.ts` and the validators. Land it fast — ideally before BE finishes its schema work.
- Do not edit Prisma schema or migrations. Do not edit API route handlers. Do not edit React components.
- If you find a contract ambiguity (e.g. should `exam_type` allow `'custom'` like `Test.exam_type` does?), default to the brief, document the assumption in status, and move on.
