import { getRefreshTokenFromCookies, setAuthCookies } from '@/lib/auth/session'
import { verifyToken } from '@/lib/auth/jwt'
import { ok, err } from '@/lib/api/response'

export async function POST() {
  const refreshToken = getRefreshTokenFromCookies()
  if (!refreshToken) {
    return err(401, { code: 'NO_REFRESH_TOKEN', message: 'Refresh token not found' })
  }

  let payload
  try {
    payload = verifyToken(refreshToken)
  } catch {
    return err(401, { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' })
  }

  setAuthCookies({
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    inst_id: payload.inst_id,
  })

  return ok({ refreshed: true })
}
