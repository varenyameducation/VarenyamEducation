'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Layers,
  ListTree,
  Plus,
  RefreshCw,
  Tags,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionCard } from '@/components/questions/question-card'
import { BulkRetagModal } from '@/components/questions/bulk-retag-modal'
import { QuestionTable } from '@/components/questions/question-table'
import { QuestionFilterBar, DEFAULT_FILTERS } from '@/components/questions/question-filter-bar'
import type { QuestionFilters } from '@/components/questions/question-filter-bar'
import { apiGet, type Paginated, type Question } from '@/lib/ui/api'
import { cn } from '@/lib/utils'

type CourseNode = { id: string; name: string; grade: number }
type ChapterNode = { id: string; name: string }
type TopicNode = { id: string; name: string }

// Read the legacy "primary tag" view of a question — the first m2m tag.
// Used for backward-compatible grouping/filtering; multi-tag cross-product
// grouping is deliberately not done here (would change visible counts).
type QuestionWithTaxonomy = Question
function primaryTag(q: Question) {
  return q.taxonomies?.[0]
}

type Selection =
  | { kind: 'all' }
  | { kind: 'course'; courseId: string }
  | { kind: 'chapter'; courseId: string; chapterId: string }
  | { kind: 'topic'; courseId: string; chapterId: string; topicId: string }

const QUESTION_FETCH_LIMIT = 200

// Single source of truth: one /api/questions fetch with no taxonomy filters.
// Tree counts AND the visible question list are both derived from this list,
// so the UI can never get into the state "tree says 14, panel says 0".
function useAllQuestions() {
  return useQuery({
    queryKey: ['questions', 'list', 'all', QUESTION_FETCH_LIMIT],
    queryFn: () =>
      apiGet<Paginated<QuestionWithTaxonomy>>(`/api/questions?limit=${QUESTION_FETCH_LIMIT}`),
    refetchOnMount: 'always',
  })
}

