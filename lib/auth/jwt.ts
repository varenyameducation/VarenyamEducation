import jwt from 'jsonwebtoken'

export interface JWTPayload {
  sub: string       // Supabase user UUID
  email: string
  role: 'super_admin' | 'admin' | 'teacher'
  inst_id: string   // hardcoded 'varenyam-institute' for now
  iat: number
  exp: number
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const expiresIn = parseInt(process.env.JWT_EXPIRES_IN ?? '86400', 10)
  return jwt.sign(payload, getJwtSecret(), { expiresIn })
}

export function signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const expiresIn = parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '604800', 10)
  return jwt.sign(payload, getJwtSecret(), { expiresIn })
}

export function verifyToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, getJwtSecret())
  return decoded as JWTPayload
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token)
    return decoded as JWTPayload | null
  } catch {
    return null
  }
}
