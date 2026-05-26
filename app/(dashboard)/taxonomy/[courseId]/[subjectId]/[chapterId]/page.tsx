'use client'

import * as React from 'react'
import { useParams, notFound } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  ListTree,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TaxonomyBreadcrumb } from '@/components/taxonomy/breadcrumb'
import { TopicModal, type TopicSubmitValues } from '@/components/taxonomy/topic-modal'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/ui/api'
import type { Subject } from '@/types/taxonomy'
import type { Stream } from '@/components/taxonomy/course-modal'

type CourseRow = {
  id: string
  name: string
  grade: number
  stream: Stream | null
  description: string | null
}

type ChapterRow = {
  id: string
  subject_id: string
  name: string
  chapter_no: number | null
}

type TopicRow = {
  id: string
  chapter_id: string
  name: string
  topic_no: number | null
}

export default function ChapterDetailPage() {
  const params = useParams<{
    courseId: string
    subjectId: string
    chapterId: string
  }>()
  const qc = useQueryClient()

  const [open, setOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseRow[] }>('/api/taxonomy/courses'),
  })

  const subjectsQuery = useQuery({
    queryKey: ['taxonomy', 'subjects', params.courseId],
    queryFn: () =>
      apiGet<{ items: Subject[] }>(
        `/api/taxonomy/subjects?course_id=${params.courseId}`,
      ),
    enabled: Boolean(params.courseId),
  })

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', 'by-subject', params.subjectId],
    queryFn: () =>
      apiGet<{ items: ChapterRow[] }>(
        `/api/taxonomy/chapters?subject_id=${params.subjectId}`,
      ),
    enabled: Boolean(params.subjectId),
  })

  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', params.chapterId],
    queryFn: () =>
      apiGet<{ items: TopicRow[] }>(
        `/api/taxonomy/topics?chapter_id=${params.chapterId}`,
      ),
    enabled: Boolean(params.chapterId),
  })

  const course = coursesQuery.data?.ok
    ? coursesQuery.data.data.items.find((c) => c.id === params.courseId)
    : undefined
  const subject = subjectsQuery.data?.ok
    ? subjectsQuery.data.data.items.find((s) => s.id === params.subjectId)
    : undefined
  const chapter = chaptersQuery.data?.ok
    ? chaptersQuery.data.data.items.find((c) => c.id === params.chapterId)
    : undefined

  if (coursesQuery.isFetched && !course) notFound()
  if (subjectsQuery.isFetched && !subject) notFound()
  if (chaptersQuery.isFetched && !chapter) notFound()

  const remoteTopics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []

  const [topics, setTopics] = React.useState<TopicRow[]>([])
  React.useEffect(() => {
    setTopics(remoteTopics)
  }, [topicsQuery.dataUpdatedAt])

  const editing = topics.find((t) => t.id === editingId)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['taxonomy', 'topics', params.chapterId] })

  const createMutation = useMutation({
    mutationFn: (values: TopicSubmitValues) =>
      apiPost<TopicRow>('/api/taxonomy/topics', {
        chapter_id: params.chapterId,
        ...values,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMsg(null)
        refresh()
      } else {
        setErrorMsg(result.error.message)
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<TopicSubmitValues> }) =>
      apiPut<TopicRow>(`/api/taxonomy/topics/${id}`, values),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMsg(null)
        refresh()
      } else {
        setErrorMsg(result.error.message)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/taxonomy/topics/${id}`),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMsg(null)
        refresh()
      } else {
        setErrorMsg(result.error.message)
      }
    },
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = topics.findIndex((t) => t.id === active.id)
    const newIndex = topics.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(topics, oldIndex, newIndex).map((t, i) => ({
      ...t,
      topic_no: i + 1,
    }))
    setTopics(reordered)
    reordered.forEach((t) => {
      updateMutation.mutate({ id: t.id, values: { topic_no: t.topic_no ?? undefined } })
    })
  }

  const openCreate = () => {
    setEditingId(null)
    setOpen(true)
  }
  const openEdit = (id: string) => {
    setEditingId(id)
    setOpen(true)
  }
  const handleSubmit = (values: TopicSubmitValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, values })
    } else {
      createMutation.mutate({
        ...values,
        topic_no: values.topic_no ?? topics.length + 1,
      })
    }
    setEditingId(null)
    setOpen(false)
  }

  if (!course || !subject || !chapter) {
    return <p className="text-sm text-muted-foreground">Loading chapter…</p>
  }

  return (
    <div className="space-y-6">
      <TaxonomyBreadcrumb
        items={[
          { label: 'Taxonomy', href: '/taxonomy' },
          { label: course.name, href: `/taxonomy/${course.id}` },
          { label: subject.name, href: `/taxonomy/${course.id}/${subject.id}` },
          { label: chapter.name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{chapter.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted">{subject.name}</Badge>
            {chapter.chapter_no != null ? (
              <Badge variant="outline">Chapter {chapter.chapter_no}</Badge>
            ) : null}
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Topic
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {errorMsg}
        </div>
      )}

      {topicsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading topics…</p>
      ) : topics.length === 0 ? (
        <EmptyTopics onAdd={openCreate} />
      ) : (
        <div className="rounded-lg border bg-card">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={topics.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y">
                {topics.map((topic) => (
                  <SortableTopicRow
                    key={topic.id}
                    topic={topic}
                    onEdit={() => openEdit(topic.id)}
                    onDelete={() => deleteMutation.mutate(topic.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <TopicModal
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setEditingId(null)
        }}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

function SortableTopicRow({
  topic,
  onEdit,
  onDelete,
}: {
  topic: TopicRow
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">
        {topic.topic_no ?? '—'}
      </span>
      <span className="flex-1 truncate text-sm font-medium">{topic.name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Topic actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function EmptyTopics({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <ListTree className="mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-medium">No topics yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add the first topic for this chapter.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add Topic
      </Button>
    </div>
  )
}
