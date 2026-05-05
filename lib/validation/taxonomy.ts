import { z } from 'zod'
import { uuidSchema } from './common'

const streamSchema = z.enum(['JEE', 'NEET', 'School', 'Board'])
const subjectSchema = z.enum(['Physics', 'Chemistry', 'Maths', 'Biology'])

export const courseCreateSchema = z.object({
  name: z.string().min(1).max(200),
  grade: z.number().int().min(5).max(12),
  stream: streamSchema.optional(),
  description: z.string().optional(),
})

export const courseUpdateSchema = courseCreateSchema.partial()

export const chapterCreateSchema = z.object({
  course_id: uuidSchema,
  name: z.string().min(1).max(200),
  subject: subjectSchema,
  chapter_no: z.number().int().optional(),
})

export const chapterUpdateSchema = chapterCreateSchema.omit({ course_id: true }).partial()

export const topicCreateSchema = z.object({
  chapter_id: uuidSchema,
  name: z.string().min(1).max(200),
  topic_no: z.number().int().optional(),
})

export const topicUpdateSchema = topicCreateSchema.omit({ chapter_id: true }).partial()

export type CourseCreateInput = z.infer<typeof courseCreateSchema>
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>
export type ChapterCreateInput = z.infer<typeof chapterCreateSchema>
export type ChapterUpdateInput = z.infer<typeof chapterUpdateSchema>
export type TopicCreateInput = z.infer<typeof topicCreateSchema>
export type TopicUpdateInput = z.infer<typeof topicUpdateSchema>
