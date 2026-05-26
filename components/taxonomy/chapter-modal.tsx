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
import { FormDialog } from './form-dialog'

const chapterSchema = z.object({
  name: z.string().min(1, 'Chapter name is required').max(200),
  chapter_no: z
    .string()
    .refine((v) => v === '' || /^[1-9]\d{0,2}$/.test(v), {
      message: 'Must be a positive whole number (1–999)',
    }),
})

type ChapterFormValues = z.infer<typeof chapterSchema>

export type ChapterSubmitValues = {
  name: string
  chapter_no: number | null
}

export type ChapterInitial = {
  id?: string
  name?: string
  chapter_no?: number | null
}

export type ChapterModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: ChapterInitial
  onSubmit: (values: ChapterSubmitValues) => void
}

function toFormValues(initial?: ChapterInitial): ChapterFormValues {
  return {
    name: initial?.name ?? '',
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
      chapter_no: values.chapter_no === '' ? null : parseInt(values.chapter_no, 10),
    })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Edit Chapter' : 'Add Chapter'}
      description="Chapters live under a subject. Topics live under a chapter."
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

        <FormField
          control={form.control}
          name="chapter_no"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chapter number</FormLabel>
              <FormControl>
                <Input type="number" min={1} placeholder="Optional" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormDialog>
  )
}
