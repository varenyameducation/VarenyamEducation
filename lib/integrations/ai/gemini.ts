export interface GeminiInlineImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  data: string
}

export interface GeminiGenerateOptions {
  model?: string
  temperature?: number
  responseMimeType?: 'application/json' | 'text/plain'
  timeoutMs?: number
}

export interface GeminiUsage {
  promptTokens: number
  candidatesTokens: number
  totalTokens: number
}

export interface GeminiGenerateResult<T = string> {
  text: T
  usage: GeminiUsage
}

export type GeminiErrorCode =
  | 'NO_KEY'
  | 'AUTH_FAIL'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'BAD_RESPONSE'
  | 'NETWORK'

export class GeminiError extends Error {
  code: GeminiErrorCode
  status?: number

  constructor(code: GeminiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'GeminiError'
    this.code = code
    this.status = status
  }
}

const DEFAULT_MODEL = 'gemini-2.5-flash'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TEMPERATURE = 0.1
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiRestPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: { parts?: GeminiRestPart[] }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: { code?: number; message?: string; status?: string }
}

export async function geminiGenerateText(
  prompt: string,
  images: GeminiInlineImage[],
  options: GeminiGenerateOptions = {},
): Promise<GeminiGenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiError(
      'NO_KEY',
      'GEMINI_API_KEY is not set. Add it to .env.local (see .env.example).',
    )
  }

  const model = options.model ?? DEFAULT_MODEL
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const parts: GeminiRestPart[] = []
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } })
  }
  parts.push({ text: prompt })

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
  }

  const url = `${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new GeminiError('TIMEOUT', `Gemini request timed out after ${timeoutMs}ms`)
    }
    throw new GeminiError('NETWORK', `Gemini network error: ${(err as Error).message}`)
  }
  clearTimeout(timer)

  if (res.status === 401 || res.status === 403) {
    throw new GeminiError('AUTH_FAIL', `Gemini auth failed (HTTP ${res.status})`, res.status)
  }
  if (res.status === 429) {
    throw new GeminiError('RATE_LIMIT', 'Gemini rate limit exceeded', res.status)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const errBody = (await res.json()) as GeminiRestResponse
      detail = errBody.error?.message ?? ''
    } catch {
      // ignore — body wasn't JSON
    }
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      res.status,
    )
  }

  let payload: GeminiRestResponse
  try {
    payload = (await res.json()) as GeminiRestResponse
  } catch {
    throw new GeminiError('BAD_RESPONSE', 'Gemini response was not valid JSON')
  }

  const text = payload.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
  if (typeof text !== 'string' || text.length === 0) {
    throw new GeminiError(
      'BAD_RESPONSE',
      `Gemini response missing text part${payload.candidates?.[0]?.finishReason ? ` (finishReason: ${payload.candidates[0].finishReason})` : ''}`,
    )
  }

  return {
    text,
    usage: {
      promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? 0,
    },
  }
}
