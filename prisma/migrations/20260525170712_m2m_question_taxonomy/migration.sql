/*
  Warnings:

  - You are about to drop the column `chapter_id` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `course_id` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `exam_type` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `topic_id` on the `questions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_chapter_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_topic_id_fkey";

-- DropForeignKey
ALTER TABLE "test_questions" DROP CONSTRAINT "test_questions_question_id_fkey";

-- DropIndex
DROP INDEX "idx_q_chapter";

-- DropIndex
DROP INDEX "idx_q_course";

-- DropIndex
DROP INDEX "idx_q_exam_type";

-- DropIndex
DROP INDEX "idx_q_topic";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "chapter_id",
DROP COLUMN "course_id",
DROP COLUMN "exam_type",
DROP COLUMN "topic_id";

-- CreateTable
CREATE TABLE "question_taxonomies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "chapter_id" UUID,
    "topic_id" UUID,
    "exam_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_taxonomies_course_id_idx" ON "question_taxonomies"("course_id");

-- CreateIndex
CREATE INDEX "question_taxonomies_chapter_id_idx" ON "question_taxonomies"("chapter_id");

-- CreateIndex
CREATE INDEX "question_taxonomies_topic_id_idx" ON "question_taxonomies"("topic_id");

-- CreateIndex
CREATE INDEX "question_taxonomies_question_id_idx" ON "question_taxonomies"("question_id");

-- CreateIndex
CREATE INDEX "question_taxonomies_exam_type_idx" ON "question_taxonomies"("exam_type");

-- CreateIndex
CREATE UNIQUE INDEX "question_taxonomies_question_id_course_id_chapter_id_topic__key" ON "question_taxonomies"("question_id", "course_id", "chapter_id", "topic_id", "exam_type");

-- AddForeignKey
ALTER TABLE "question_taxonomies" ADD CONSTRAINT "question_taxonomies_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_taxonomies" ADD CONSTRAINT "question_taxonomies_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_taxonomies" ADD CONSTRAINT "question_taxonomies_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_taxonomies" ADD CONSTRAINT "question_taxonomies_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
