// Lightweight Gemini Vision helper for the DOCX-image LaTeX-extraction
// pass. Given a single embedded-image buffer (PNG / JPEG / WebP), ask
// Gemini for either the LaTeX representation of any math visible in the
// image, or the sentinel `__DIAGRAM__` for figures with no extractable
// math. The caller decides what to do with the result — typically:
// replace `[[IMG:url]]` placeholders with the returned LaTeX, or leave
// the placeholder alone when the result is `__DIAGRAM__`.

import { geminiGenerateText, GeminiError } from './gemini'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type LatexExtractMime = (typeof ALLOWED_MIME_TYPES)[number]

export const DIAGRAM_SENTINEL = '__DIAGRAM__'

const PROMPT = `Return only the LaTeX representation of any math expressions visible in this image. If the image is a diagram (no math), return __DIAGRAM__. Wrap inline math in \\( ... \\), display math in \\[ ... \\]. No prose, no markdown.`

export interface LatexExtractResult {
  /** Either the LaTeX string or the literal `__DIAGRAM__` sentinel. */
  text: string
  /** True when the result is the diagram sentinel (caller should keep the original image placeholder). */
  isDiagram: boolean
  usage: { totalTokens: number }
}

export async function extractLatexFromImage(
  imageBuffer: Buffer,
  mimeType: LatexExtractMime,
): Promise<LatexExtractResult> {
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
    { responseMimeType: 'text/plain' },
  )

  // Gemini occasionally wraps the response in markdown code fences even
  // when asked not to — strip those and trim.
  const cleaned = result.text
    .replace(/^```(?:latex|tex)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  const isDiagram = cleaned.length === 0 || cleaned === DIAGRAM_SENTINEL

  return {
    text: cleaned,
    isDiagram,
    usage: { totalTokens: result.usage.totalTokens },
  }
}
