import { cookies } from 'next/headers'
import { type JWTPayload, signAccessToken, signRefreshToken, verifyToken } from './jwt'

export const ACCESS_TOKEN_COOKIE = '__access_token'
export const REFRESH_TOKEN_COOKIE = '__refresh_token'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
}

export function setAuthCookies(payload: Omit<JWTPayload, 'iat' | 'exp'>): {
  accessToken: string
  refreshToken: string
} {
  const accessToken = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)

  const cookieStore = cookies()

  const accessExpiresIn = parseInt(process.env.JWT_EXPIRES_IN ?? '86400', 10)
  const refreshExpiresIn = parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '604800', 10)

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: accessExpiresIn,
  })

  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: refreshExpiresIn,
  })

  return { accessToken, refreshToken }
}

export function clearAuthCookies(): void {
  const cookieStore = cookies()
  cookieStore.set(ACCESS_TOKEN_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
  cookieStore.set(REFRESH_TOKEN_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

export function getSessionFromCookies(): JWTPayload | null {
  const cookieStore = cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value

  if (!accessToken) return null

  try {
    return verifyToken(accessToken)
  } catch {
    return null
  }
}

export function getRefreshTokenFromCookies(): string | null {
  const cookieStore = cookies()
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
