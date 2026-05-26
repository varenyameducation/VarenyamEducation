# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Subject-tier schema + backfill migration + CRUD + junction column

**Why:** Taxonomy is moving to a **strict 4-tier hierarchy**: Course → Subject → Chapter → Topic. Subject was a String column on Chapter; it becomes its own entity. The existing DB has live data (5 courses, several chapters carrying real `subject` strings) — **the migration MUST preserve that data via backfill**. The QuestionTaxonomy junction gains an optional `subject_id` column so questions can be tagged at the Subject level.

**Branch:** `backend/subject-tier`

**Base off:** `integration/subject-tier` so your code typechecks against the new `Subject` interface and `TaxonomyTag.subject_id`. Rebase to `main` if INT has merged.

### Prisma schema

- [ ] Add the `Subject` model:

  ```prisma
  model Subject {
    id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    course_id  String    @db.Uuid
    name       String
    is_active  Boolean   @default(true)
    created_by String?   @db.Uuid
    created_at DateTime  @default(now()) @db.Timestamptz
    updated_at DateTime  @updatedAt @db.Timestamptz
    deleted_at DateTime? @db.Timestamptz

    course              Course               @relation(fields: [course_id], references: [id], onDelete: Cascade)
    creator             User?                @relation(fields: [created_by], references: [id])
    chapters            Chapter[]
    question_taxonomies QuestionTaxonomy[]

    @@unique([course_id, name])
    @@index([course_id])
    @@map("subjects")
  }
  ```

- [ ] Update `Chapter`:
  - Drop `course_id` and `subject` (string) columns.
  - Add `subject_id String @db.Uuid`.
  - Add relation `subject Subject @relation(fields: [subject_id], references: [id], onDelete: Cascade)`.
  - Drop the old `@@index([course_id])` and `course` relation.
  - Add `@@index([subject_id])`.

- [ ] Update `QuestionTaxonomy`:
  - Add `subject_id String? @db.Uuid`.
  - Add relation `subject Subject? @relation(fields: [subject_id], references: [id])`.
  - Update `@@unique` to include `subject_id`: `[question_id, course_id, subject_id, chapter_id, topic_id, exam_type]`.
  - Add `@@index([subject_id])`.

- [ ] Inverse relations on `Course` (add `subjects Subject[]`) and `User` (add `subjects Subject[]`).

### Migration (backfill, data-preserving)

Generate **two** files for clarity, or one combined — your call:

- [ ] `npx prisma migrate dev --name subject_tier --create-only`. Edit the generated `migration.sql` so it does the following in order (Prisma's default diff will be wrong because it'll just drop columns; you MUST hand-edit):

  ```sql
  -- 1. Create subjects table
  CREATE TABLE "subjects" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "course_id"  UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
    "name"       TEXT NOT NULL,
    "is_active"  BOOLEAN DEFAULT TRUE,
    "created_by" UUID REFERENCES "users"("id"),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW(),
    "deleted_at" TIMESTAMPTZ,
    UNIQUE ("course_id", "name")
  );
  CREATE INDEX "subjects_course_id_idx" ON "subjects"("course_id");

  -- 2. Backfill: one Subject row per distinct (course_id, subject string) on Chapter
  INSERT INTO "subjects" ("course_id", "name", "created_at", "updated_at")
  SELECT DISTINCT "course_id", "subject", NOW(), NOW()
  FROM "chapters"
  WHERE "deleted_at" IS NULL;

  -- 3. Add subject_id to chapters (nullable first), populate, then enforce NOT NULL
  ALTER TABLE "chapters" ADD COLUMN "subject_id" UUID;
  UPDATE "chapters" c
  SET "subject_id" = s."id"
  FROM "subjects" s
  WHERE c."course_id" = s."course_id" AND c."subject" = s."name";
  ALTER TABLE "chapters" ALTER COLUMN "subject_id" SET NOT NULL;
  ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE;
  CREATE INDEX "chapters_subject_id_idx" ON "chapters"("subject_id");

  -- 4. Drop chapters.course_id and chapters.subject
  ALTER TABLE "chapters" DROP CONSTRAINT IF EXISTS "chapters_course_id_fkey";
  DROP INDEX IF EXISTS "idx_chapters_course";
  ALTER TABLE "chapters" DROP COLUMN "course_id";
  ALTER TABLE "chapters" DROP COLUMN "subject";

  -- 5. Add subject_id to question_taxonomies + backfill from chapter
  ALTER TABLE "question_taxonomies" ADD COLUMN "subject_id" UUID;
  UPDATE "question_taxonomies" qt
  SET "subject_id" = c."subject_id"
  FROM "chapters" c
  WHERE qt."chapter_id" = c."id";
  ALTER TABLE "question_taxonomies" ADD CONSTRAINT "question_taxonomies_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id");
  CREATE INDEX "question_taxonomies_subject_id_idx" ON "question_taxonomies"("subject_id");

  -- 6. Replace the old unique index to include subject_id
  DROP INDEX IF EXISTS "question_taxonomies_question_id_course_id_chapter_id_topic__key";
  CREATE UNIQUE INDEX "question_taxonomies_question_id_course_id_subject_id_chapter_id_topic_id_exam_type_key"
    ON "question_taxonomies"("question_id", "course_id", "subject_id", "chapter_id", "topic_id", "exam_type");
  ```

  The migration is destructive on `chapters.course_id` and `chapters.subject` columns but lossless on data — every existing chapter ends up pointing at a backfilled Subject row. Test on the live DB via `dotenv-cli -e .env.local -- prisma migrate deploy` ONLY after committing; orchestrator can run it. **Do not run it from your worktree.**

