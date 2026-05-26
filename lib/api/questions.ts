import { z } from 'zod'

// TODO: replace once integration/question-import merges
export const QUESTION_TYPE_VALUES = [
  'mcq',
  'numerical',
  'matrix_match',
  'multi_select',
  'subjective',
] as const
export const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'advanced'] as const
export const EXAM_TYPE_VALUES = ['school', 'board', 'jee', 'neet'] as const
export const OPTION_VALUES = ['A', 'B', 'C', 'D'] as const

export type QuestionType = (typeof QUESTION_TYPE_VALUES)[number]
export type Difficulty = (typeof DIFFICULTY_VALUES)[number]
export type ExamType = (typeof EXAM_TYPE_VALUES)[number]

const matrixSideSchema = z.array(
  z.object({ label: z.string().min(1), text: z.string() }),
).min(1).max(10)

const matrixAnswerSchema = z.array(z.record(z.string(), z.array(z.string()))).min(1)

const optionLetter = z.enum(OPTION_VALUES)

// A single taxonomy tag attached to a question via the question_taxonomies junction.
// A question can have many of these (multi-course, multi-exam, etc.).
//
// With the Subject-tier hierarchy (Course → Subject → Chapter → Topic), every
// level below `course_id` is optional — a tag at the course level only is
// valid. `subject_id` is the new tier added in this migration; it lives on
// the junction so callers can scope a question to a Subject without picking a
// specific Chapter.
export const taxonomyTagSchema = z.object({
  course_id: z.string().uuid(),
  subject_id: z.string().uuid().nullish().transform((v) => v ?? null),
  chapter_id: z.string().uuid().nullish().transform((v) => v ?? null),
  topic_id: z.string().uuid().nullish().transform((v) => v ?? null),
  exam_type: z.enum(EXAM_TYPE_VALUES),
})

export type TaxonomyTag = z.infer<typeof taxonomyTagSchema>

const taxonomiesArraySchema = z
  .array(taxonomyTagSchema)
  .min(1, { message: 'At least one taxonomy tag is required' })
  .max(50)

const baseQuestionFields = {
  taxonomies: taxonomiesArraySchema,
  subject: z.string().trim().min(1).max(50),
  difficulty: z.enum(DIFFICULTY_VALUES),
  marks_correct: z.number().min(0).max(999).optional(),
  marks_negative: z.number().min(0).max(999).optional(),
  marks_partial: z.number().min(0).max(999).nullish(),
  question_body: z.string().trim().min(1),
  solution: z.string().trim().nullish(),
  explanation: z.string().trim().nullish(),
  hint: z.string().trim().nullish(),
  image_urls: z.array(z.string().url()).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}

const mcqCreateSchema = z.object({
  ...baseQuestionFields,
  question_type: z.literal('mcq'),
  option_a: z.string().trim().min(1),
  option_b: z.string().trim().min(1),
  option_c: z.string().trim().min(1),
  option_d: z.string().trim().min(1),
  correct_option: z.array(optionLetter).length(1),
})

const multiSelectCreateSchema = z.object({
  ...baseQuestionFields,
  question_type: z.literal('multi_select'),
  option_a: z.string().trim().min(1),
  option_b: z.string().trim().min(1),
  option_c: z.string().trim().min(1),
  option_d: z.string().trim().min(1),
  correct_option: z.array(optionLetter).min(2).max(4),
})

const numericalCreateSchema = z.object({
  ...baseQuestionFields,
  question_type: z.literal('numerical'),
  numerical_answer: z.number().finite(),
})

const matrixCreateSchema = z.object({
  ...baseQuestionFields,
  question_type: z.literal('matrix_match'),
  matrix_left: matrixSideSchema,
  matrix_right: matrixSideSchema,
  matrix_answer: matrixAnswerSchema,
})

const subjectiveCreateSchema = z.object({
  ...baseQuestionFields,
  question_type: z.literal('subjective'),
})

export const createQuestionSchema = z.discriminatedUnion('question_type', [
  mcqCreateSchema,
  multiSelectCreateSchema,
  numericalCreateSchema,
  matrixCreateSchema,
  subjectiveCreateSchema,
])

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>

