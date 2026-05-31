import { z } from 'zod'
import { uuidSchema } from './common'

// ─── Enums (server + UI shared) ─────────────────────────────────────────────
export const subjectSchema = z.enum(['Physics', 'Chemistry', 'Maths', 'Biology'])
export const difficultySchema = z.enum(['easy', 'medium', 'hard', 'advanced'])
export const examTypeSchema = z.enum(['school', 'board', 'jee', 'neet'])
export const questionTypeSchema = z.enum([
  'mcq',
  'numerical',
  'matrix_match',
  'multi_select',
  'subjective',
])
const optionLetterSchema = z.enum(['A', 'B', 'C', 'D'])

export type SubjectValue = z.infer<typeof subjectSchema>
export type DifficultyValue = z.infer<typeof difficultySchema>
export type ExamTypeValue = z.infer<typeof examTypeSchema>
export type QuestionTypeValue = z.infer<typeof questionTypeSchema>

// ─── Server-side validation (used by import flows + xlsx parser) ────────────
// Note: course_id/chapter_id/topic_id/exam_type live in question_taxonomies now,
// not on Question. The import routes attach a junction row separately after the
// question is validated and inserted.
const commonShape = {
  subject: subjectSchema,
  difficulty: difficultySchema,
  marks_correct: z.number().positive(),
  marks_negative: z.number().min(0).default(0),
  question_body: z.string().min(10),
  solution: z.string().optional(),
  explanation: z.string().optional(),
  hint: z.string().optional(),
  image_urls: z.array(z.string()).optional(),
  solution_image_urls: z.array(z.string()).optional(),
  explanation_image_urls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
}

export const questionBaseSchema = z.object({
  ...commonShape,
  question_type: questionTypeSchema,
  option_a: z.string().optional(),
  option_b: z.string().optional(),
  option_c: z.string().optional(),
  option_d: z.string().optional(),
  correct_option: z.array(optionLetterSchema).optional(),
  numerical_answer: z.number().optional(),
  matrix_left: z.array(z.unknown()).optional(),
  matrix_right: z.array(z.unknown()).optional(),
  matrix_answer: z.record(z.string(), z.unknown()).optional(),
})

const mcqSchema = z.object({
  ...commonShape,
  question_type: z.literal('mcq'),
  option_a: z.string().min(1),
  option_b: z.string().min(1),
  option_c: z.string().min(1),
  option_d: z.string().min(1),
  // Allow [] for bulk-imported MCQs that ship unverified — user marks the
  // correct answer in the question bank after review. `.length(1)` would
  // reject those rows wholesale.
  correct_option: z.array(optionLetterSchema).max(1).default([]),
})

const multiSelectSchema = z.object({
  ...commonShape,
  question_type: z.literal('multi_select'),
  option_a: z.string().min(1),
  option_b: z.string().min(1),
  option_c: z.string().min(1),
  option_d: z.string().min(1),
  correct_option: z.array(optionLetterSchema).min(2),
  marks_partial: z.number().min(0).optional(),
})

const numericalSchema = z.object({
  ...commonShape,
  question_type: z.literal('numerical'),
  numerical_answer: z.number(),
  numerical_range_min: z.number().optional(),
  numerical_range_max: z.number().optional(),
})

const matrixMatchSchema = z.object({
  ...commonShape,
  question_type: z.literal('matrix_match'),
  matrix_left: z.array(z.unknown()).min(1),
  matrix_right: z.array(z.unknown()).min(1),
  matrix_answer: z.record(z.string(), z.unknown()),
})

const subjectiveSchema = z.object({
  ...commonShape,
  question_type: z.literal('subjective'),
})

export const questionCreateSchema = z.discriminatedUnion('question_type', [
  mcqSchema,
  multiSelectSchema,
  numericalSchema,
  matrixMatchSchema,
  subjectiveSchema,
])

export const questionUpdateSchema = z
  .object({
    ...commonShape,
    option_a: z.string().optional(),
    option_b: z.string().optional(),
    option_c: z.string().optional(),
    option_d: z.string().optional(),
    correct_option: z.array(optionLetterSchema).optional(),
    numerical_answer: z.number().optional(),
    matrix_left: z.array(z.unknown()).optional(),
    matrix_right: z.array(z.unknown()).optional(),
    matrix_answer: z.record(z.string(), z.unknown()).optional(),
  })
  .partial()

export type QuestionCreateInput = z.infer<typeof questionCreateSchema>
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>
export type QuestionBaseInput = z.infer<typeof questionBaseSchema>

// ─── UI form (used by components/questions/* via react-hook-form) ───────────
// Looser than the server schema — option-letter case normalization and matrix
// shape conversion happen at submit time. The server schemas above remain
// the source of truth that /api/questions validates against.

export const QUESTION_TYPES: { value: QuestionTypeValue; label: string }[] = [
  { value: 'mcq', label: 'MCQ (single correct)' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'matrix_match', label: 'Matrix match' },
  { value: 'subjective', label: 'Subjective (short/long answer)' },
]

