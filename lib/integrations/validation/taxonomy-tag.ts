import { z } from 'zod'
import { uuidSchema } from '@/lib/validation/common'
import type { TaxonomyTag, TaxonomyTagRow } from '@/types/taxonomy'

export const examTypeSchema = z.enum(['school', 'board', 'jee', 'neet'])

// Refinement: a topic only makes sense inside a chapter, so topic_id
// requires chapter_id. The DB has the same constraint via the
// QuestionTaxonomy unique key, but we want the friendly error up front.
function topicRequiresChapter<
  T extends { chapter_id?: string | null; topic_id?: string | null },
>(tag: T, ctx: z.RefinementCtx) {
  if (tag.topic_id && !tag.chapter_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['topic_id'],
      message: 'topic_id requires chapter_id to be set',
    })
  }
}

const taxonomyTagBase = z.object({
  course_id: uuidSchema,
  chapter_id: uuidSchema.nullish(),
  topic_id: uuidSchema.nullish(),
  exam_type: examTypeSchema,
})

// .strict() so a confused client POSTing the output-only joined fields
// (course_name / chapter_name / topic_name / subject from TaxonomyTagRow)
// gets a clear validation error rather than having them silently stripped.
export const taxonomyTagSchema = taxonomyTagBase.strict().superRefine(topicRequiresChapter)

export const taxonomyTagRowSchema = taxonomyTagBase
  .extend({
    id: uuidSchema,
    created_at: z.string(),
  })
  .superRefine(topicRequiresChapter)

export const taxonomyTagArraySchema = z.array(taxonomyTagSchema).min(1, {
  message: 'At least one taxonomy tag is required',
})

// Type-level sanity: schemas line up with the shared types.
type _AssertTag = z.infer<typeof taxonomyTagSchema> extends TaxonomyTag ? true : false
type _AssertTagRow = z.infer<typeof taxonomyTagRowSchema> extends TaxonomyTagRow ? true : false
// Mark intentionally unused so the import is not stripped.
export type __TypeAssertions = [_AssertTag, _AssertTagRow]