const baseUpdateFields = {
  // Full replacement set; if omitted, taxonomies are left unchanged.
  taxonomies: taxonomiesArraySchema.optional(),
  subject: z.string().trim().min(1).max(50).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  marks_correct: z.number().min(0).max(999).optional(),
  marks_negative: z.number().min(0).max(999).optional(),
  marks_partial: z.number().min(0).max(999).nullish(),
  question_body: z.string().trim().min(1).optional(),
  option_a: z.string().trim().min(1).nullish(),
  option_b: z.string().trim().min(1).nullish(),
  option_c: z.string().trim().min(1).nullish(),
  option_d: z.string().trim().min(1).nullish(),
  correct_option: z.array(optionLetter).optional(),
  numerical_answer: z.number().finite().nullish(),
  matrix_left: matrixSideSchema.nullish(),
  matrix_right: matrixSideSchema.nullish(),
  matrix_answer: matrixAnswerSchema.nullish(),
  solution: z.string().trim().nullish(),
  explanation: z.string().trim().nullish(),
  hint: z.string().trim().nullish(),
  image_urls: z.array(z.string().url()).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  is_verified: z.boolean().optional(),
}

export const updateQuestionSchema = z
  .object(baseUpdateFields)
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>

export const listQuerySchema = z.object({
  // taxonomy filters: these all filter via question_taxonomies (junction)
  course_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  chapter_id: z.string().uuid().optional(),
  topic_id: z.string().uuid().optional(),
  exam_type: z.enum(EXAM_TYPE_VALUES).optional(),
  // direct columns on Question
  subject: z.string().trim().min(1).max(50).optional(),
  question_type: z.enum(QUESTION_TYPE_VALUES).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
})

export type ListQuery = z.infer<typeof listQuerySchema>

export function paginatedEnvelope<T>(args: {
  items: T[]
  page: number
  limit: number
  total: number
}) {
  return args
}

export function getClientIp(request: Request): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  )
}

// ─── Taxonomy row shape on /api/questions responses ─────────────────────────
// Prisma `select` shape used everywhere we return question_taxonomies. Keeps
// the include pulling Course/Chapter/Topic names so the FE has chip labels
// without an extra round-trip — see types/taxonomy.ts (TaxonomyTagRow) for
// the wire-format interface this maps to.

export const taxonomyRowSelect = {
  id: true,
  course_id: true,
  subject_id: true,
  chapter_id: true,
  topic_id: true,
  exam_type: true,
  created_at: true,
  course: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  chapter: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
} as const

export type QuestionTaxonomyRowWithNames = {
  id: string
  course_id: string
  subject_id: string | null
  chapter_id: string | null
  topic_id: string | null
  exam_type: string
  created_at: Date
  course: { id: string; name: string } | null
  subject: { id: string; name: string } | null
  chapter: { id: string; name: string } | null
  topic: { id: string; name: string } | null
}

export type FlattenedTaxonomyRow = {
  id: string
  course_id: string
  subject_id: string | null
  chapter_id: string | null
  topic_id: string | null
  exam_type: string
  created_at: Date
  course_name?: string
  subject_name?: string
  chapter_name: string | null
  topic_name: string | null
  // `subject` stays for backward compat with the pre-Subject-tier FE — it now
  // mirrors `subject_name` (was previously sourced from chapter.subject).
  subject?: string
}

// Flatten the nested Course/Subject/Chapter/Topic includes into the row so
// the wire shape matches the extended `TaxonomyTagRow` in `types/taxonomy.ts`.
export function flattenTaxonomyRow(t: QuestionTaxonomyRowWithNames): FlattenedTaxonomyRow {
  return {
    id: t.id,
    course_id: t.course_id,
    subject_id: t.subject_id,
    chapter_id: t.chapter_id,
    topic_id: t.topic_id,
    exam_type: t.exam_type,
    created_at: t.created_at,
    course_name: t.course?.name,
    subject_name: t.subject?.name,
    chapter_name: t.chapter?.name ?? null,
    topic_name: t.topic?.name ?? null,
    subject: t.subject?.name,
  }
}

export function withTaxonomies<
  T extends { question_taxonomies: QuestionTaxonomyRowWithNames[] },
>(question: T) {
  const { question_taxonomies, ...rest } = question
  return { ...rest, taxonomies: question_taxonomies.map(flattenTaxonomyRow) }
}
