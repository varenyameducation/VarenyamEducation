import type { QuestionFormValues } from '@/lib/validation/question'
import { resolveStorageUrl } from '@/lib/ui/storage-url'

// Bridges the form shape (lowercase option letters, {key,text} matrix rows,
// storage paths under image_paths, numerical_min/max) to the API shape
// (uppercase option letters, plain string arrays for matrix sides,
// image_urls, numerical_range_min/max). Schema for the API route lives in
// lib/api/questions.ts and is the source of truth for the wire format.
//
// Image fields: the upload endpoint returns paths like "draft/<uuid>.png"
// but the wire validator requires `z.string().url()`. resolveStorageUrl
// pre-fills full Supabase public URLs so the validator accepts the payload.
// Already-full URLs (e.g. from bulk-import on edit) pass through unchanged.
const toUrls = (paths: string[] | undefined): string[] | undefined =>
  paths?.map(resolveStorageUrl)

export function normalizeQuestionFormForApi(values: QuestionFormValues) {
  return {
    ...values,
    correct_option: values.correct_option.map(
      (c) => c.toUpperCase() as 'A' | 'B' | 'C' | 'D',
    ),
    matrix_left: values.matrix_left?.map((r) => r.text),
    matrix_right: values.matrix_right?.map((r) => r.text),
    image_urls: toUrls(values.image_paths),
    solution_image_urls: toUrls(values.solution_image_paths),
    explanation_image_urls: toUrls(values.explanation_image_paths),
    image_paths: undefined,
    solution_image_paths: undefined,
    explanation_image_paths: undefined,
    numerical_range_min: values.numerical_min,
    numerical_range_max: values.numerical_max,
    numerical_min: undefined,
    numerical_max: undefined,
  }
}
