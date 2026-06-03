'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FolderTree,
  Library,
  ClipboardList,
  Settings,
} from 'lucide-react'
import type { JWTPayload } from '@/lib/auth/jwt'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles?: Array<JWTPayload['role']>
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
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

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar({ role }: { role: JWTPayload['role'] }) {
  const pathname = usePathname() ?? '/'
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))

  return (
    <aside className="relative flex h-screen w-64 flex-col overflow-hidden bg-primary text-primary-foreground">
      {/* Subtle accent blobs matching the login brand panel, kept low-opacity
          so they read as ambient brand colour rather than UI content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-16 h-56 w-56 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, hsl(41 92% 55% / 0.15), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, hsl(358 73% 47% / 0.18), transparent)',
        }}
      />

      <div className="relative z-10 flex h-20 items-center gap-3 border-b border-white/15 px-5">
        {/* White pill behind the V mark — the teal portion of the logo
            disappears against the teal sidebar otherwise. Same treatment
            as the login brand panel for visual continuity. */}
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <Image
            src="/brand/varenyam-logo-mark.png"
            alt=""
            width={250}
            height={230}
            priority
            className="h-8 w-auto object-contain"
          />
        </span>
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-tight">Varenyam</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/70">
            Leading the way
          </p>
        </div>
      </div>

      <nav className="relative z-10 flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-white/15 text-primary-foreground shadow-sm ring-1 ring-white/10'
                  : 'text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 transition-transform',
                  active
                    ? 'text-primary-foreground'
                    : 'text-primary-foreground/75 group-hover:text-primary-foreground',
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="relative z-10 border-t border-white/10 px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-primary-foreground/55">
        Varenyam Coaching
      </div>
    </aside>
  )
}
