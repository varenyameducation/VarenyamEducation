'use client'

import * as React from 'react'
import Link from 'next/link'
import katex from 'katex'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Question } from '@/lib/ui/api'
import type { DifficultyValue } from '@/lib/validation/question'
import { cn } from '@/lib/utils'

const DIFFICULTY_STYLES: Record<DifficultyValue, string> = {
  easy: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  medium: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  hard: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  advanced: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

const LATEX_TOKEN = /\\[a-zA-Z]+|[\$\^_{}]/

function renderInline(body: string): string {
  if (!LATEX_TOKEN.test(body)) {
    return escapeHtml(body)
  }
  try {
    return katex.renderToString(body, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(body)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string, limit = 220): string {
  return s.length > limit ? `${s.slice(0, limit)}…` : s
}

export function QuestionCard({ q }: { q: Question }) {
  const html = React.useMemo(() => renderInline(truncate(q.question_body)), [q.question_body])

  return (
    <article className="flex flex-col gap-3 rounded-md border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40">
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono uppercase">
          {q.question_type.replace('_', ' ')}
        </Badge>
        <Badge className={cn('border-transparent', DIFFICULTY_STYLES[q.difficulty])}>
          {q.difficulty}
        </Badge>
        <Badge variant="secondary">{q.subject}</Badge>
        <Badge variant="outline" className="uppercase">
          {q.exam_type}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          +{Number(q.marks_correct)} / −{Number(q.marks_negative)}
        </span>
      </header>
      <div
        className="text-sm text-foreground/90"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <footer className="flex items-center gap-2 border-t pt-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/questions/${q.id}`}>View</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/questions/${q.id}/edit`}>Edit</Link>
        </Button>
        <Button variant="ghost" size="sm" disabled>
          Use in Test
        </Button>
        {q.is_verified && (
          <Badge variant="secondary" className="ml-auto">
            Verified
          </Badge>
        )}
      </footer>
    </article>
  )
}
