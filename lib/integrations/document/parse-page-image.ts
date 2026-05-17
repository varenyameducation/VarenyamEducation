// Multi-question Gemini Vision extractor for board-paper PDF pages.
//
// Each rendered PDF page typically contains 2–6 questions; the single-question
// helper in lib/integrations/ai/parse-question-image.ts would mash them
// together. This one prompts Gemini for an ARRAY of question objects and
// validates with Zod. INT may eventually expose this same shape as
// `parseQuestionsFromImage` in lib/integrations/ai — when that lands the
// route can swap to the upstream helper and this file becomes redundant.

import { z } from 'zod'
import { geminiGenerateText, GeminiError } from '@/lib/integrations/ai/gemini'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type PageImageMime = (typeof ALLOWED_MIME_TYPES)[number]

export const pageQuestionSchema = z.object({
  question_body: z.string().min(1),
  question_type: z.enum(['mcq', 'numerical', 'subjective']),
  options: z.array(z.string()).default([]),
  correct_option: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
  marks: z.number().nullable().optional(),
})

export type PageQuestion = z.infer<typeof pageQuestionSchema>

export const pageParseSchema = z.object({
  questions: z.array(pageQuestionSchema).default([]),
})

const PROMPT = `You are extracting exam questions from a single page of a board exam paper.
Return a JSON object with this exact shape:
{
  "questions": [
    {
      "question_body": "<question text with ALL math in LaTeX — inline \\\\( ... \\\\), display \\\\[ ... \\\\]>",
      "question_type": "mcq" | "numerical" | "subjective",
      "options": [<4 strings if mcq, else []>],
      "correct_option": [<usually empty; only fill if the page marks the correct one>],
      "marks": <integer marks if printed in brackets, else null>
    }
  ]
}

Rules:
- Output one element per distinct question on the page. If the page is a cover page or section divider with no questions, return {"questions": []}.
- Keep the original question numbering OUT of question_body — drop the leading "1." / "Q3." prefix. The numbering is implicit by array order.
- For MCQ: extract exactly 4 options in A, B, C, D order. Each option's math goes in LaTeX too.
- For numerical: question_type is "numerical", options is [].
- For subjective (short/long answer, case-study, fill-blank without options): question_type is "subjective", options is [].
- Convert ALL math notation to LaTeX. Fractions, exponents, integrals, matrices, vectors, Greek letters — every symbol.
- Strip page headers/footers ("Page 3 of 12", logos, school names) — they are NOT questions.
- If a question references a figure on the page (graph, diagram, geometric figure) include "[Figure on page]" in question_body so the reviewer knows to attach it manually.
- Output ONLY the JSON object. No prose. No markdown fences. No commentary.`

export interface PageParseResult {
  questions: PageQuestion[]
  usage: { totalTokens: number }
}

export async function parseQuestionsFromPageImage(
  imageBuffer: Buffer,
  mimeType: PageImageMime,
): Promise<PageParseResult> {
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
    raw = JSON.parse(result.text)
  } catch {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini returned non-JSON text: ${result.text.slice(0, 500)}`,
    )
  }

  const parsed = pageParseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini JSON failed schema validation: ${parsed.error.message}. Raw: ${result.text.slice(0, 500)}`,
    )
  }

  return {
    questions: parsed.data.questions,
    usage: { totalTokens: result.usage.totalTokens },
  }
}
