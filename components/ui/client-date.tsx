'use client'

import * as React from 'react'

// Renders a date string using the browser's locale. Server-render is the raw
// ISO so React doesn't hydrate-mismatch when the server's locale (e.g. en-GB
// on the dev machine) disagrees with the user's browser locale (e.g. en-US).
export function ClientDate({
  iso,
  mode = 'datetime',
}: {
  iso: string | null | undefined
  mode?: 'date' | 'datetime'
}) {
  const [text, setText] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!iso) {
      setText(null)
      return
    }
    try {
      const d = new Date(iso)
      setText(mode === 'date' ? d.toLocaleDateString() : d.toLocaleString())
    } catch {
      setText(iso)
    }
  }, [iso, mode])

  return <span suppressHydrationWarning>{text ?? iso ?? ''}</span>
}
