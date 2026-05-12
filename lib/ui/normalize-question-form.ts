import type { QuestionFormValues } from '@/lib/validation/question'

// Bridges the form shape (lowercase option letters, {key,text} matrix rows,
// storage paths under image_paths, numerical_min/max) to the API shape
// (uppercase option letters, plain string arrays for matrix sides,
// image_urls, numerical_range_min/max). Schema for the API route lives in
// lib/api/questions.ts and is the source of truth for the wire format.
export function normalizeQuestionFormForApi(values: QuestionFormValues) {
  return {
    ...values,
    correct_option: values.correct_option.map(
      (c) => c.toUpperCase() as 'A' | 'B' | 'C' | 'D',
    ),
    matrix_left: values.matrix_left?.map((r) => r.text),
    matrix_right: values.matrix_right?.map((r) => r.text),
    image_urls: values.image_paths,
    image_paths: undefined,
    numerical_range_min: values.numerical_min,
    numerical_range_max: values.numerical_max,
    numerical_min: undefined,
    numerical_max: undefined,
  }
}
