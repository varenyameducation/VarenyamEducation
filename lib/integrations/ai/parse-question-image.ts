import { z } from 'zod'
import { geminiGenerateText, GeminiError } from './gemini'
import { lenientJsonParse } from './json-utils'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ParsedQuestionImageMime = (typeof ALLOWED_MIME_TYPES)[number]

export const parsedQuestionImageSchema = z.object({
  question_body: z.string().min(1),
  question_type: z.enum(['mcq', 'numerical', 'subjective']),
  options: z.array(z.string()).default([]),
  correct_option: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
})

export type ParsedQuestionImage = z.infer<typeof parsedQuestionImageSchema>

const PROMPT = `Extract the question from this image and return a single JSON object with exactly these keys:
- question_body: the question text. Convert ALL math notation to LaTeX, wrapping inline math in \\( ... \\) and display math in \\[ ... \\]. Keep prose as plain text.
- question_type: one of 'mcq', 'numerical', 'subjective'.
- options: if MCQ, array of 4 strings (A, B, C, D values) — each option's math also in LaTeX. If not MCQ, empty array.
- correct_option: ALWAYS return [] (an empty array). Do NOT try to detect or infer the correct answer from the image. Even if the image marks an answer with a tick, asterisk, or "Ans:" prefix, ignore it and return [].
- IMPORTANT: All backslashes in LaTeX MUST be doubled in the JSON output. Write \\(, \\frac{a}{b}, \\sqrt{x} — NOT \(, \frac{a}{b}, \sqrt{x}. Single backslashes are invalid JSON escapes.
Output ONLY the JSON object, no prose, no markdown fences.`

export async function parseQuestionFromImage(
  imageBuffer: Buffer,
  mimeType: ParsedQuestionImageMime,
): Promise<{ parsed: ParsedQuestionImage; usage: { totalTokens: number } }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Unsupported image mimeType: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
    )
  }
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Image too large: ${imageBuffer.length} bytes (max ${MAX_IMAGE_BYTES})`,
    )
  }

  const result = await geminiGenerateText(
    PROMPT,
    [{ mimeType, data: imageBuffer.toString('base64') }],
    { responseMimeType: 'application/json' },
  )

  let raw: unknown
  try {
    raw = lenientJsonParse(result.text)
  } catch {
    throw new GeminiError(
      'BAD_RESPONSE',
      `JSON.parse failed even after backslash-repair: ${result.text.slice(0, 500)}`,
    )
  }

  const parseResult = parsedQuestionImageSchema.safeParse(raw)
  if (!parseResult.success) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini JSON failed schema validation: ${parseResult.error.message}. Raw: ${result.text.slice(0, 500)}`,
    )
  }

  const parsed = parseResult.data
  if (parsed.question_type === 'mcq' && parsed.options.length !== 4) {
    console.warn(
      `[parseQuestionFromImage] MCQ returned ${parsed.options.length} options (expected 4); passing through for user review.`,
    )
  }

  return { parsed, usage: { totalTokens: result.usage.totalTokens } }
}
