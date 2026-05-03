'use client'

import * as React from 'react'
import Link from 'next/link'
import { Plus, BookOpen } from 'lucide-react'
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
import { MOCK_COURSES, type CourseUI } from '@/lib/ui/mocks/taxonomy'

export default function TaxonomyHomePage() {
  const [courses, setCourses] = React.useState<CourseUI[]>(MOCK_COURSES)
  const [open, setOpen] = React.useState(false)

  const handleCreate = (values: CourseSubmitValues) => {
    const next: CourseUI = {
      id: `c-${Date.now()}`,
      name: values.name,
      grade: values.grade,
      stream: values.stream,
      description: values.description,
      chapter_count: 0,
    }
    setCourses((prev) => [...prev, next])
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

      {courses.length === 0 ? (
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
                    {course.chapter_count}{' '}
                    {course.chapter_count === 1 ? 'chapter' : 'chapters'}
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
