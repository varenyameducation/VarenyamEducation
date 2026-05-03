import Link from 'next/link'
import { Library, ClipboardList, FolderTree } from 'lucide-react'
import { getSessionFromCookies } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TILES = [
  {
    href: '/questions',
    title: 'Question Bank',
    description: 'Browse, add, and manage questions tagged by topic.',
    icon: Library,
  },
  {
    href: '/tests',
    title: 'Tests',
    description: 'Build branded test papers and export to PDF or DOCX.',
    icon: ClipboardList,
  },
  {
    href: '/taxonomy',
    title: 'Taxonomy',
    description: 'Set up Courses, Chapters, and Topics for your institute.',
    icon: FolderTree,
  },
]

export default async function DashboardHomePage() {
  const session = getSessionFromCookies()
  const user = session
    ? await prisma.user.findUnique({
        where: { supabase_uid: session.sub },
        select: { full_name: true, email: true },
      })
    : null

  const greetingName = user?.full_name || user?.email || 'there'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome, {greetingName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a module to get started.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <Link key={tile.href} href={tile.href} className="block">
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader className="space-y-3">
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-lg">{tile.title}</CardTitle>
                  <CardDescription>{tile.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
