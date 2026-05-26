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

// Subject sits between Course and Chapter in the 4-tier taxonomy. Free-text
// name (institutes may use canonical 'Physics' / 'Chemistry' / 'Maths' /
// 'Biology' or custom strings like 'Computer Science'). Length-bounded to
// keep chip labels readable.
const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Subject name is required').max(80),
})

type SubjectFormValues = z.infer<typeof subjectSchema>

export type SubjectSubmitValues = {
  name: string
}

export type SubjectInitial = {
  id?: string
  name?: string
}

export type SubjectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: SubjectInitial
  onSubmit: (values: SubjectSubmitValues) => void
}

function toFormValues(initial?: SubjectInitial): SubjectFormValues {
  return { name: initial?.name ?? '' }
}

export function SubjectModal({ open, onOpenChange, initial, onSubmit }: SubjectModalProps) {
  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: toFormValues(initial),
  })

  React.useEffect(() => {
    if (open) form.reset(toFormValues(initial))
  }, [open, initial, form])

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({ name: values.name.trim() })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Edit Subject' : 'Add Subject'}
      description="Subjects live under a Course. Chapters live under a Subject."
      onSubmit={handleSubmit}
      submitLabel={initial?.id ? 'Save changes' : 'Create subject'}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Maths, Physics, Computer Science" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </FormDialog>
  )
}