export const DIFFICULTIES: { value: DifficultyValue; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'advanced', label: 'Advanced' },
]

export const EXAM_TYPES: { value: ExamTypeValue; label: string }[] = [
  { value: 'school', label: 'School' },
  { value: 'board', label: 'Board' },
  { value: 'jee', label: 'JEE' },
  { value: 'neet', label: 'NEET' },
]

// Legacy canonical-four subject list — still used by:
//   - `TestGenerateInput.subject` (the test-level subject, hardcoded union
//     in @/types/taxonomy)
//   - import/filter/blueprint dropdowns that don't have a course context yet
// Subject as an entity (per-course rows in the Subject table) is loaded
// dynamically from /api/taxonomy/subjects; this list only exists for the
// legacy test/import paths.
export const SUBJECTS: SubjectValue[] = subjectSchema.options

// Row-level text is intentionally permissive — the seeded matrix_left/right
// defaults (L1/L2/R1/R2) ship with empty text, and we don't want those
// defaults to fail validation when question_type is anything other than
// matrix_match. Required-text-per-row is enforced inside the superRefine
// below, but only when question_type === 'matrix_match'.
const matrixRowSchema = z.object({
  key: z.string().min(1),
  text: z.string(),
})

// Canonical id-only TaxonomyTag (course + optional chapter + optional topic
// + exam_type). Server denormalizes names back on the `TaxonomyTagRow`
// response; the form only POSTs ids.
export const taxonomyTagSchema = z.object({
  course_id: z.string().min(1),
  chapter_id: z.string().nullable().optional(),
  topic_id: z.string().nullable().optional(),
  exam_type: examTypeSchema,
})

// BE now accepts the m2m `taxonomies` array — no legacy singular
// course_id/chapter_id/topic_id/exam_type top-level fields. `subject` and
// `difficulty` are still question-level attributes the server expects.
export const questionFormSchema = z
  .object({
    subject: subjectSchema,
    taxonomies: z.array(taxonomyTagSchema).min(1, 'Add at least one taxonomy tag'),
    question_type: questionTypeSchema,
    difficulty: difficultySchema,
    marks_correct: z.coerce.number().positive().max(99),
    marks_negative: z.coerce.number().min(0).max(99),
    question_body: z.string().min(10, 'Question body must be at least 10 characters'),
    option_a: z.string().optional(),
    option_b: z.string().optional(),
    option_c: z.string().optional(),
    option_d: z.string().optional(),
    correct_option: z.array(z.enum(['a', 'b', 'c', 'd'])),
    numerical_answer: z.coerce.number().optional(),
    numerical_min: z.coerce.number().optional(),
    numerical_max: z.coerce.number().optional(),
    matrix_left: z.array(matrixRowSchema).optional(),
    matrix_right: z.array(matrixRowSchema).optional(),
    matrix_answer: z.record(z.string(), z.array(z.string())).optional(),
    solution: z.string().optional(),
    explanation: z.string().optional(),
    image_paths: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.question_type === 'mcq' || data.question_type === 'multi_select') {
      for (const k of ['option_a', 'option_b', 'option_c', 'option_d'] as const) {
        if (!data[k] || data[k]!.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Required for this question type',
            path: [k],
          })
        }
      }
      if (data.correct_option.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Pick at least one correct option',
          path: ['correct_option'],
        })
      }
      if (data.question_type === 'mcq' && data.correct_option.length > 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'MCQ allows only one correct option',
          path: ['correct_option'],
        })
      }
    }
    if (data.question_type === 'numerical') {
      if (data.numerical_answer === undefined || Number.isNaN(data.numerical_answer)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Numerical answer is required',
          path: ['numerical_answer'],
        })
      }
    }
    if (data.question_type === 'matrix_match') {
      const left = data.matrix_left ?? []
      const right = data.matrix_right ?? []
      if (left.length < 2 || right.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'Matrix match needs at least 2 rows on each side',
          path: ['matrix_left'],
        })
      }
      left.forEach((row, i) => {
        if (!row.text || row.text.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Row text required',
            path: ['matrix_left', i, 'text'],
          })
        }
      })
      right.forEach((row, i) => {
        if (!row.text || row.text.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Row text required',
            path: ['matrix_right', i, 'text'],
          })
        }
      })
    }
  })

export type QuestionFormValues = z.infer<typeof questionFormSchema>

export const questionFormDefaults: Partial<QuestionFormValues> = {
  question_type: 'mcq',
  difficulty: 'medium',
  subject: 'Maths',
  taxonomies: [],
  marks_correct: 4,
  marks_negative: 1,
  question_body: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: [],
  matrix_left: [
    { key: 'L1', text: '' },
    { key: 'L2', text: '' },
  ],
  matrix_right: [
    { key: 'R1', text: '' },
    { key: 'R2', text: '' },
  ],
  matrix_answer: {},
  image_paths: [],
}
