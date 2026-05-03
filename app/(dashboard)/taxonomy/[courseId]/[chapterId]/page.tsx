'use client'

import * as React from 'react'
import { useParams, notFound } from 'next/navigation'
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
import {
  MOCK_CHAPTERS,
  MOCK_COURSES,
  MOCK_TOPICS,
  type TopicUI,
} from '@/lib/ui/mocks/taxonomy'

export default function ChapterDetailPage() {
  const params = useParams<{ courseId: string; chapterId: string }>()
  const course = MOCK_COURSES.find((c) => c.id === params.courseId)
  const chapter = MOCK_CHAPTERS.find(
    (ch) => ch.id === params.chapterId && ch.course_id === params.courseId,
  )
  if (!course || !chapter) notFound()

  const initial = React.useMemo(
    () =>
      MOCK_TOPICS.filter((t) => t.chapter_id === params.chapterId).sort(
        (a, b) => (a.topic_no ?? 0) - (b.topic_no ?? 0),
      ),
    [params.chapterId],
  )

  const [topics, setTopics] = React.useState<TopicUI[]>(initial)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const editing = topics.find((t) => t.id === editingId)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTopics((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id)
      const newIndex = prev.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex).map((t, i) => ({
        ...t,
        topic_no: i + 1,
      }))
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
      setTopics((prev) =>
        prev.map((t) =>
          t.id === editingId
            ? { ...t, name: values.name, topic_no: values.topic_no }
            : t,
        ),
      )
    } else {
      const next: TopicUI = {
        id: `t-${Date.now()}`,
        chapter_id: chapter!.id,
        name: values.name,
        topic_no: values.topic_no ?? topics.length + 1,
      }
      setTopics((prev) => [...prev, next])
    }
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    setTopics((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="space-y-6">
      <TaxonomyBreadcrumb
        items={[
          { label: 'Taxonomy', href: '/taxonomy' },
          { label: course!.name, href: `/taxonomy/${course!.id}` },
          { label: chapter!.name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{chapter!.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted">{chapter!.subject}</Badge>
            {chapter!.chapter_no != null ? (
              <Badge variant="outline">Chapter {chapter!.chapter_no}</Badge>
            ) : null}
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Topic
        </Button>
      </div>

      {topics.length === 0 ? (
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
                    onDelete={() => handleDelete(topic.id)}
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
  topic: TopicUI
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
