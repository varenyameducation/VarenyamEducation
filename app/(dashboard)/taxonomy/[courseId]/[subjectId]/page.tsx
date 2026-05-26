'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, notFound } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Layers,
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
import {
  ChapterModal,
  type ChapterSubmitValues,
} from '@/components/taxonomy/chapter-modal'
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

export default function SubjectDetailPage() {
  const params = useParams<{ courseId: string; subjectId: string }>()
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

  const course = coursesQuery.data?.ok
    ? coursesQuery.data.data.items.find((c) => c.id === params.courseId)
    : undefined
  const subject = subjectsQuery.data?.ok
    ? subjectsQuery.data.data.items.find((s) => s.id === params.subjectId)
    : undefined

  if (coursesQuery.isFetched && !course) notFound()
  if (subjectsQuery.isFetched && !subject) notFound()

  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []
  const editing = chapters.find((c) => c.id === editingId)

  const refresh = () =>
    qc.invalidateQueries({
      queryKey: ['taxonomy', 'chapters', 'by-subject', params.subjectId],
    })

  const createMutation = useMutation({
    mutationFn: (values: ChapterSubmitValues) =>
      apiPost<ChapterRow>('/api/taxonomy/chapters', {
        subject_id: params.subjectId,
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
    mutationFn: ({ id, values }: { id: string; values: ChapterSubmitValues }) =>
      apiPut<ChapterRow>(`/api/taxonomy/chapters/${id}`, values),
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
    mutationFn: (id: string) => apiDelete(`/api/taxonomy/chapters/${id}`),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMsg(null)
        refresh()
      } else {
        setErrorMsg(result.error.message)
      }
    },
  })

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
      updateMutation.mutate({ id: editingId, values })
    } else {
      createMutation.mutate(values)
    }
    setEditingId(null)
    setOpen(false)
  }
  const handleDelete = (id: string, name: string) => {
    if (
      window.confirm(
        `Delete chapter "${name}"? This soft-deletes the chapter and all its topics.`,
      )
    ) {
      deleteMutation.mutate(id)
    }
  }

  if (!course || !subject) {
    return <p className="text-sm text-muted-foreground">Loading subject…</p>
  }

  return (
    <div className="space-y-6">
      <TaxonomyBreadcrumb
        items={[
          { label: 'Taxonomy', href: '/taxonomy' },
          { label: course.name, href: `/taxonomy/${course.id}` },
          { label: subject.name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{subject.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted">{course.name}</Badge>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Chapter
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {errorMsg}
        </div>
      )}

      {chaptersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading chapters…</p>
      ) : chapters.length === 0 ? (
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
                href={`/taxonomy/${course.id}/${subject.id}/${chapter.id}`}
                className="flex-1 truncate text-sm font-medium hover:underline"
              >
                {chapter.name}
              </Link>
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
                    onSelect={() => handleDelete(chapter.id, chapter.name)}
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
        initial={
          editing
            ? { id: editing.id, name: editing.name, chapter_no: editing.chapter_no }
            : undefined
        }
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
        Add the first chapter for this subject.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add Chapter
      </Button>
    </div>
  )
}
