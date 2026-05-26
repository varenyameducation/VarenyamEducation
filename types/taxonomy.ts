// Shared taxonomy + blueprint types for the M2M sprint.
//
// Read by BE (route handlers / validators) and FE (forms, results lists,
// blueprint builder). Lives in `types/**` so neither side has to import
// across role boundaries — integration owns this file.

export type ExamType = 'school' | 'board' | 'jee' | 'neet'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'advanced'

export type QuestionType = 'mcq' | 'numerical' | 'subjective' | 'multi_select'

// One taxonomy tag, as posted from the client. With the 4-tier hierarchy
// (Course → Subject → Chapter → Topic) each id is optional below the
// required course_id, but the Zod schema enforces a chain rule:
// topic_id ⇒ chapter_id ⇒ subject_id ⇒ course_id.
export interface TaxonomyTag {
  course_id: string
  subject_id?: string | null
  chapter_id?: string | null
  topic_id?: string | null
  exam_type: ExamType
}

// Wire-format echo of a QuestionTaxonomy row from the API. Extends the input
// shape with server-assigned identity columns + denormalized name fields so
// the FE can render chip labels (e.g. "Class 8 — CBSE / Maths / Algebra
// Play / Number Pyramids · jee") without a separate fetch of the courses
// tree.
//
// All name fields are optional because:
//   (a) the FE bulk-retag flow constructs Row-shaped objects locally before
//       the server round-trip, so it has IDs but not yet names; and
//   (b) `subject_name` / `chapter_name` / `topic_name` are only present when
//       the corresponding id is set on the tag.
//
// `subject` is the free-text echo of `Subject.name`. Kept as `string` (not
// the canonical four-value union) so post-subject-tier rows — which may
// legitimately carry names like "Computer Science" — survive the migration.
export interface TaxonomyTagRow extends TaxonomyTag {
  id: string
  created_at: string
  course_name?: string
  subject_name?: string | null
  chapter_name?: string | null
  topic_name?: string | null
  subject?: string
}

// Subject is a proper entity in the 4-tier hierarchy. One Course has many
// Subjects; one Subject has many Chapters. `name` is free-text so an
// institute can use the canonical four ('Physics' / 'Chemistry' / 'Maths' /
// 'Biology') or a custom string like 'Computer Science'.
export interface Subject {
  id: string
  course_id: string
  name: string
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
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
