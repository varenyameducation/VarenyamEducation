import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/auth/session'

export default function RootPage() {
  const session = getSessionFromCookies()
  if (session) redirect('/dashboard')
  redirect('/login')
}
