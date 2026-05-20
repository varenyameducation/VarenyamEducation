'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionCard } from '@/components/questions/question-card'
import { apiGet, type Paginated, type Question } from '@/lib/ui/api'
import { cn } from '@/lib/utils'

type CourseNode = { id: string; name: string; grade: number }
type ChapterNode = { id: string; name: string; course_id: string; subject: string }
type TopicNode = { id: string; name: string; chapter_id: string }

type QuestionWithTaxonomy = Question & {
  course?: { id: string; name: string } | null
  chapter?: { id: string; name: string } | null
  topic?: { id: string; name: string } | null
}

type Selection =
  | { kind: 'all' }
  | { kind: 'course'; courseId: string }
  | { kind: 'chapter'; courseId: string; chapterId: string }
  | { kind: 'topic'; courseId: string; chapterId: string; topicId: string }

const QUESTION_FETCH_LIMIT = 200

export default function QuestionsListPage() {
  const sp = useSearchParams()
  const initialSelection = readSelectionFromUrl(sp)
  const [selection, setSelection] = React.useState<Selection>(initialSelection)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseNode[] }>('/api/taxonomy/courses'),
  })
  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []

  const questionsQs = React.useMemo(() => {
    const next = new URLSearchParams()
    if (selection.kind === 'course') next.set('course_id', selection.courseId)
    if (selection.kind === 'chapter') {
      next.set('course_id', selection.courseId)
      next.set('chapter_id', selection.chapterId)
    }
    if (selection.kind === 'topic') {
      next.set('course_id', selection.courseId)
      next.set('chapter_id', selection.chapterId)
      next.set('topic_id', selection.topicId)
    }
    next.set('limit', String(QUESTION_FETCH_LIMIT))
    return next.toString()
  }, [selection])

  const questionsQuery = useQuery({
    queryKey: ['questions', 'list', questionsQs],
    queryFn: () => apiGet<Paginated<QuestionWithTaxonomy>>(`/api/questions?${questionsQs}`),
  })
  const items = questionsQuery.data?.ok ? questionsQuery.data.data.items : []
  const total = questionsQuery.data?.ok ? questionsQuery.data.data.total : 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            Browse questions by Course → Chapter → Topic, or add new ones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/questions/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Question
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/questions/import">
              <Upload className="mr-1.5 h-4 w-4" />
              Bulk Upload
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-md border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <FolderTree className="h-3.5 w-3.5" />
              Taxonomy
            </div>
            <div className="p-2">
              <TreeNode
                label="All courses"
                icon={<ListTree className="h-3.5 w-3.5" />}
                active={selection.kind === 'all'}
                onSelect={() => setSelection({ kind: 'all' })}
              />
              {coursesQuery.isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
              ) : courses.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No courses yet. Create one under{' '}
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
                      selection={selection}
                      onSelect={setSelection}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <SelectionBreadcrumb
            selection={selection}
            courses={courses}
            onSelect={setSelection}
            total={total}
          />

          {questionsQuery.data && !questionsQuery.data.ok && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {questionsQuery.data.error.message}
            </div>
          )}

          {questionsQuery.isLoading ? (
            <div className="rounded-md border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
              Loading questions…
            </div>
          ) : items.length === 0 ? (
            <EmptyState selection={selection} />
          ) : selection.kind === 'all' ? (
            <GroupedView items={items} />
          ) : (
            <FlatList items={items} />
          )}
        </section>
      </div>
    </div>
  )
}

function readSelectionFromUrl(sp: URLSearchParams | null): Selection {
  if (!sp) return { kind: 'all' }
  const c = sp.get('course')
  const ch = sp.get('chapter')
  const t = sp.get('topic')
  if (c && ch && t) return { kind: 'topic', courseId: c, chapterId: ch, topicId: t }
  if (c && ch) return { kind: 'chapter', courseId: c, chapterId: ch }
  if (c) return { kind: 'course', courseId: c }
  return { kind: 'all' }
}

function TreeNode({
  label,
  icon,
  active,
  onSelect,
  level = 0,
  hasChildren,
  expanded,
  onToggle,
}: {
  label: string
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
      </button>
    </div>
  )
}

function CourseTreeRow({
  course,
  selection,
  onSelect,
}: {
  course: CourseNode
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
  selection,
  onSelect,
}: {
  courseId: string
  chapter: ChapterNode
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

function SelectionBreadcrumb({
  selection,
  courses,
  onSelect,
  total,
}: {
  selection: Selection
  courses: CourseNode[]
  onSelect: (s: Selection) => void
  total: number
}) {
  const course =
    selection.kind !== 'all' ? courses.find((c) => c.id === selection.courseId) : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelect({ kind: 'all' })}
          className="font-medium text-foreground hover:underline"
        >
          All courses
        </button>
        {course && (
          <>
            <span className="text-muted-foreground">/</span>
            <button
              type="button"
              onClick={() => onSelect({ kind: 'course', courseId: course.id })}
              className="hover:underline"
            >
              {course.name}
            </button>
          </>
        )}
        {selection.kind === 'chapter' || selection.kind === 'topic' ? (
          <ChapterCrumb selection={selection} onSelect={onSelect} />
        ) : null}
        {selection.kind === 'topic' && (
          <TopicCrumb selection={selection} />
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {total} question{total === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function ChapterCrumb({
  selection,
  onSelect,
}: {
  selection: Selection & ({ kind: 'chapter' } | { kind: 'topic' })
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
        className="hover:underline"
      >
        {chapter.name}
      </button>
    </>
  )
}

function TopicCrumb({
  selection,
}: {
  selection: Extract<Selection, { kind: 'topic' }>
}) {
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
      <span>{topic.name}</span>
    </>
  )
}

function GroupedView({ items }: { items: QuestionWithTaxonomy[] }) {
  // Group by course → chapter → topic. Questions with missing taxonomy
  // are bucketed under "Unassigned".
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
                  {chapterGroup.topics.map((topicGroup) => (
                    <div key={topicGroup.id} className="space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ListTree className="h-3 w-3" />
                        {topicGroup.name}
                        <span className="text-[10px] font-normal normal-case">
                          · {topicGroup.questions.length}
                        </span>
                      </h4>
                      <div className="grid gap-3">
                        {topicGroup.questions.map((q) => (
                          <QuestionCard key={q.id} q={q} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function FlatList({ items }: { items: QuestionWithTaxonomy[] }) {
  return (
    <div className="grid gap-3">
      {items.map((q) => (
        <QuestionCard key={q.id} q={q} />
      ))}
    </div>
  )
}

function EmptyState({ selection }: { selection: Selection }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 p-10 text-center">
      <p className="text-base font-medium">No questions here yet.</p>
      <p className="text-sm text-muted-foreground">
        {selection.kind === 'all'
          ? 'Add a question manually or bulk-upload from Word/PDF/Excel.'
          : 'No questions match this part of the taxonomy. Add one or import.'}
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/questions/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Add question
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/questions/import">
            <Upload className="mr-1.5 h-4 w-4" />
            Bulk upload
          </Link>
        </Button>
      </div>
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

function buildTree(items: QuestionWithTaxonomy[]): CourseGroup[] {
  const courseMap = new Map<string, CourseGroup>()
  for (const q of items) {
    const courseId = q.course?.id ?? '_unassigned'
    const courseName = q.course?.name ?? 'Unassigned course'
    const chapterId = q.chapter?.id ?? '_unassigned'
    const chapterName = q.chapter?.name ?? 'Unassigned chapter'
    const topicId = q.topic?.id ?? '_unassigned'
    const topicName = q.topic?.name ?? 'Unassigned topic'

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