### API changes — Taxonomy

- [ ] New routes under `app/api/taxonomy/subjects/`:
  - `GET  /api/taxonomy/subjects?course_id=...` — list subjects for a course (optional `course_id` filter; if omitted, returns ALL non-deleted subjects). Auth: any logged-in user. Response uses standard `{ items, page, limit, total }` envelope.
  - `POST /api/taxonomy/subjects` — create (admin/super_admin). Body validated via `subjectCreateSchema`. Soft-delete-aware uniqueness check.
  - `GET  /api/taxonomy/subjects/[id]` — get one.
  - `PATCH /api/taxonomy/subjects/[id]` — update name (admin/super_admin).
  - `DELETE /api/taxonomy/subjects/[id]` — soft delete (super_admin). 409 `SUBJECT_HAS_CHAPTERS` if any non-deleted Chapter still references it. On success, set `deleted_at` on the Subject (do NOT cascade-delete chapters — that's the user's responsibility).

- [ ] Update `/api/taxonomy/chapters` POST + PATCH bodies to accept `subject_id` instead of `course_id` + `subject` string. List endpoint accepts optional `subject_id` query filter (and still `course_id` for backward compat — when both are given, `subject_id` wins; when only `course_id` is given, join through Subject and return all chapters under that course).

- [ ] Update `/api/taxonomy/courses` DELETE soft-delete cascade: Course → Subjects → Chapters → Topics (the cascade just walks the new chain; one extra hop).

- [ ] All endpoints continue to use the existing helpers in `lib/api/taxonomy.ts` (auth, parseJsonBody, listEnvelope).

### API changes — Questions / Junction

- [ ] `lib/api/questions.ts` — extend `taxonomyRowSelect` to include `subject` join:

  ```ts
  const taxonomyRowSelect = {
    id: true, course_id: true, subject_id: true, chapter_id: true, topic_id: true,
    exam_type: true, created_at: true,
    course:  { select: { id: true, name: true } },
    subject: { select: { id: true, name: true } },   // NEW
    chapter: { select: { id: true, name: true } },   // NOTE: chapter no longer has a `subject` column; drop that selection
    topic:   { select: { id: true, name: true } },
  } as const
  ```

  Update `flattenTaxonomyRow` to populate `subject_id`, `subject_name`. The legacy `subject` field on the flattened row can now be sourced from `subject.name` (instead of `chapter.subject`) — keep it for backward compat with FE's existing reads.

- [ ] `POST /api/questions` body — `taxonomies` array now accepts `subject_id?`. Validate via the updated `taxonomyTagSchema` (chain refinement). When inserting, populate `subject_id` on each junction row.

- [ ] `PATCH /api/questions/[id]` body — same. The diff-against-existing logic must compare on the full `(course_id, subject_id, chapter_id, topic_id, exam_type)` key.

- [ ] `POST /api/questions/[id]/taxonomies` — same body change.

- [ ] `POST /api/questions/bulk/retag` — same.

- [ ] `GET /api/questions` filter query params — accept new `subject_id` filter. Existing `course_id`/`chapter_id`/`topic_id`/`exam_type` still work and are AND'd via `question_taxonomies.some(...)`.

- [ ] `GET /api/questions/inventory-counts` — accept `subject_id` filter alongside the others.

- [ ] `POST /api/tests/generate` — blueprint sections accept optional `subject_id` scope (alongside `chapter_ids` / `topic_ids`). Filter accordingly.

### API changes — Topic delete pre-check

- [ ] `app/api/taxonomy/topics/[id]` DELETE — the `TOPIC_HAS_QUESTIONS` 409 check currently counts via `question_taxonomies.some({ topic_id })`. Confirm it still works post-migration (it should — the column is unchanged on that table).

### Validation

- [ ] `npx prisma generate` clean (against the new schema).
- [ ] `npx tsc --noEmit` clean.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. Check INT branch status:
   ```
   git fetch origin
   git log origin/main --oneline -5 | grep -i "subject-tier" || echo "INT not merged — base off integration/subject-tier"
   ```
   - If INT merged: `git checkout main && git pull && git checkout -b backend/subject-tier`
   - Else: `git checkout origin/integration/subject-tier -b backend/subject-tier` (rebase to main later)
3. Schema → migration (hand-edit per the SQL above) → API changes → typecheck.
4. Commit by group with `[BE]` prefix. **No Claude attribution.** Suggested split:
   - `[BE] Subject model + chapter restructure + backfill migration`
   - `[BE] /api/taxonomy/subjects CRUD endpoints`
   - `[BE] Question/junction routes: subject_id on tags, filters, generate, inventory`
   - `[BE] /api/taxonomy/chapters: subject_id replaces course_id+subject`
5. Push. If credential-manager refuses from `/mnt/d/varenyam-be`, commit locally and orchestrator will push from main worktree.
6. Append entry to `.agents/status-backend.md` with branch, commit SHAs, PR URL, and a "Contract changes" block. Flag any FE files that read the dropped `chapter.subject` column directly.
7. **Stop.** Skip `~/report.sh`.

### Hard rules

- The migration MUST preserve data. Test by inspecting `subjects` row count after `prisma migrate deploy` — should equal `COUNT(DISTINCT course_id, subject) FROM chapters`. Brief reviewer (orchestrator) will verify before announcing.
- Do not touch `types/**`, `app/(dashboard)/**`, `components/**`, `lib/ui/**`.
- Do not touch `Question.subject` column — that stays.
- The DB is live with real data. Do NOT run `prisma migrate reset` or any destructive command from your worktree.
