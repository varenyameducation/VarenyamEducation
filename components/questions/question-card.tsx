'use client'

import * as React from 'react'
import Link from 'next/link'
import 'katex/dist/katex.min.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RenderedBody, renderBodyHtml } from '@/lib/ui/render-body'
import type { Question } from '@/lib/ui/api'
import type { DifficultyValue } from '@/lib/validation/question'
import { formatTagLabel } from '@/lib/ui/mocks/m2m'
import { cn } from '@/lib/utils'

const DIFFICULTY_STYLES: Record<DifficultyValue, string> = {
  easy: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  medium: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  hard: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  advanced: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'] as const
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

export interface QuestionCardProps {
  q: Question
  selected?: boolean
  onToggleSelected?: () => void
}

export function QuestionCard({ q, selected, onToggleSelected }: QuestionCardProps) {
  const correctSet = React.useMemo(
    () => new Set((q.correct_option ?? []).map((c) => c.toUpperCase())),
    [q.correct_option],
  )

  const isMcq = q.question_type === 'mcq' || q.question_type === 'multi_select'
  const tags = q.taxonomies ?? []
  const primaryTag = tags[0] ?? null
  const overflowTags = tags.slice(1)

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-card p-4 shadow-sm',
        selected && 'border-primary ring-1 ring-primary/40',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        {onToggleSelected && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onToggleSelected}
            className="h-3.5 w-3.5"
            aria-label={`Select question ${q.id}`}
          />
        )}
        <Badge variant="outline" className="font-mono uppercase">
          {q.question_type.replace('_', ' ')}
        </Badge>
        <Badge className={cn('border-transparent', DIFFICULTY_STYLES[q.difficulty])}>
          {q.difficulty}
        </Badge>
        <Badge variant="secondary">{q.subject}</Badge>
        {primaryTag && (
          <span
            className="inline-flex max-w-[42ch] items-center truncate rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs"
            title={
              overflowTags.length > 0
                ? [primaryTag, ...overflowTags].map(formatTagLabel).join('\n')
                : formatTagLabel(primaryTag)
            }
          >
            <span className="truncate">{formatTagLabel(primaryTag)}</span>
            {overflowTags.length > 0 && (
              <span className="ml-1 shrink-0 font-medium text-primary">
                +{overflowTags.length} more
              </span>
            )}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          +{Number(q.marks_correct)} / −{Number(q.marks_negative)}
        </span>
      </header>

      <RenderedBody className="text-sm text-foreground/90" body={q.question_body} />

      {isMcq && (
        <ol className="grid gap-1.5 sm:grid-cols-2 text-sm">
          {OPTION_KEYS.map((key, idx) => {
            const value = q[key]
            if (!value) return null
            const letter = OPTION_LETTERS[idx]
            const isCorrect = correctSet.has(letter)
            return (
              <li
                key={key}
                className={cn(
                  'rounded-md border px-3 py-1.5',
                  isCorrect && 'border-emerald-300 bg-emerald-50',
                )}
              >
                <span className="mr-2 font-semibold">({letter})</span>
                <span
                  className="inline"
                  dangerouslySetInnerHTML={{ __html: renderBodyHtml(String(value)) }}
                />
                {isCorrect && (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-700">
                    correct
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {q.question_type === 'numerical' && q.numerical_answer != null && (
        <p className="text-sm">
          <span className="font-semibold">Answer:</span>{' '}
          <code className="rounded bg-muted px-1.5 py-0.5">
            {String(q.numerical_answer)}
          </code>
        </p>
      )}

      <footer className="flex items-center gap-2 border-t pt-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/questions/${q.id}`}>View</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/questions/${q.id}/edit`}>Edit</Link>
        </Button>
        {q.is_verified ? (
          <Badge variant="secondary" className="ml-auto">
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="ml-auto text-amber-700">
            Needs review
          </Badge>
        )}
      </footer>
    </article>
  )
}
