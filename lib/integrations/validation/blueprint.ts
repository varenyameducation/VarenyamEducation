import { z } from 'zod'
import { uuidSchema } from '@/lib/validation/common'
import type { BlueprintSection, TestGenerateInput } from '@/types/taxonomy'
import { examTypeSchema } from './taxonomy-tag'

const difficultySchema = z.enum(['easy', 'medium', 'hard', 'advanced'])
const questionTypeSchema = z.enum(['mcq', 'numerical', 'subjective', 'multi_select'])
const subjectSchema = z.enum(['Physics', 'Chemistry', 'Maths', 'Biology'])

const blueprintCountsSchema = z
  .object({
    easy: z.number().int().min(0).optional(),
    medium: z.number().int().min(0).optional(),
    hard: z.number().int().min(0).optional(),
    advanced: z.number().int().min(0).optional(),
  })
  .refine(
    (b) => (b.easy ?? 0) + (b.medium ?? 0) + (b.hard ?? 0) + (b.advanced ?? 0) > 0,
    { message: 'Each section needs at least one positive difficulty count' },
  )

export const blueprintSectionSchema = z.object({
  label: z.string().min(1, 'Section label is required'),
  blueprint: blueprintCountsSchema,
  chapter_ids: z.array(uuidSchema).optional(),
  topic_ids: z.array(uuidSchema).optional(),
  question_type: questionTypeSchema.optional(),
})

export const testGenerateInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  course_id: uuidSchema,
  subject: subjectSchema,
  exam_type: examTypeSchema,
  duration_minutes: z.number().int().min(1, 'Duration must be at least 1 minute'),
  instructions: z.string().optional(),
  sections: z
    .array(blueprintSectionSchema)
    .min(1, 'At least one section is required'),
})

export const inventoryCountsSchema = z.object({
  easy: z.number().int().min(0),
  medium: z.number().int().min(0),
  hard: z.number().int().min(0),
  advanced: z.number().int().min(0),
  total: z.number().int().min(0),
})

type _AssertSection = z.infer<typeof blueprintSectionSchema> extends BlueprintSection
  ? true
  : false
type _AssertInput = z.infer<typeof testGenerateInputSchema> extends TestGenerateInput
  ? true
  : false
export type __TypeAssertions = [_AssertSection, _AssertInput]
