import { z } from 'zod'
import { uuidSchema } from '@/lib/validation/common'
import type { TaxonomyTag, TaxonomyTagRow } from '@/types/taxonomy'

export const examTypeSchema = z.enum(['school', 'board', 'jee', 'neet'])

// Chain refinement for the 4-tier hierarchy Course → Subject → Chapter →
// Topic. Each level below course requires its parent to be set; the DB
// enforces FKs but we want the friendly error up front, and the
// subject_id ⇒ course_id link is implicit because course_id is required.
function enforceHierarchy<
  T extends {
    course_id: string
    subject_id?: string | null
    chapter_id?: string | null
    topic_id?: string | null
  },
>(tag: T, ctx: z.RefinementCtx) {
  if (tag.topic_id && !tag.chapter_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['topic_id'],
      message: 'topic_id requires chapter_id (Course → Subject → Chapter → Topic hierarchy)',
    })
  }
  if (tag.chapter_id && !tag.subject_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chapter_id'],
      message: 'chapter_id requires subject_id (Course → Subject → Chapter → Topic hierarchy)',
    })
  }
}

const taxonomyTagBase = z.object({
  course_id: uuidSchema,
  subject_id: uuidSchema.nullish(),
  chapter_id: uuidSchema.nullish(),
  topic_id: uuidSchema.nullish(),
  exam_type: examTypeSchema,
})

// .strict() so a confused client POSTing the output-only joined fields
// (course_name / subject_name / chapter_name / topic_name / subject from
// TaxonomyTagRow) gets a clear validation error rather than having them
// silently stripped.
export const taxonomyTagSchema = taxonomyTagBase.strict().superRefine(enforceHierarchy)

export const taxonomyTagRowSchema = taxonomyTagBase
  .extend({
    id: uuidSchema,
    created_at: z.string(),
  })
  .superRefine(enforceHierarchy)

export const taxonomyTagArraySchema = z.array(taxonomyTagSchema).min(1, {
  message: 'At least one taxonomy tag is required',
})

// Type-level sanity: schemas line up with the shared types.
type _AssertTag = z.infer<typeof taxonomyTagSchema> extends TaxonomyTag ? true : false
type _AssertTagRow = z.infer<typeof taxonomyTagRowSchema> extends TaxonomyTagRow ? true : false
// Mark intentionally unused so the import is not stripped.
export type __TypeAssertions = [_AssertTag, _AssertTagRow]
