import { z } from 'zod'
import { uuidSchema } from '@/lib/validation/common'

// Subject sits between Course and Chapter in the 4-tier hierarchy. Name is
// free-text (institutes may use canonical 'Physics' / 'Chemistry' / 'Maths'
// / 'Biology' or custom strings like 'Computer Science'), trimmed and
// length-bounded so the UI label stays readable.
const subjectNameSchema = z.string().trim().min(1).max(80)

export const subjectCreateSchema = z
  .object({
    course_id: uuidSchema,
    name: subjectNameSchema,
  })
  .strict()

export const subjectUpdateSchema = z
  .object({
    name: subjectNameSchema,
  })
  .strict()

export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>
