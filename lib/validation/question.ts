import { z } from 'zod'
import { uuidSchema } from './common'

const subjectSchema = z.enum(['Physics', 'Chemistry', 'Maths', 'Biology'])
const difficultySchema = z.enum(['easy', 'medium', 'hard', 'advanced'])
const examTypeSchema = z.enum(['school', 'board', 'jee', 'neet'])
const questionTypeSchema = z.enum(['mcq', 'numerical', 'matrix_match', 'multi_select'])
const optionLetterSchema = z.enum(['A', 'B', 'C', 'D'])

const commonShape = {
  course_id: uuidSchema,
  chapter_id: uuidSchema,
  topic_id: uuidSchema,
  subject: subjectSchema,
  difficulty: difficultySchema,
  exam_type: examTypeSchema,
  marks_correct: z.number().positive(),
  marks_negative: z.number().min(0).default(0),
  question_body: z.string().min(10),
  solution: z.string().optional(),
  explanation: z.string().optional(),
  hint: z.string().optional(),
  image_urls: z.array(z.string()).optional(),
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
  correct_option: z.array(optionLetterSchema).length(1),
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

export const questionCreateSchema = z.discriminatedUnion('question_type', [
  mcqSchema,
  multiSelectSchema,
  numericalSchema,
  matrixMatchSchema,
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
