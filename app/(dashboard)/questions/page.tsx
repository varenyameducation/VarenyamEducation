'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionFilters } from '@/components/questions/question-filters'
import { QuestionCard } from '@/components/questions/question-card'
import { apiGet, type Paginated, type Question } from '@/lib/ui/api'

const PAGE_SIZE = 20

// URL params (frontend) → API query params (backend at lib/api/questions.ts).
function buildApiQuery(sp: URLSearchParams): string {
  const next = new URLSearchParams()
  const map: Record<string, string> = {
    course: 'course_id',
    chapter: 'chapter_id',
    topic: 'topic_id',
    subject: 'subject',
    difficulty: 'difficulty',
    type: 'question_type',
    exam: 'exam_type',
    q: 'search',
  }
  for (const [from, to] of Object.entries(map)) {
    const v = sp.get(from)
    if (v) next.set(to, v)
  }
  const page = sp.get('page') ?? '1'
  next.set('page', page)
  next.set('limit', String(PAGE_SIZE))
  return next.toString()
}

export default function QuestionsListPage() {
  const sp = useSearchParams()
  const qs = React.useMemo(() => buildApiQuery(sp ?? new URLSearchParams()), [sp])

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['questions', 'list', qs],
    queryFn: () => apiGet<Paginated<Question>>(`/api/questions?${qs}`),
  })

  const page = Number(sp?.get('page') ?? '1') || 1
  const items = data?.ok ? data.data.items : []
  const total = data?.ok ? data.data.total : 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildPageHref = (n: number) => {
    const next = new URLSearchParams(sp?.toString() ?? '')
    next.set('page', String(n))
    return `/questions?${next.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading…'
              : `${total} question${total === 1 ? '' : 's'} match your filters.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/questions/import">Bulk import</Link>
          </Button>
          <Button asChild>
            <Link href="/questions/new">New question</Link>
          </Button>
        </div>
      </div>

      <QuestionFilters />

      {data && !data.ok && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {data.error.message}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-md border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          Loading questions…
        </div>
      ) : items.length === 0 && data?.ok ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 p-10 text-center">
          <p className="text-base font-medium">No questions match these filters.</p>
          <p className="text-sm text-muted-foreground">
            Try clearing filters, or create the first question for this slice.
          </p>
          <Button asChild>
            <Link href="/questions/new">Create question</Link>
          </Button>
        </div>
      ) : (
        <div
          className="grid gap-3"
          aria-busy={isFetching ? 'true' : 'false'}
        >
          {items.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav
          className="flex items-center justify-between border-t pt-4"
          aria-label="Pagination"
        >
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={buildPageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= pages}>
              <Link href={buildPageHref(Math.min(pages, page + 1))}>Next</Link>
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
