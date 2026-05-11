import { z } from 'zod'

// TODO: replace once integration/question-import merges
export const QUESTION_TYPE_VALUES = ['mcq', 'numerical', 'matrix_match', 'multi_select'] as const
export const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'advanced'] as const
export const EXAM_TYPE_VALUES = ['school', 'board', 'jee', 'neet'] as const
export const OPTION_VALUES = ['a', 'b', 'c', 'd'] as const

export type QuestionType = (typeof QUESTION_TYPE_VALUES)[number]
export type Difficulty = (typeof DIFFICULTY_VALUES)[number]
export type ExamType = (typeof EXAM_TYPE_VALUES)[number]

const matrixSideSchema = z.array(
  z.object({ label: z.string().min(1), text: z.string() }),
).min(1).max(10)

const matrixAnswerSchema = z.array(z.record(z.string(), z.array(z.string()))).min(1)

const optionLetter = z.enum(OPTION_VALUES)

const baseQuestionFields = {
  course_id: z.string().uuid().nullish(),
  chapter_id: z.string().uuid().nullish(),
  topic_id: z.string().uuid().nullish(),
  subject: z.string().trim().min(1).max(50),
  difficulty: z.enum(DIFFICULTY_VALUES),
  exam_type: z.enum(EXAM_TYPE_VALUES),
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

export const createQuestionSchema = z.discriminatedUnion('question_type', [
  mcqCreateSchema,
  multiSelectCreateSchema,
  numericalCreateSchema,
  matrixCreateSchema,
])

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>

const baseUpdateFields = {
  course_id: z.string().uuid().nullish(),
  chapter_id: z.string().uuid().nullish(),
  topic_id: z.string().uuid().nullish(),
  subject: z.string().trim().min(1).max(50).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  exam_type: z.enum(EXAM_TYPE_VALUES).optional(),
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
  course_id: z.string().uuid().optional(),
  chapter_id: z.string().uuid().optional(),
  topic_id: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(50).optional(),
  question_type: z.enum(QUESTION_TYPE_VALUES).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  exam_type: z.enum(EXAM_TYPE_VALUES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
