import { z } from 'zod'
import { geminiGenerateText, GeminiError } from './gemini'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ParseQuestionsMime = (typeof ALLOWED_MIME_TYPES)[number]

export const parsedQuestionSchema = z.object({
  question_body: z.string().min(1),
  question_type: z.enum(['mcq', 'numerical', 'subjective']),
  options: z.array(z.string()).default([]),
  correct_option: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
})

export type ParsedQuestion = z.infer<typeof parsedQuestionSchema>

export const parsedQuestionsResponseSchema = z.object({
  questions: z.array(parsedQuestionSchema).default([]),
})

const PROMPT = `Extract ALL exam questions visible in this image and return a single JSON object with exactly this shape:

{
  "questions": [
    {
      "question_body": "<question text with math in LaTeX>",
      "question_type": "mcq" | "numerical" | "subjective",
      "options": ["<option A LaTeX>", "<option B LaTeX>", "<option C LaTeX>", "<option D LaTeX>"],
      "correct_option": []
    },
    ...
  ]
}

Rules:
- Convert ALL math notation to LaTeX. Wrap inline math in \\( ... \\) and display math in \\[ ... \\]. Keep prose as plain text.
- Detect MCQs by the (A) (B) (C) (D) option pattern. If MCQ, populate options with exactly 4 strings (preserve A/B/C/D order). If not MCQ, set options to [].
- question_type: 'mcq' if 4-option choice; 'numerical' if the answer is a numeric value (e.g. "find the value of x"); 'subjective' for everything else (descriptive answer).
- correct_option: leave [] unless the image explicitly marks the correct one with a tick, asterisk, or "Ans:" prefix.
- SKIP non-question content: page headers, page numbers ("Page 7 of 23"), paper codes ("65/S/1"), instructions blocks ("All questions are compulsory"), section labels by themselves ("Section A"), running watermarks. Only extract things that are actual answerable questions.
- If the page contains zero questions, return {"questions": []}.
- Output ONLY the JSON object. No markdown fences, no commentary.`

export async function parseQuestionsFromImage(
  imageBuffer: Buffer,
  mimeType: ParseQuestionsMime,
): Promise<{ parsed: ParsedQuestion[]; usage: { totalTokens: number } }> {
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

  const parseResult = parsedQuestionsResponseSchema.safeParse(raw)
  if (!parseResult.success) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini JSON failed schema validation: ${parseResult.error.message}. Raw: ${result.text.slice(0, 500)}`,
    )
  }

  const questions = parseResult.data.questions
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (q.question_type === 'mcq' && q.options.length !== 4) {
      console.warn(
        `[parseQuestionsFromImage] question[${i}] MCQ returned ${q.options.length} options (expected 4); passing through for user review.`,
      )
    }
  }

  return { parsed: questions, usage: { totalTokens: result.usage.totalTokens } }
}
