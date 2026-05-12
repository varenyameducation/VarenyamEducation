import { z } from 'zod'
import { subjectSchema, examTypeSchema } from './question'

export const testStatusSchema = z.enum(['draft', 'final', 'published', 'archived'])
export type TestStatus = z.infer<typeof testStatusSchema>

export const TEST_STATUSES: { value: TestStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'final', label: 'Final' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

export const testSetupSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  course_id: z.string().uuid().or(z.string().min(1)),
  subjects: z.array(subjectSchema).min(1, 'Pick at least one subject'),
  exam_type: examTypeSchema,
  duration_minutes: z.coerce.number().int().min(5).max(600).default(180),
  instructions: z.string().max(2000).optional(),
})

export type TestSetupValues = z.infer<typeof testSetupSchema>

export const testSetupDefaults: Partial<TestSetupValues> = {
  title: '',
  subjects: [],
  exam_type: 'jee',
  duration_minutes: 180,
  instructions: '',
}
