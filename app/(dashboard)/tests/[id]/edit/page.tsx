'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  QuestionFilterPanel,
  useQuestionPool,
  type PoolFilters,
} from '@/components/tests/question-filter-panel'
import { QuestionResultsList } from '@/components/tests/question-results-list'
import {
  SelectedQuestionsSorter,
  type SelectedQuestion,
} from '@/components/tests/selected-questions-sorter'
import { TestPreviewModal } from '@/components/tests/test-preview-modal'
import { TestSetupModal } from '@/components/tests/test-setup-modal'
import { TestActionBar } from '@/components/tests/test-action-bar'
import { apiGet, type Question } from '@/lib/ui/api'
import type { TestSetupValues, TestStatus } from '@/lib/validation/test'
import type { SubjectValue, ExamTypeValue } from '@/lib/validation/question'

interface TestRecord {
  id: string
  title: string
  course_id: string
  subjects?: SubjectValue[]
  subject?: SubjectValue
  exam_type: ExamTypeValue
  duration_minutes: number
  instructions?: string | null
  status: TestStatus
  test_questions?: Array<{
    question_id: string
    position: number
    section_label: string | null
    marks_override: number | string | null
    question: Question
  }>
}

function totalMarksOf(items: SelectedQuestion[]): number {
  return items.reduce(
    (acc, it) =>
      acc + (it.marks_override ?? Number(it.question.marks_correct) ?? 0),
    0,
  )
}

export default function TestBuilderEditPage({
  params,
}: {
  params: { id: string }
}) {
  const [filters, setFilters] = React.useState<PoolFilters>({})
  const [selected, setSelected] = React.useState<SelectedQuestion[]>([])
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [meta, setMeta] = React.useState<TestSetupValues>({
    title: '',
    course_id: '',
    subjects: [],
    exam_type: 'jee',
    duration_minutes: 180,
    instructions: '',
  })

  const isLocalDraft = params.id === 'draft-local'

  const testQuery = useQuery({
    queryKey: ['tests', params.id],
    queryFn: () => apiGet<TestRecord>(`/api/tests/${params.id}`),
    enabled: !isLocalDraft,
  })

  // Hydrate meta + selected once when the test loads.
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (hydratedRef.current) return
    if (!testQuery.data?.ok) return
    const t = testQuery.data.data
    hydratedRef.current = true
    setMeta({
      title: t.title,
      course_id: t.course_id,
      subjects: t.subjects ?? (t.subject ? [t.subject] : []),
      exam_type: t.exam_type,
      duration_minutes: t.duration_minutes,
      instructions: t.instructions ?? '',
    })
    const rows = t.test_questions ?? []
    const hydrated: SelectedQuestion[] = rows
      .sort((a, b) => a.position - b.position)
      .map((r) => ({
        question: r.question,
        position: r.position,
        section_label: r.section_label ?? '',
        marks_override:
          r.marks_override == null ? null : Number(r.marks_override),
      }))
    setSelected(hydrated)
  }, [testQuery.data])

  const pool = useQuestionPool(filters)
  const poolItems = pool.data?.ok ? pool.data.data.items : []
  const poolError =
    pool.data && !pool.data.ok ? pool.data.error.message : null

  const selectedIds = React.useMemo(
    () => new Set(selected.map((s) => s.question.id)),
    [selected],
  )
  const totalMarks = React.useMemo(() => totalMarksOf(selected), [selected])

  const toggleQuestion = React.useCallback((q: Question) => {
    setSelected((prev) => {
      if (prev.some((p) => p.question.id === q.id)) {
        return prev
          .filter((p) => p.question.id !== q.id)
          .map((p, idx) => ({ ...p, position: idx + 1 }))
      }
      return [
        ...prev,
        {
          question: q,
          position: prev.length + 1,
          section_label: '',
          marks_override: null,
        },
      ]
    })
  }, [])

  const removeQuestion = React.useCallback((id: string) => {
    setSelected((prev) =>
      prev
        .filter((p) => p.question.id !== id)
        .map((p, idx) => ({ ...p, position: idx + 1 })),
    )
  }, [])

  const updateQuestion = React.useCallback(
    (
      id: string,
      patch: Partial<Pick<SelectedQuestion, 'section_label' | 'marks_override'>>,
    ) =>
      setSelected((prev) =>
        prev.map((p) => (p.question.id === id ? { ...p, ...patch } : p)),
      ),
    [],
  )

  if (!isLocalDraft && testQuery.isLoading) {
    return (
      <div className="rounded-md border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        Loading test…
      </div>
    )
  }

  if (!isLocalDraft && testQuery.data && !testQuery.data.ok) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          /api/tests is not reachable yet — using local-draft mode.
          ({testQuery.data.error.message})
        </div>
        <Button asChild variant="outline">
          <Link href="/tests">Back to list</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {meta.title || 'New test'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selected.length} question{selected.length === 1 ? '' : 's'} ·{' '}
            {totalMarks} mark{totalMarks === 1 ? '' : 's'} ·{' '}
            {meta.duration_minutes} min
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="mr-1.5 h-4 w-4" />
            Preview
          </Button>
          <Button asChild variant="ghost">
            <Link href="/tests">Back to list</Link>
          </Button>
        </div>
      </div>

      <details className="rounded-md border bg-card p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">
          Step 1 — Test setup
        </summary>
        <div className="mt-4">
          <TestSetupModal
            defaultValues={meta}
            onSubmit={(values) => setMeta(values)}
            submitLabel="Update setup"
          />
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <QuestionFilterPanel value={filters} onChange={setFilters} />
        <QuestionResultsList
          questions={poolItems}
          selectedIds={selectedIds}
          onToggle={toggleQuestion}
          isLoading={pool.isLoading}
          errorMessage={poolError}
          totalSelected={selected.length}
          totalMarks={totalMarks}
        />
      </div>

      <SelectedQuestionsSorter
        items={selected}
        onReorder={setSelected}
        onRemove={removeQuestion}
        onUpdate={updateQuestion}
      />

      <TestPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        meta={{
          title: meta.title,
          duration_minutes: meta.duration_minutes,
          total_marks: totalMarks,
          instructions: meta.instructions,
        }}
        selected={selected}
      />

      <TestActionBar
        testId={params.id}
        meta={meta}
        selected={selected}
        disabledReason={
          isLocalDraft
            ? 'Local draft — saving needs /api/tests to be reachable.'
            : null
        }
      />
    </div>
  )
}
