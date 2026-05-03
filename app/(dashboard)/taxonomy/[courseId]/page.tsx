'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, notFound } from 'next/navigation'
import { Plus, MoreVertical, Pencil, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TaxonomyBreadcrumb } from '@/components/taxonomy/breadcrumb'
import {
  ChapterModal,
  type ChapterSubmitValues,
} from '@/components/taxonomy/chapter-modal'
import {
  MOCK_CHAPTERS,
  MOCK_COURSES,
  type ChapterUI,
} from '@/lib/ui/mocks/taxonomy'

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>()
  const course = MOCK_COURSES.find((c) => c.id === params.courseId)
  if (!course) notFound()

  const initial = React.useMemo(
    () => MOCK_CHAPTERS.filter((ch) => ch.course_id === params.courseId),
    [params.courseId],
  )

  const [chapters, setChapters] = React.useState<ChapterUI[]>(initial)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const editing = chapters.find((c) => c.id === editingId)

  const openCreate = () => {
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setOpen(true)
  }

  const handleSubmit = (values: ChapterSubmitValues) => {
    if (editingId) {
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === editingId
            ? {
                ...ch,
                name: values.name,
                subject: values.subject,
                chapter_no: values.chapter_no,
              }
            : ch,
        ),
      )
    } else {
      const next: ChapterUI = {
        id: `ch-${Date.now()}`,
        course_id: course!.id,
        name: values.name,
        subject: values.subject,
        chapter_no: values.chapter_no,
        topic_count: 0,
      }
      setChapters((prev) => [...prev, next])
    }
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    setChapters((prev) => prev.filter((ch) => ch.id !== id))
  }

  return (
    <div className="space-y-6">
      <TaxonomyBreadcrumb
        items={[
          { label: 'Taxonomy', href: '/taxonomy' },
          { label: course!.name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{course!.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">Class {course!.grade}</Badge>
            {course!.stream ? <Badge variant="outline">{course!.stream}</Badge> : null}
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Chapter
        </Button>
      </div>

      {chapters.length === 0 ? (
        <EmptyChapters onAdd={openCreate} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {chapters.map((chapter) => (
            <li
              key={chapter.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30"
            >
              <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">
                {chapter.chapter_no ?? '—'}
              </span>
              <Link
                href={`/taxonomy/${course!.id}/${chapter.id}`}
                className="flex-1 truncate text-sm font-medium hover:underline"
              >
                {chapter.name}
              </Link>
              <Badge variant="muted">{chapter.subject}</Badge>
              <span className="text-xs text-muted-foreground">
                {chapter.topic_count}{' '}
                {chapter.topic_count === 1 ? 'topic' : 'topics'}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Chapter actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openEdit(chapter.id)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => handleDelete(chapter.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ChapterModal
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

function EmptyChapters({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <Layers className="mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-medium">No chapters yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add the first chapter for this course.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add Chapter
      </Button>
    </div>
  )
}
