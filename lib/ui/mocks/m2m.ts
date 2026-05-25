// M2M (many-to-many) taxonomy mocks. The backend is in flight on
// `backend/m2m-taxonomy-and-blueprint`; this module gives the FE a typed
// stand-in for the new wire shapes so we can build the UI today and swap
// to real fetches in the last commit.
//
// Replace these once BE lands real /api/questions taxonomy tags +
// /api/questions/inventory-counts + /api/tests/generate.

import type {
  DifficultyValue,
  ExamTypeValue,
  QuestionTypeValue,
  SubjectValue,
} from '@/lib/validation/question'

// A taxonomy "tag" attached to a question. Chapter and topic may be null
// (an "exam-type-only" tag like just "JEE / Physics" is valid).
export type TaxonomyTag = {
  course_id: string
  course_name: string
  chapter_id: string | null
  chapter_name: string | null
  topic_id: string | null
  topic_name: string | null
  subject: SubjectValue
  exam_type: ExamTypeValue
}

// Shape returned by GET /api/questions/inventory-counts.
// Sliced by chapter/topic/question_type/exam_type/course/subject.
export type InventoryCounts = {
  total: number
  by_difficulty: Record<DifficultyValue, number>
}

// What the Generate-test wizard POSTs.
export type GenerateTestPayload = {
  title: string
  course_id: string
  subject: SubjectValue
  exam_type: ExamTypeValue
  duration_minutes: number
  instructions?: string
  sections: BlueprintSection[]
}

export type BlueprintSection = {
  label: string
  chapter_ids?: string[]
  topic_ids?: string[]
  question_type?: QuestionTypeValue
  difficulty: Record<DifficultyValue, number>
}

// Sample taxonomy tag arrays — one MCQ pulled across two courses, one
// numerical with course-only tag, one subjective school question.
export const MOCK_M2M_TAGS_BY_QUESTION: Record<string, TaxonomyTag[]> = {
  'q-sample-cross': [
    {
      course_id: 'c-jee-foundation',
      course_name: 'JEE Foundation',
      chapter_id: 'ch-jee-laws-of-motion',
      chapter_name: 'Laws of Motion',
      topic_id: 't-lom-newton2',
      topic_name: "Newton's second law",
      subject: 'Physics',
      exam_type: 'jee',
    },
    {
      course_id: 'c-class11-pcm',
      course_name: 'Class 11 — PCM',
      chapter_id: 'ch-c11-kinematics',
      chapter_name: 'Kinematics',
      topic_id: 't-kin-acceleration',
      topic_name: 'Uniform acceleration',
      subject: 'Physics',
      exam_type: 'school',
    },
  ],
  'q-sample-numerical': [
    {
      course_id: 'c-neet-class12',
      course_name: 'NEET Class 12',
      chapter_id: null,
      chapter_name: null,
      topic_id: null,
      topic_name: null,
      subject: 'Biology',
      exam_type: 'neet',
    },
  ],
  'q-sample-school': [
    {
      course_id: 'c-class11-pcm',
      course_name: 'Class 11 — PCM',
      chapter_id: 'ch-c11-sets',
      chapter_name: 'Sets and Functions',
      topic_id: 't-sets-functions',
      topic_name: 'Relations and functions',
      subject: 'Maths',
      exam_type: 'board',
    },
  ],
}

// Fake inventory counts the test creator queries while the user adjusts
// section scope. The real endpoint is GET /api/questions/inventory-counts
// with course_id/exam_type/subject/chapter_ids/topic_ids/question_type
// in the query string.
export function mockInventoryCounts(scope: {
  course_id?: string
  exam_type?: string
  subject?: string
  chapter_ids?: string[]
  topic_ids?: string[]
  question_type?: string
}): InventoryCounts {
  // Deterministic-ish numbers based on how specific the scope is — more
  // filters → fewer available. Lets the UI demo the "12 hard available"
  // and "exceeds available" warnings without a backend.
  const filterCount =
    (scope.course_id ? 1 : 0) +
    (scope.chapter_ids?.length ?? 0) +
    (scope.topic_ids?.length ?? 0) +
    (scope.question_type ? 1 : 0) +
    (scope.subject ? 1 : 0)
  const base = Math.max(8, 40 - filterCount * 6)
  return {
    total: base * 4,
    by_difficulty: {
      easy: Math.max(2, Math.round(base * 1.1)),
      medium: Math.max(2, Math.round(base * 1.3)),
      hard: Math.max(1, Math.round(base * 0.9)),
      advanced: Math.max(1, Math.round(base * 0.6)),
    },
  }
}

// Format helper used by chips/cards.
export function formatTagLabel(tag: TaxonomyTag): string {
  const parts: string[] = [tag.course_name]
  if (tag.chapter_name) parts.push(tag.chapter_name)
  if (tag.topic_name) parts.push(tag.topic_name)
  parts.push(tag.exam_type)
  return parts.join(' · ')
}

// Minimum input needed to derive a fallback tag from a Question's
// legacy singular fields when BE m2m hasn't landed yet.
type LegacyTaggedQuestion = {
  course_id: string | null
  chapter_id: string | null
  topic_id: string | null
  subject: TaxonomyTag['subject']
  exam_type: TaxonomyTag['exam_type']
  course?: { id: string; name: string } | null
  chapter?: { id: string; name: string } | null
  topic?: { id: string; name: string } | null
  taxonomies?: TaxonomyTag[]
}

// Returns the m2m tag array if BE has provided one, else synthesises a
// single tag from the singular fields. Components downstream don't care
// which path produced the array.
export function deriveQuestionTags(q: LegacyTaggedQuestion): TaxonomyTag[] {
  if (q.taxonomies && q.taxonomies.length > 0) return q.taxonomies
  if (!q.course_id) return []
  return [
    {
      course_id: q.course_id,
      course_name: q.course?.name ?? 'Course',
      chapter_id: q.chapter_id,
      chapter_name: q.chapter?.name ?? null,
      topic_id: q.topic_id,
      topic_name: q.topic?.name ?? null,
      subject: q.subject,
      exam_type: q.exam_type,
    },
  ]
}
