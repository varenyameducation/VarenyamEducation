import { NextResponse, type NextRequest } from 'next/server'
import { verifyJWTEdge } from '@/lib/auth/jwt-edge'

const PUBLIC_ROUTES = new Set([
  '/login',
  '/auth/callback',
  '/auth/google',
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/refresh',
])

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('__access_token')?.value

  if (PUBLIC_ROUTES.has(request.nextUrl.pathname)) return NextResponse.next()

  if (!token) return NextResponse.redirect(new URL('/login', request.url))
  const payload = await verifyJWTEdge(token)
  if (!payload) return NextResponse.redirect(new URL('/login', request.url))

  if (request.nextUrl.pathname.startsWith('/admin') && payload.role !== 'super_admin')
    return NextResponse.redirect(new URL('/dashboard', request.url))

  const headers = new Headers(request.headers)
  headers.set('x-user-id', payload.sub)
  headers.set('x-user-role', payload.role)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
