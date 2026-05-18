'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, BookOpen, AlertCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CourseModal,
  type CourseSubmitValues,
} from '@/components/taxonomy/course-modal'
import { apiGet, apiPost } from '@/lib/ui/api'
import type { Stream } from '@/lib/ui/mocks/taxonomy'

type CourseRow = {
  id: string
  name: string
  grade: number
  stream: Stream | null
  description: string | null
}

export default function TaxonomyHomePage() {
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseRow[] }>('/api/taxonomy/courses'),
  })

  const courses = data?.ok ? data.data.items : []

  const createMutation = useMutation({
    mutationFn: (values: CourseSubmitValues) =>
      apiPost<CourseRow>('/api/taxonomy/courses', values),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMsg(null)
        qc.invalidateQueries({ queryKey: ['taxonomy', 'courses'] })
      } else {
        setErrorMsg(result.error.message)
      }
    },
    onError: (e: unknown) => {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to create course')
    },
  })

  const handleCreate = (values: CourseSubmitValues) => {
    createMutation.mutate(values)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Taxonomy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up Courses, Chapters, and Topics. Question tagging depends on this tree.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Course
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {errorMsg}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading courses…</p>
      ) : courses.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link key={course.id} href={`/taxonomy/${course.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">Class {course.grade}</Badge>
                    {course.stream ? (
                      <Badge variant="outline">{course.stream}</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-lg">{course.name}</CardTitle>
                  {course.description ? (
                    <CardDescription className="line-clamp-2">
                      {course.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Open to manage chapters
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CourseModal open={open} onOpenChange={setOpen} onSubmit={handleCreate} />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
      <BookOpen className="mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-medium">No courses yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first course to start building the taxonomy.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add Course
      </Button>
    </div>
  )
}
