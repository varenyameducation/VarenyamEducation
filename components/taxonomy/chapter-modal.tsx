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
import { FormDialog } from './form-dialog'
import { SUBJECTS, type ChapterUI, type Subject } from '@/lib/ui/mocks/taxonomy'

const chapterSchema = z.object({
  name: z.string().min(1, 'Chapter name is required').max(120),
  subject: z.string().min(1, 'Pick a subject'),
  chapter_no: z
    .string()
    .refine((v) => v === '' || /^[1-9]\d{0,2}$/.test(v), {
      message: 'Must be a positive whole number (1–999)',
    }),
})

type ChapterFormValues = z.infer<typeof chapterSchema>

export type ChapterSubmitValues = {
  name: string
  subject: Subject
  chapter_no: number | null
}

export type ChapterModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<ChapterUI>
  onSubmit: (values: ChapterSubmitValues) => void
}

function toFormValues(initial?: Partial<ChapterUI>): ChapterFormValues {
  return {
    name: initial?.name ?? '',
    subject: initial?.subject ?? 'Physics',
    chapter_no: initial?.chapter_no != null ? String(initial.chapter_no) : '',
  }
}

export function ChapterModal({ open, onOpenChange, initial, onSubmit }: ChapterModalProps) {
  const form = useForm<ChapterFormValues>({
    resolver: zodResolver(chapterSchema),
    defaultValues: toFormValues(initial),
  })

  React.useEffect(() => {
    if (open) form.reset(toFormValues(initial))
  }, [open, initial, form])

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      name: values.name,
      subject: values.subject as Subject,
      chapter_no: values.chapter_no === '' ? null : parseInt(values.chapter_no, 10),
    })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Edit Chapter' : 'Add Chapter'}
      description="Chapters belong to a course and group related topics."
      onSubmit={handleSubmit}
      submitLabel={initial?.id ? 'Save changes' : 'Create chapter'}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chapter name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Kinematics" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subject</FormLabel>
                <FormControl>
                  <Select {...field}>
                    {SUBJECTS.map((s) => (
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

          <FormField
            control={form.control}
            name="chapter_no"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chapter number</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Optional"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormDialog>
  )
}
