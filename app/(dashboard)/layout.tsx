import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = getSessionFromCookies()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { supabase_uid: session.sub },
    select: { email: true, full_name: true, role: true, avatar_url: true },
  })

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen">
      <Sidebar role={user.role as 'super_admin' | 'admin' | 'teacher'} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          email={user.email}
          fullName={user.full_name}
          role={user.role}
          avatarUrl={user.avatar_url}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
