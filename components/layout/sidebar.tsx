import Link from 'next/link'
import {
  LayoutDashboard,
  FolderTree,
  Library,
  ClipboardList,
  Settings,
} from 'lucide-react'
import type { JWTPayload } from '@/lib/auth/jwt'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles?: Array<JWTPayload['role']>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/taxonomy',
    label: 'Taxonomy',
    icon: FolderTree,
    roles: ['super_admin', 'admin'],
  },
  { href: '/questions', label: 'Question Bank', icon: Library },
  { href: '/tests', label: 'Tests', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin'] },
]

export function Sidebar({ role }: { role: JWTPayload['role'] }) {
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-semibold tracking-tight">Varenyam</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
