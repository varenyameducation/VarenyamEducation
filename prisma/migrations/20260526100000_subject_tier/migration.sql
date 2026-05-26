-- Subject-tier migration: data-preserving backfill.
--
-- Promotes the `chapters.subject` String column into its own `subjects` table
-- (one row per distinct (course_id, subject) pair on existing chapters), then
-- repoints `chapters` at it via `subject_id`. Adds `subject_id` to the
-- `question_taxonomies` junction so questions can be tagged at the Subject
-- level. Backfills the junction `subject_id` from each row's chapter so
-- existing tags keep pointing at the same Subject in the new model.
--
-- DO NOT split the steps across separate migrations — the intermediate state
-- (subject_id NULL on chapters) is rejected by the resulting NOT NULL.

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
