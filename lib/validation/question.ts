import { z } from 'zod'
import { uuidSchema } from './common'

export const questionTypeSchema = z.enum([
  'mcq',
  'multi_select',
  'numerical',
  'matrix_match',
])
export const difficultySchema = z.enum(['easy', 'medium', 'hard', 'advanced'])
export const examTypeSchema = z.enum(['school', 'board', 'jee', 'neet'])
export const subjectSchema = z.enum(['Physics', 'Chemistry', 'Maths', 'Biology'])

export type QuestionTypeValue = z.infer<typeof questionTypeSchema>
export type DifficultyValue = z.infer<typeof difficultySchema>
export type ExamTypeValue = z.infer<typeof examTypeSchema>
export type SubjectValue = z.infer<typeof subjectSchema>

export const QUESTION_TYPES: { value: QuestionTypeValue; label: string }[] = [
  { value: 'mcq', label: 'MCQ (single correct)' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'matrix_match', label: 'Matrix match' },
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

const matrixRowSchema = z.object({
  key: z.string().min(1),
  text: z.string().min(1, 'Required'),
})

export const questionFormSchema = z
  .object({
    course_id: uuidSchema,
    chapter_id: uuidSchema,
    topic_id: uuidSchema,
    subject: subjectSchema,
    question_type: questionTypeSchema,
    difficulty: difficultySchema,
    exam_type: examTypeSchema,
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
    }
  })

export type QuestionFormValues = z.infer<typeof questionFormSchema>

export const questionFormDefaults: Partial<QuestionFormValues> = {
  question_type: 'mcq',
  difficulty: 'medium',
  exam_type: 'jee',
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
