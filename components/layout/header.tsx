import { UserMenu } from './user-menu'

interface HeaderProps {
  email: string
  fullName: string
  role: string
  avatarUrl?: string | null
  instituteName?: string
}

export function Header({
  email,
  fullName,
  role,
  avatarUrl,
  instituteName = 'Varenyam Coaching Institute',
}: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="text-sm font-medium text-muted-foreground">{instituteName}</div>
      <UserMenu email={email} fullName={fullName} role={role} avatarUrl={avatarUrl} />
    </header>
  )
}
