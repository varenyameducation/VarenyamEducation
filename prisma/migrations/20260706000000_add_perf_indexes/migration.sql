-- Add deleted_at index to questions (nearly every query filters WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS "idx_q_deleted_at" ON "questions"("deleted_at");

-- Add deleted_at index to tests
CREATE INDEX IF NOT EXISTS "idx_tests_deleted_at" ON "tests"("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_tests_created_by" ON "tests"("created_by");

-- Composite indexes on question_taxonomies for the common join pattern
-- (filter by chapter/topic, then join back to questions)
CREATE INDEX IF NOT EXISTS "idx_qt_chapter_question" ON "question_taxonomies"("chapter_id", "question_id");
CREATE INDEX IF NOT EXISTS "idx_qt_topic_question" ON "question_taxonomies"("topic_id", "question_id");
CREATE INDEX IF NOT EXISTS "idx_qt_course_question" ON "question_taxonomies"("course_id", "question_id");
