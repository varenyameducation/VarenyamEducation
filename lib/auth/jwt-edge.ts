import { jwtVerify } from 'jose'
import type { JWTPayload } from './jwt'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return new TextEncoder().encode(secret)
}

export async function verifyJWTEdge(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] })
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}
