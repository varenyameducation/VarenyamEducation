// Extracts an answer key (question_no → correct letter) from a single image
// page using Gemini Vision. Used by the PDF Vision import when the user also
// uploads an answers PDF alongside the questions PDF.

import { geminiGenerateText } from './gemini'
import { lenientJsonParse } from './json-utils'
import { z } from 'zod'

const answerEntrySchema = z.object({
  q: z.number().int().positive(),
  a: z.enum(['A', 'B', 'C', 'D']),
})

const answerKeyResponseSchema = z.object({
  answers: z.array(answerEntrySchema).default([]),
})

const PROMPT = `Extract the answer key from this image. Return ONLY a JSON object:
{"answers": [{"q": 1, "a": "B"}, {"q": 2, "a": "A"}, ...]}
Rules:
- q: question number (positive integer)
- a: correct answer — ONLY "A", "B", "C", or "D" (uppercase)
- Include every question/answer pair visible in this image
- SKIP page headers, instructions, and non-answer content
- Output ONLY the JSON. No markdown fences, no commentary.`

export async function extractAnswerKeyFromImage(
  imageBuffer: Buffer,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
): Promise<Map<number, 'A' | 'B' | 'C' | 'D'>> {
  const result = await geminiGenerateText(
    PROMPT,
    [{ mimeType, data: imageBuffer.toString('base64') }],
  )
  let parsed: unknown
  try {
    parsed = lenientJsonParse(result.text)
  } catch {
    return new Map()
  }
  const validated = answerKeyResponseSchema.safeParse(parsed)
  if (!validated.success) return new Map()
  const map = new Map<number, 'A' | 'B' | 'C' | 'D'>()
  for (const entry of validated.data.answers) {
    // First occurrence wins when multiple pages cover the same question number
    if (!map.has(entry.q)) map.set(entry.q, entry.a)
  }
  return map
}