export default function QuestionsListPage() {
  const [selection, setSelection] = React.useState<Selection>({ kind: 'all' })
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [retagOpen, setRetagOpen] = React.useState(false)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseNode[] }>('/api/taxonomy/courses'),
  })
  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []

  const questionsQuery = useAllQuestions()
  const allItems = questionsQuery.data?.ok ? questionsQuery.data.data.items : []
  const total = questionsQuery.data?.ok ? questionsQuery.data.data.total : 0

  // Client-side counts per taxonomy id, derived from the single fetched list.
  const counts = React.useMemo(() => buildCounts(allItems), [allItems])

  // Filter visible questions by current selection (no extra API call).
  // Match any tag on the question — a multi-tagged question shows under
  // every relevant slice in the left tree.
  const visible = React.useMemo(() => {
    if (selection.kind === 'all') return allItems
    if (selection.kind === 'course') {
      return allItems.filter((q) =>
        q.taxonomies?.some((t) => t.course_id === selection.courseId),
      )
    }
    if (selection.kind === 'chapter') {
      return allItems.filter((q) =>
        q.taxonomies?.some((t) => t.chapter_id === selection.chapterId),
      )
    }
    return allItems.filter((q) =>
      q.taxonomies?.some((t) => t.topic_id === selection.topicId),
    )
  }, [allItems, selection])

  const toggleSelected = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])

  const allVisibleSelected =
    visible.length > 0 && visible.every((q) => selectedIds.has(q.id))
  const toggleSelectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const q of visible) next.delete(q.id)
      } else {
        for (const q of visible) next.add(q.id)
      }
      return next
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            {questionsQuery.isLoading
              ? 'Loading…'
              : `${total} question${total === 1 ? '' : 's'} in your bank across ${courses.length} course${courses.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => questionsQuery.refetch()}
            disabled={questionsQuery.isFetching}
            title="Refresh"
          >
            <RefreshCw
              className={cn('h-4 w-4', questionsQuery.isFetching && 'animate-spin')}
            />
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/questions/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add question
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/questions/import">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Bulk upload
            </Link>
          </Button>
        </div>
      </header>

      {questionsQuery.data && !questionsQuery.data.ok && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>{questionsQuery.data.error.code}:</strong>{' '}
            {questionsQuery.data.error.message}
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectVisible}
              className="h-3.5 w-3.5"
              aria-label="Select all visible"
            />
            {allVisibleSelected ? 'All visible selected' : 'Select all visible'}
          </label>
          <span className="text-muted-foreground">·</span>
          <span>
            <strong>{selectedIds.size}</strong> selected
          </span>
          {selectedIds.size > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRetagOpen(true)}
              disabled={selectedIds.size === 0}
            >
              <Tags className="mr-1.5 h-3.5 w-3.5" />
              Move/Copy to…
            </Button>
          </div>
        </div>
      )}

      <BulkRetagModal
        open={retagOpen}
        onOpenChange={setRetagOpen}
        questionIds={Array.from(selectedIds)}
        onSuccess={clearSelection}
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside>
          <div className="sticky top-4 rounded-md border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <FolderTree className="h-3.5 w-3.5" />
              Browse by taxonomy
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              <TreeNode
                label={`All questions`}
                count={total}
                icon={<ListTree className="h-3.5 w-3.5" />}
                active={selection.kind === 'all'}
                onSelect={() => setSelection({ kind: 'all' })}
              />
              {coursesQuery.isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
              ) : courses.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No courses. Create one under{' '}
                  <Link href="/taxonomy" className="underline">
                    /taxonomy
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {courses.map((course) => (
                    <CourseTreeRow
                      key={course.id}
                      course={course}
                      counts={counts}
                      selection={selection}
                      onSelect={setSelection}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <section>
          <ContentPanel
            selection={selection}
            courses={courses}
            counts={counts}
            visible={visible}
            isLoading={questionsQuery.isLoading}
            onSelect={setSelection}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onRefetch={() => questionsQuery.refetch()}
          />
        </section>
      </div>
    </div>
  )
}

function ContentPanel({
  selection,
  courses,
  counts,
  visible,
  isLoading,
  onSelect,
  selectedIds,
  onToggleSelected,
  onRefetch,
}: {
  selection: Selection
  courses: CourseNode[]
  counts: Counts
  visible: QuestionWithTaxonomy[]
  isLoading: boolean
  onSelect: (s: Selection) => void
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onRefetch: () => void
}) {
  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        Loading questions…
      </div>
    )
  }

  if (selection.kind === 'all') {
    if (visible.length === 0) {
      return (
        <div className="space-y-5">
          <ActionLandingCards />
          <div className="rounded-md border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
            No questions in the bank yet. Add one or import from a Word/PDF document.
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-5">
        <ActionLandingCards />
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2 border-b pb-2">
            <h2 className="text-lg font-semibold tracking-tight">Browse imported questions</h2>
            <span className="text-xs text-muted-foreground">
              Pick a topic in the left tree to focus, or expand a course below
            </span>
          </div>
          <GroupedView
            items={visible}
            onSelect={onSelect}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
          />
        </div>
      </div>
    )
  }

  return (
    <FocusedTopicView
      selection={selection}
      visible={visible}
      courses={courses}
      counts={counts}
      onSelect={onSelect}
      selectedIds={selectedIds}
      onToggleSelected={onToggleSelected}
      onRefetch={onRefetch}
    />
  )
}

function ActionLandingCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link
        href="/questions/new"
        className="flex items-start gap-3 rounded-md border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <Plus className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Add question</h3>
          <p className="text-xs text-muted-foreground">
            Create a single MCQ, numerical, matrix, or subjective question via the form.
          </p>
        </div>
      </Link>
      <Link
        href="/questions/import"
        className="flex items-start gap-3 rounded-md border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <Upload className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Bulk upload</h3>
          <p className="text-xs text-muted-foreground">
            Drop a Word, PDF, or Excel file with multiple questions — all auto-parsed.
          </p>
        </div>
      </Link>
    </div>
  )
}

function FocusedTopicView({
  selection,
  visible,
  courses,
  counts,
  onSelect,
  selectedIds,
  onToggleSelected,
  onRefetch,
}: {
  selection: Exclude<Selection, { kind: 'all' }>
  visible: QuestionWithTaxonomy[]
  courses: CourseNode[]
  counts: Counts
  onSelect: (s: Selection) => void
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onRefetch: () => void
}) {
  const course = courses.find((c) => c.id === selection.courseId)
  const [filters, setFilters] = React.useState<QuestionFilters>(DEFAULT_FILTERS)
  const [page, setPage] = React.useState(0)

  // Reset page when filters change
  React.useEffect(() => { setPage(0) }, [filters])
  // Reset filters + page when taxonomy selection changes
  React.useEffect(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(0)
  }, [selection])

  // Apply client-side filters on top of the already-scoped `visible` array
  const filtered = React.useMemo(() => {
    let items = visible
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter((item) => item.question_body.toLowerCase().includes(q))
    }
    if (filters.type !== 'all') {
      items = items.filter((item) => item.question_type === filters.type)
    }
    if (filters.difficulty !== 'all') {
      items = items.filter((item) => item.difficulty === filters.difficulty)
    }
    if (filters.verified === 'verified') {
      items = items.filter((item) => item.is_verified)
    } else if (filters.verified === 'needs_review') {
      items = items.filter((item) => !item.is_verified)
    }
    return items
  }, [visible, filters])

  // Stats computed from the full `visible` array (pre-filter)
  const stats = React.useMemo(() => {
    const verified = visible.filter((q) => q.is_verified).length
    const needsReview = visible.length - verified
    const mcq = visible.filter(
      (q) => q.question_type === 'mcq' || q.question_type === 'multi_select',
    ).length
    const numerical = visible.filter((q) => q.question_type === 'numerical').length
    return { total: visible.length, verified, needsReview, mcq, numerical }
  }, [visible])

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.difficulty !== 'all' ||
    filters.verified !== 'all'

  return (
    <div className="rounded-md border bg-card">
      {/* Breadcrumb header */}
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => onSelect({ kind: 'all' })}
            className="font-medium text-muted-foreground hover:underline"
          >
            All
          </button>
          <span className="text-muted-foreground">/</span>
          <button
            type="button"
            onClick={() =>
              course && onSelect({ kind: 'course', courseId: course.id })
            }
            className={cn(
              'hover:underline',
              selection.kind === 'course' && 'font-semibold',
            )}
          >
            {course?.name ?? 'Course'}
          </button>
          {(selection.kind === 'chapter' || selection.kind === 'topic') && (
            <CrumbChapter selection={selection} onSelect={onSelect} />
          )}
          {selection.kind === 'topic' && <CrumbTopic selection={selection} />}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            No questions in this part of the taxonomy.{' '}
            <Link href="/questions/import" className="underline">
              Bulk upload
            </Link>{' '}
            or{' '}
            <Link href="/questions/new" className="underline">
              add one
            </Link>
            .
          </div>
        ) : (
          <>
            {/* Stats row */}
            <p className="text-sm text-muted-foreground">
              {stats.total} question{stats.total === 1 ? '' : 's'}
              {' · '}
              <span className="text-emerald-700">{stats.verified} verified</span>
              {' · '}
              <span className="text-amber-600">{stats.needsReview} needs review</span>
              {' · '}
              {stats.mcq} MCQ
              {stats.numerical > 0 && ` · ${stats.numerical} Numerical`}
            </p>

            {/* Filter bar */}
            <QuestionFilterBar filters={filters} onChange={setFilters} />

            {/* Table or empty-filter state */}
            {filtered.length === 0 && hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No questions match your filters
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 text-xs"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <QuestionTable
                questions={filtered}
                selectedIds={selectedIds}
                onToggleSelected={onToggleSelected}
                onDeleted={onRefetch}
                page={page}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CrumbChapter({
  selection,
  onSelect,
}: {
  selection: Exclude<Selection, { kind: 'all' | 'course' }>
  onSelect: (s: Selection) => void
}) {
  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', selection.courseId],
    queryFn: () =>
      apiGet<{ items: ChapterNode[] }>(
        `/api/taxonomy/chapters?course_id=${selection.courseId}`,
      ),
  })
  const chapter = chaptersQuery.data?.ok
    ? chaptersQuery.data.data.items.find((c) => c.id === selection.chapterId)
    : null
  if (!chapter) return null
  return (
    <>
      <span className="text-muted-foreground">/</span>
      <button
        type="button"
        onClick={() =>
          onSelect({
            kind: 'chapter',
            courseId: selection.courseId,
            chapterId: selection.chapterId,
          })
        }
        className={cn(
          'hover:underline',
          selection.kind === 'chapter' && 'font-semibold',
        )}
      >
        {chapter.name}
      </button>
    </>
  )
}

function CrumbTopic({ selection }: { selection: Extract<Selection, { kind: 'topic' }> }) {
  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', selection.chapterId],
    queryFn: () =>
      apiGet<{ items: TopicNode[] }>(
        `/api/taxonomy/topics?chapter_id=${selection.chapterId}`,
      ),
  })
  const topic = topicsQuery.data?.ok
    ? topicsQuery.data.data.items.find((t) => t.id === selection.topicId)
    : null
  if (!topic) return null
  return (
    <>
      <span className="text-muted-foreground">/</span>
      <span className="font-semibold">{topic.name}</span>
    </>
  )
}

function TreeNode({
  label,
  count,
  icon,
  active,
  onSelect,
  level = 0,
  hasChildren,
  expanded,
  onToggle,
}: {
  label: string
  count: number
  icon: React.ReactNode
  active: boolean
  onSelect: () => void
  level?: number
  hasChildren?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="group flex items-center gap-1">
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{ marginLeft: level * 12 }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="w-5 shrink-0" style={{ marginLeft: level * 12 }} />
      )}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex flex-1 items-center gap-2 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-accent',
          active && 'bg-primary/10 font-medium text-primary',
        )}
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-mono',
            count > 0
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      </button>
    </div>
  )
}

function CourseTreeRow({
  course,
  counts,
  selection,
  onSelect,
}: {
  course: CourseNode
  counts: Counts
  selection: Selection
  onSelect: (s: Selection) => void
}) {
  const courseIsInPath =
    (selection.kind === 'course' ||
      selection.kind === 'chapter' ||
      selection.kind === 'topic') &&
    selection.courseId === course.id
  const [expanded, setExpanded] = React.useState(courseIsInPath)
  React.useEffect(() => {
    if (courseIsInPath) setExpanded(true)
  }, [courseIsInPath])

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', course.id],
    queryFn: () =>
      apiGet<{ items: ChapterNode[] }>(`/api/taxonomy/chapters?course_id=${course.id}`),
    enabled: expanded,
  })
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []

  return (
    <li>
      <TreeNode
        label={`${course.name} · Class ${course.grade}`}
        count={counts.byCourse.get(course.id) ?? 0}
        icon={<BookOpen className="h-3.5 w-3.5" />}
        active={selection.kind === 'course' && selection.courseId === course.id}
        onSelect={() => onSelect({ kind: 'course', courseId: course.id })}
        hasChildren
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <ul className="space-y-0.5">
          {chapters.map((ch) => (
            <ChapterTreeRow
              key={ch.id}
              courseId={course.id}
              chapter={ch}
              counts={counts}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
          {chaptersQuery.isLoading && (
            <li className="px-9 py-1 text-xs text-muted-foreground">Loading…</li>
          )}
          {!chaptersQuery.isLoading && chapters.length === 0 && (
            <li className="px-9 py-1 text-xs text-muted-foreground">No chapters</li>
          )}
        </ul>
      )}
    </li>
  )
}

function ChapterTreeRow({
  courseId,
  chapter,
  counts,
  selection,
  onSelect,
}: {
  courseId: string
  chapter: ChapterNode
  counts: Counts
  selection: Selection
  onSelect: (s: Selection) => void
}) {
  const chapterIsInPath =
    (selection.kind === 'chapter' || selection.kind === 'topic') &&
    selection.chapterId === chapter.id
  const [expanded, setExpanded] = React.useState(chapterIsInPath)
  React.useEffect(() => {
    if (chapterIsInPath) setExpanded(true)
  }, [chapterIsInPath])

  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', chapter.id],
    queryFn: () =>
      apiGet<{ items: TopicNode[] }>(`/api/taxonomy/topics?chapter_id=${chapter.id}`),
    enabled: expanded,
  })
  const topics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []

  return (
    <li>
      <TreeNode
        label={chapter.name}
        count={counts.byChapter.get(chapter.id) ?? 0}
        icon={<Layers className="h-3.5 w-3.5" />}
        active={selection.kind === 'chapter' && selection.chapterId === chapter.id}
        onSelect={() => onSelect({ kind: 'chapter', courseId, chapterId: chapter.id })}
        level={1}
        hasChildren
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <ul className="space-y-0.5">
          {topics.map((t) => (
            <TreeNode
              key={t.id}
              label={t.name}
              count={counts.byTopic.get(t.id) ?? 0}
              icon={<ListTree className="h-3.5 w-3.5" />}
              active={selection.kind === 'topic' && selection.topicId === t.id}
              onSelect={() =>
                onSelect({
                  kind: 'topic',
                  courseId,
                  chapterId: chapter.id,
                  topicId: t.id,
                })
              }
              level={2}
            />
          ))}
          {topicsQuery.isLoading && (
            <li className="px-12 py-1 text-xs text-muted-foreground">Loading…</li>
          )}
          {!topicsQuery.isLoading && topics.length === 0 && (
            <li className="px-12 py-1 text-xs text-muted-foreground">No topics</li>
          )}
        </ul>
      )}
    </li>
  )
}

function GroupedView({
  items,
  onSelect,
  selectedIds,
  onToggleSelected,
}: {
  items: QuestionWithTaxonomy[]
  onSelect: (s: Selection) => void
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}) {
  const tree = React.useMemo(() => buildTree(items), [items])
  return (
    <div className="space-y-4">
      {tree.map((courseGroup) => (
        <details
          key={courseGroup.id}
          open
          className="overflow-hidden rounded-md border bg-card"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 bg-muted/40 px-4 py-2 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              {courseGroup.name}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {courseGroup.count} question{courseGroup.count === 1 ? '' : 's'}
            </span>
          </summary>
          <div className="space-y-3 p-4">
            {courseGroup.chapters.map((chapterGroup) => (
              <details key={chapterGroup.id} open className="rounded-md border bg-background">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    {chapterGroup.name}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {chapterGroup.count}
                  </span>
                </summary>
                <div className="space-y-3 border-t bg-muted/20 p-3">
                  {chapterGroup.topics.map((topicGroup) => {
                    const topicId = topicGroup.id !== '_unassigned' ? topicGroup.id : null
                    return (
                      <div key={topicGroup.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <ListTree className="h-3 w-3" />
                            {topicGroup.name}
                            <span className="text-[10px] font-normal normal-case">
                              · {topicGroup.questions.length}
                            </span>
                          </h4>
                          {topicId && courseGroup.id !== '_unassigned' && chapterGroup.id !== '_unassigned' && (
                            <button
                              type="button"
                              onClick={() =>
                                onSelect({
                                  kind: 'topic',
                                  courseId: courseGroup.id,
                                  chapterId: chapterGroup.id,
                                  topicId,
                                })
                              }
                              className="text-[11px] text-primary hover:underline"
                            >
                              Open in focus view →
                            </button>
                          )}
                        </div>
                        <div className="grid gap-3">
                          {topicGroup.questions.map((q) => (
                            <QuestionCard
                              key={q.id}
                              q={q}
                              selected={selectedIds.has(q.id)}
                              onToggleSelected={() => onToggleSelected(q.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

type CourseGroup = {
  id: string
  name: string
  count: number
  chapters: ChapterGroup[]
}
type ChapterGroup = {
  id: string
  name: string
  count: number
  topics: TopicGroup[]
}
type TopicGroup = {
  id: string
  name: string
  questions: QuestionWithTaxonomy[]
}
type Counts = {
  byCourse: Map<string, number>
  byChapter: Map<string, number>
  byTopic: Map<string, number>
}

function buildCounts(items: QuestionWithTaxonomy[]): Counts {
  // Counts roll up every tag on every question, so a question tagged in
  // two courses contributes to both — matches the filter logic above.
  const byCourse = new Map<string, number>()
  const byChapter = new Map<string, number>()
  const byTopic = new Map<string, number>()
  for (const q of items) {
    const seenCourse = new Set<string>()
    const seenChapter = new Set<string>()
    const seenTopic = new Set<string>()
    for (const t of q.taxonomies ?? []) {
      if (t.course_id && !seenCourse.has(t.course_id)) {
        seenCourse.add(t.course_id)
        byCourse.set(t.course_id, (byCourse.get(t.course_id) ?? 0) + 1)
      }
      if (t.chapter_id && !seenChapter.has(t.chapter_id)) {
        seenChapter.add(t.chapter_id)
        byChapter.set(t.chapter_id, (byChapter.get(t.chapter_id) ?? 0) + 1)
      }
      if (t.topic_id && !seenTopic.has(t.topic_id)) {
        seenTopic.add(t.topic_id)
        byTopic.set(t.topic_id, (byTopic.get(t.topic_id) ?? 0) + 1)
      }
    }
  }
  return { byCourse, byChapter, byTopic }
}

function buildTree(items: QuestionWithTaxonomy[]): CourseGroup[] {
  // Group each question by its FIRST tag only. Multi-tag cross-product
  // grouping would duplicate cards in the expanded view; we already do
  // tag-OR filtering at the selection level, so the primary-tag view here
  // gives a single deterministic home for each card.
  const courseMap = new Map<string, CourseGroup>()
  for (const q of items) {
    const tag = primaryTag(q)
    const courseId = tag?.course_id ?? '_unassigned'
    const courseName = tag?.course_name ?? 'Unassigned'
    const chapterId = tag?.chapter_id ?? '_unassigned'
    const chapterName = tag?.chapter_name ?? 'Unassigned'
    const topicId = tag?.topic_id ?? '_unassigned'
    const topicName = tag?.topic_name ?? 'Unassigned'

    let course = courseMap.get(courseId)
    if (!course) {
      course = { id: courseId, name: courseName, count: 0, chapters: [] }
      courseMap.set(courseId, course)
    }
    course.count += 1

    let chapter = course.chapters.find((c) => c.id === chapterId)
    if (!chapter) {
      chapter = { id: chapterId, name: chapterName, count: 0, topics: [] }
      course.chapters.push(chapter)
    }
    chapter.count += 1

    let topic = chapter.topics.find((t) => t.id === topicId)
    if (!topic) {
      topic = { id: topicId, name: topicName, questions: [] }
      chapter.topics.push(topic)
    }
    topic.questions.push(q)
  }
  const arr = Array.from(courseMap.values())
  arr.sort((a, b) => a.name.localeCompare(b.name))
  return arr
}
