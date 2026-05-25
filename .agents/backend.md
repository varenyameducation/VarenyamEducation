# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — M2M question taxonomy + test blueprint generator

**Sprint goal:** A single question row can belong to multiple Courses, Chapters/Topics, and Exam types (CBSE + ICSE, school + JEE, etc.). Test creation supports section-aware blueprint pulls ("5 easy, 3 medium, 2 hard from Algebra Play").

**Branch:** `backend/m2m-taxonomy-and-blueprint`

**The DB is currently empty** (orchestrator cleared all questions / tests / test_questions on 2026-05-25). You may write a destructive migration without data-preservation concerns. Drop the old singular FK columns from `Question` in the same migration.

### Schema changes (Prisma + migration)

- [ ] Drop columns `course_id`, `chapter_id`, `topic_id`, `exam_type` from `Question`. Keep `subject` (it's a static enum, not a taxonomy node).
- [ ] Add junction model `QuestionTaxonomy`:
  ```prisma
  model QuestionTaxonomy {
    id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    question_id String   @db.Uuid
    course_id   String   @db.Uuid
    chapter_id  String?  @db.Uuid   // optional — a question can be tagged at course level only
    topic_id    String?  @db.Uuid   // optional — chapter-only tagging is allowed
    exam_type   String                 // 'school' | 'board' | 'jee' | 'neet'
    created_at  DateTime @default(now()) @db.Timestamptz

    question Question @relation(fields: [question_id], references: [id], onDelete: Cascade)
    course   Course   @relation(fields: [course_id], references: [id])
    chapter  Chapter? @relation(fields: [chapter_id], references: [id])
    topic    Topic?   @relation(fields: [topic_id], references: [id])

    @@unique([question_id, course_id, chapter_id, topic_id, exam_type])
    @@index([course_id])
    @@index([chapter_id])
    @@index([topic_id])
    @@map("question_taxonomies")
  }
  ```
- [ ] Add the inverse `question_taxonomies QuestionTaxonomy[]` relation field on `Question`, `Course`, `Chapter`, `Topic`.
- [ ] Generate migration: `npx prisma migrate dev --name m2m_question_taxonomy --create-only`. Do **not** run it — orchestrator will apply against the real DB. Commit the migration file.
- [ ] **Drop `test_questions.question_id` FK to use `onDelete: Cascade`** at the same time (the test_questions row should disappear when a question is hard-deleted). Currently no cascade; add it.

### API changes — Question

- [ ] `POST /api/questions` — accept new field `taxonomies: TaxonomyTag[]` where `TaxonomyTag = { course_id: string; chapter_id?: string; topic_id?: string; exam_type: 'school'|'board'|'jee'|'neet' }`. Create the question + the junction rows in a single Prisma transaction. Reject if `taxonomies` is empty.
- [ ] `PATCH /api/questions/[id]` — accept `taxonomies` field as the full replacement set (idempotent). Diff against existing rows: insert new, delete removed, leave unchanged ones alone.
- [ ] `GET /api/questions` — accept new filter query params: `course_id`, `chapter_id`, `topic_id`, `exam_type` — all filter via `question_taxonomies`. Existing `?subject=` still filters via the column on Question. Response includes `taxonomies: TaxonomyTag[]` in each item.
- [ ] `GET /api/questions/[id]` — response includes `taxonomies: TaxonomyTag[]`.
- [ ] **New: `POST /api/questions/[id]/taxonomies`** — body `{ taxonomies: TaxonomyTag[] }` adds these tags (skips duplicates). For bulk re-tag flows.
- [ ] **New: `DELETE /api/questions/[id]/taxonomies/[taxonomyId]`** — removes a single tag.
- [ ] **New: `POST /api/questions/bulk/retag`** — body `{ question_ids: string[]; add?: TaxonomyTag[]; remove?: TaxonomyTag[] }` for moving many questions across taxonomies at once. Wrap in a transaction.

### API changes — Import

- [ ] `POST /api/questions/import` (docx/pdf path) — instead of writing singular `course_id`/`chapter_id`/`topic_id` on each Question, write one row in `question_taxonomies` per question using the form's defaults. The `exam_type` form field becomes the junction row's `exam_type`.
- [ ] Same change for the xlsx path. The xlsx schema currently has `course_name`/`chapter_name`/`topic_name`/`exam_type` columns — translate those into a single junction row per question. (Future iteration: allow xlsx to specify multiple tag rows per question. Out of scope for this brief.)

### API changes — Tests (blueprint generation)

- [ ] **New: `POST /api/tests/generate`** — generate a test from a blueprint. Body:
  ```ts
  {
    title: string
    course_id: string
    subject: 'Physics' | 'Chemistry' | 'Maths' | 'Biology'
    exam_type: 'school' | 'board' | 'jee' | 'neet'
    duration_minutes: number
    instructions?: string
    sections: Array<{
      label: string                 // "Section A"
      blueprint: {
        easy?: number
        medium?: number
        hard?: number
        advanced?: number
      }
      // Optional: scope picks to specific chapters/topics within the course
      chapter_ids?: string[]
      topic_ids?: string[]
      // Optional: prefer specific question_type (defaults: any)
      question_type?: 'mcq' | 'numerical' | 'subjective' | 'multi_select'
    }>
  }
  ```
  Behavior:
  - For each section, pull questions matching (course_id via junction, exam_type via junction, subject, optionally chapter_ids/topic_ids/question_type, difficulty). Random sample without replacement across the whole test.
  - If a section can't be filled (e.g. asked for 5 hard but only 3 exist), return `400 INSUFFICIENT_QUESTIONS` with `details: { section_label, difficulty, available, requested }`.
  - On success, create a Test row + TestQuestion rows in a transaction with `position` ordered by section then random pick, `section_label` set on each TQ.
  - Return the created test with `test_questions` already included.

- [ ] **New: `GET /api/questions/inventory-counts`** — body or query `course_id, exam_type, subject, chapter_ids[], topic_ids[]` returns counts per difficulty per question_type:
  ```ts
  { counts: { easy: number; medium: number; hard: number; advanced: number; total: number } }
  ```
  This powers the FE blueprint builder ("you have 12 hard available; you asked for 5 — OK").

### Validation

- [ ] All new bodies validated with Zod. Reuse `lib/validation/question.ts` patterns. Add a new `lib/api/tests.ts` block for the generate schema.
- [ ] On Zod failure, return `400 INVALID_BODY` with full issue list in `details.issues`.

### Existing-callsite cleanup

- [ ] Search every callsite that reads `question.course_id` / `question.chapter_id` / `question.topic_id` and migrate to read from `question_taxonomies`. Notable spots: `/api/questions` GET (the existing `course/chapter/topic` includes), the questions tree on `/api/tests` if it filters, the duplicate-check in `lib/integrations/similarity/duplicate-check.ts` (NOT in your scope — flag for integration in status).
- [ ] Update `/api/questions` response shape: `course`, `chapter`, `topic` singular include fields are gone — replace with `taxonomies` array. Keep `subject` on the question.

### Scope

- `app/api/**`, `lib/api/**`, `lib/db/**`, `lib/auth/**`, `prisma/**`.
- Out of scope: `app/(dashboard)/**`, `components/**`, `lib/ui/**`, `lib/integrations/**`, `middleware.ts`.
- If you must touch `lib/integrations/document/parse-questions-text.ts` to thread taxonomies through, **don't** — flag it in `status-backend.md` for the integration worker.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. `git checkout main && git pull && git checkout -b backend/m2m-taxonomy-and-blueprint`
3. Implement schema first → migration → API changes → existing-callsite cleanup → typecheck.
4. Commit by group with `[BE]` prefix (e.g. `[BE] M2M question taxonomy schema + migration`, `[BE] /api/questions accepts and returns taxonomies`, `[BE] /api/tests/generate blueprint endpoint`, `[BE] inventory-counts endpoint for blueprint preview`). **No `Co-Authored-By: Claude` footer.**
5. Push. Record the GitHub `pull/new` URL.
6. Append entry to `.agents/status-backend.md` with branch, commit list, PR URL, and any callsite handoffs to integration.
7. Run `~/report.sh backend "<short summary>"`.
8. **Stop.**

### Hard rules

- One PR for the whole sprint task. Multiple commits OK; one branch.
- The migration must be **--create-only** (file lands, no DB apply). Orchestrator applies.
- Do not touch FE files. Do not touch `lib/ui/**`.
- If you discover a needed contract change that affects FE (e.g. you renamed a response field), append a `## Contract change` block to `status-backend.md` so FE worker can adjust when they rebase.
