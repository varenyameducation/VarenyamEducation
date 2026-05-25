// Shared taxonomy + blueprint types for the M2M sprint.
//
// Read by BE (route handlers / validators) and FE (forms, results lists,
// blueprint builder). Lives in `types/**` so neither side has to import
// across role boundaries — integration owns this file.

export type ExamType = 'school' | 'board' | 'jee' | 'neet'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'advanced'

export type QuestionType = 'mcq' | 'numerical' | 'subjective' | 'multi_select'

// One taxonomy tag, as posted from the client. `chapter_id` and `topic_id`
// are optional, with the constraint that a topic always implies a chapter
// (enforced in the Zod schema, not the type).
export interface TaxonomyTag {
  course_id: string
  chapter_id?: string | null
  topic_id?: string | null
  exam_type: ExamType
}

// Wire-format echo of a QuestionTaxonomy row from the API. Extends the input
// shape with server-assigned identity columns + denormalized name fields so
// the FE can render chip labels (e.g. "Class 8 — CBSE / Algebra Play /
// Number Pyramids · jee") without a separate fetch of the courses tree.
//
// All name fields are optional because:
//   (a) the FE bulk-retag flow constructs Row-shaped objects locally before
//       the server round-trip, so it has IDs but not yet names; and
//   (b) `chapter_name` / `topic_name` are themselves only present when the
//       tag has a chapter/topic, and `subject` rides on Chapter so it's
//       absent for course-level-only tags.
export interface TaxonomyTagRow extends TaxonomyTag {
  id: string
  created_at: string
  course_name?: string
  chapter_name?: string | null
  topic_name?: string | null
  subject?: 'Physics' | 'Chemistry' | 'Maths' | 'Biology'
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
  blueprint: Partial<Record<Difficulty, number>>
  chapter_ids?: string[]
  topic_ids?: string[]
  question_type?: QuestionType
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
