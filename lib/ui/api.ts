export interface ApiError {
  code: string
  message: string
  details?: unknown
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
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
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

export async function apiDelete<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  return apiGet<T>(path, { ...init, method: 'DELETE' })
}
