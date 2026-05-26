'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormDialog } from './form-dialog'
// Stream is a small fixed enum local to the course-creation flow. Lives
// inline here (used to be in the mock module which is being deleted as
// part of the live-fetch migration).
export type Stream = 'JEE' | 'NEET' | 'School' | 'Board'
export const STREAMS: Stream[] = ['JEE', 'NEET', 'School', 'Board']

export type CourseUI = {
  id: string
  name: string
  grade: number
  stream: Stream | null
  description: string | null
}

const courseSchema = z.object({
  name: z.string().min(1, 'Course name is required').max(120),
  grade: z.string().min(1, 'Pick a grade'),
  stream: z.string(),
  description: z.string().max(500),
})

type CourseFormValues = z.infer<typeof courseSchema>

export type CourseSubmitValues = {
  name: string
  grade: number
  stream: Stream | null
  description: string | null
}

export type CourseModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<CourseUI>
  onSubmit: (values: CourseSubmitValues) => void
}

function toFormValues(initial?: Partial<CourseUI>): CourseFormValues {
  return {
    name: initial?.name ?? '',
    grade: initial?.grade != null ? String(initial.grade) : '11',
    stream: initial?.stream ?? '',
    description: initial?.description ?? '',
  }
}

export function CourseModal({ open, onOpenChange, initial, onSubmit }: CourseModalProps) {
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: toFormValues(initial),
  })

  React.useEffect(() => {
    if (open) form.reset(toFormValues(initial))
  }, [open, initial, form])

  const handleSubmit = form.handleSubmit((values) => {
    const stream =
      values.stream === '' ? null : (values.stream as Stream)
    const description = values.description.trim() ? values.description : null
    onSubmit({
      name: values.name,
      grade: parseInt(values.grade, 10),
      stream,
      description,
    })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Edit Course' : 'Add Course'}
      description="Courses are the top of the taxonomy tree. Chapters and topics live under a course."
      onSubmit={handleSubmit}
      submitLabel={initial?.id ? 'Save changes' : 'Create course'}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Course name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Class 11 — PCM" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="grade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Grade</FormLabel>
                <FormControl>
                  <Select {...field}>
                    {Array.from({ length: 8 }, (_, i) => i + 5).map((g) => (
                      <option key={g} value={String(g)}>
                        Class {g}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stream"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stream</FormLabel>
                <FormControl>
                  <Select {...field}>
                    <option value="">— None —</option>
                    {STREAMS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Optional summary of the course"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormDialog>
  )
}
