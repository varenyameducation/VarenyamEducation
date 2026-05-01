import { z } from 'zod'

// TODO: import from lib/validation/test once integration ships it.
export const TEST_STATUS_VALUES = ['draft', 'final', 'published', 'archived'] as const
export const TEST_EXAM_TYPE_VALUES = ['school', 'board', 'jee', 'neet', 'custom'] as const

export type TestStatus = (typeof TEST_STATUS_VALUES)[number]
export type TestExamType = (typeof TEST_EXAM_TYPE_VALUES)[number]

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .transform((v) => new Date(v))

export const createTestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  course_id: z.string().uuid().nullish(),
  subject: z.string().trim().min(1).max(50).nullish(),
  exam_type: z.enum(TEST_EXAM_TYPE_VALUES).nullish(),
  duration_minutes: z.number().int().min(1).max(600).optional(),
  instructions: z.string().trim().max(5000).nullish(),
  scheduled_start: isoDateTime.nullish(),
  scheduled_end: isoDateTime.nullish(),
  assigned_batch: z.string().uuid().nullish(),
  allow_resume: z.boolean().optional(),
  shuffle_questions: z.boolean().optional(),
})

export type CreateTestInput = z.infer<typeof createTestSchema>

export const updateTestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
    course_id: z.string().uuid().nullish(),
    subject: z.string().trim().min(1).max(50).nullish(),
    exam_type: z.enum(TEST_EXAM_TYPE_VALUES).nullish(),
    duration_minutes: z.number().int().min(1).max(600).optional(),
    instructions: z.string().trim().max(5000).nullish(),
    status: z.enum(TEST_STATUS_VALUES).optional(),
    scheduled_start: isoDateTime.nullish(),
    scheduled_end: isoDateTime.nullish(),
    assigned_batch: z.string().uuid().nullish(),
    allow_resume: z.boolean().optional(),
    shuffle_questions: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export type UpdateTestInput = z.infer<typeof updateTestSchema>

export const listTestsQuerySchema = z.object({
  status: z.enum(TEST_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListTestsQuery = z.infer<typeof listTestsQuerySchema>

export const setTestQuestionsSchema = z
  .array(
    z.object({
      question_id: z.string().uuid(),
      position: z.number().int().min(1).max(500),
      section_label: z.string().trim().min(1).max(50).nullish(),
      marks_override: z.number().min(0).max(999).nullish(),
      negative_override: z.number().min(0).max(999).nullish(),
    }),
  )
  .min(1)
  .max(500)

export type SetTestQuestionsInput = z.infer<typeof setTestQuestionsSchema>

export function sanitizeTitleForFilename(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[^\w\s.-]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'test'
  )
}
