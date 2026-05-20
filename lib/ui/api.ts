import type {
  DifficultyValue,
  ExamTypeValue,
  QuestionTypeValue,
  SubjectValue,
} from '@/lib/validation/question'

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

// Wire-format question record returned by /api/questions. Decimal columns
// (marks_*, numerical_answer) arrive as strings after JSON serialization.
export interface Question {
  id: string
  course_id: string | null
  chapter_id: string | null
  topic_id: string | null
  subject: SubjectValue
  question_type: QuestionTypeValue
  difficulty: DifficultyValue
  exam_type: ExamTypeValue
  marks_correct: number | string
  marks_negative: number | string
  marks_partial?: number | string | null
  question_body: string
  option_a?: string | null
  option_b?: string | null
  option_c?: string | null
  option_d?: string | null
  correct_option: string[]
  numerical_answer?: number | string | null
  matrix_left?: unknown
  matrix_right?: unknown
  matrix_answer?: unknown
  solution?: string | null
  explanation?: string | null
  hint?: string | null
  image_urls?: string[]
  tags?: string[]
  is_verified: boolean
  times_used: number
  created_at: string
  updated_at: string
  course?: { id: string; name: string } | null
  chapter?: { id: string; name: string } | null
  topic?: { id: string; name: string } | null
}

export interface Paginated<T> {
  items: T[]
  page: number
  limit: number
  total: number
}

export type ApiResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: ApiError }

interface SuccessEnvelope<T> {
  success: true
  data: T
  meta?: Record<string, unknown>
}

interface FailureEnvelope {
  success: false
  error: ApiError
}

type Envelope<T> = SuccessEnvelope<T> | FailureEnvelope

async function parseEnvelope<T>(res: Response): Promise<ApiResult<T>> {
  let body: Envelope<T> | null = null
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    return {
      ok: false,
      error: {
        code: 'INVALID_RESPONSE',
        message: `Server returned non-JSON (HTTP ${res.status}).`,
      },
    }
  }
  if (!body) {
    return {
      ok: false,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response from server.' },
    }
  }
  if (body.success) {
    return { ok: true, data: body.data, meta: body.meta }
  }
  return { ok: false, error: body.error }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
    return parseEnvelope<T>(res)
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      },
    }
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      ...init,
      headers: isFormData
        ? { Accept: 'application/json', ...(init?.headers ?? {}) }
        : {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(init?.headers ?? {}),
          },
      body: isFormData ? (body as FormData) : JSON.stringify(body),
    })
    return parseEnvelope<T>(res)
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      },
    }
  }
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  return apiPost<T>(path, body, { ...init, method: 'PATCH' })
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  return apiPost<T>(path, body, { ...init, method: 'PUT' })
}

export async function apiDelete<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  return apiGet<T>(path, { ...init, method: 'DELETE' })
}
