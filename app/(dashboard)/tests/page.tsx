'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientDate } from '@/components/ui/client-date'
import { Select } from '@/components/ui/select'
import { apiGet, type Paginated } from '@/lib/ui/api'
import { TEST_STATUSES, type TestStatus } from '@/lib/validation/test'
import { MOCK_TESTS, type TestListItem } from '@/lib/ui/mocks/tests'

export default function TestsListPage() {
  const [status, setStatus] = React.useState<TestStatus | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['tests', 'list', status],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      return apiGet<Paginated<TestListItem>>(`/api/tests?${qs.toString()}`)
    },
    // Mock fallback while backend /api/tests is in flight.
    placeholderData: {
      ok: true,
      data: {
        items: status ? MOCK_TESTS.filter((t) => t.status === status) : MOCK_TESTS,
        page: 1,
        limit: MOCK_TESTS.length,
        total: MOCK_TESTS.length,
      },
    },
  })

  const items = data?.ok ? data.data.items : []
  const usingFallback = !data?.ok

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tests</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${items.length} test${items.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/tests/new">New Test</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="status-filter">
          Status
        </label>
        <Select
          id="status-filter"
          className="max-w-xs"
          value={status}
          onChange={(e) => setStatus((e.target.value as TestStatus) || '')}
        >
          <option value="">All statuses</option>
          {TEST_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {usingFallback && (
        <div className="flex items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5" />
          /api/tests is not available yet — showing local mock data so the
          builder route is reachable.
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-10 text-center">
          <p className="text-base font-medium">No tests yet.</p>
          <p className="text-sm text-muted-foreground">
            Build your first test from the question bank.
          </p>
          <Button asChild className="mt-3">
            <Link href="/tests/new">New Test</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((t) => (
            <Link
              key={t.id}
              href={`/tests/${t.id}/edit`}
              className="block rounded-md border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{t.title}</h2>
                <Badge variant="outline" className="uppercase">
                  {t.status}
                </Badge>
                {t.exam_type ? <Badge variant="secondary">{t.exam_type}</Badge> : null}
                {(t.subjects ?? []).map((s) => (
                  <Badge key={s} variant="muted">
                    {s}
                  </Badge>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.question_count ?? 0} Q · {Number(t.total_marks ?? 0)} marks · {t.duration_minutes}m
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Updated <ClientDate iso={t.updated_at} />
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
