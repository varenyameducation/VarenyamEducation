'use client'

import * as React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { stripImagePlaceholders } from '@/lib/ui/render-body'
import type { Question } from '@/lib/ui/api'
import type { DifficultyValue } from '@/lib/validation/question'

const LATEX_TOKEN = /\\[a-zA-Z]+|[\$\^_{}]/

const DIFFICULTY_STYLES: Record<DifficultyValue, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-800',
  hard: 'bg-orange-100 text-orange-700',
  advanced: 'bg-rose-100 text-rose-700',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInline(body: string): string {
  if (!LATEX_TOKEN.test(body)) return escapeHtml(body)
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

function truncate(s: string, limit = 220): string {
  return s.length > limit ? `${s.slice(0, limit)}…` : s
}

export interface QuestionResultsListProps {
  questions: Question[]
  selectedIds: Set<string>
  onToggle: (q: Question) => void
  isLoading?: boolean
  errorMessage?: string | null
  totalSelected: number
  totalMarks: number
}

export function QuestionResultsList({
  questions,
  selectedIds,
  onToggle,
  isLoading,
  errorMessage,
  totalSelected,
  totalMarks,
}: QuestionResultsListProps) {
  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-semibold">
          {isLoading ? 'Searching…' : `${questions.length} match${questions.length === 1 ? '' : 'es'}`}
        </h3>
      </header>

      {errorMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Loading questions…
          </p>
        ) : questions.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No questions match the current filters.
          </p>
        ) : (
          questions.map((q) => {
            const selected = selectedIds.has(q.id)
            return (
              <label
                key={q.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent/40',
                  selected && 'border-primary bg-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={selected}
                  onChange={() => onToggle(q)}
                  aria-label={`Select question ${q.id}`}
                />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono uppercase">
                      {q.question_type.replace('_', ' ')}
                    </Badge>
                    <Badge
                      className={cn(
                        'border-transparent',
                        DIFFICULTY_STYLES[q.difficulty as DifficultyValue],
                      )}
                    >
                      {q.difficulty}
                    </Badge>
                    <Badge variant="secondary">{q.subject}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      +{Number(q.marks_correct)} / −{Number(q.marks_negative)}
                    </span>
                  </div>
                  <div
                    className="text-sm text-foreground/90"
                    dangerouslySetInnerHTML={{
                      __html: renderInline(truncate(stripImagePlaceholders(q.question_body))),
                    }}
                  />
                </div>
              </label>
            )
          })
        )}
      </div>

      <footer
        className="sticky bottom-0 mt-3 flex items-center justify-between rounded-md border bg-card px-4 py-2 text-sm shadow-sm"
        role="status"
        aria-live="polite"
      >
        <span className="font-medium">
          {totalSelected} question{totalSelected === 1 ? '' : 's'} selected
        </span>
        <span className="text-muted-foreground">
          {totalMarks} mark{totalMarks === 1 ? '' : 's'}
        </span>
      </footer>
    </section>
  )
}
