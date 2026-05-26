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

// Wire-format echo of a topic row from /api/taxonomy/topics. Inlined here
// because the previous shared mock module (which carried this type) is
// being deleted in the live-fetch migration.
export type TopicUI = {
  id: string
  chapter_id: string
  name: string
  topic_no: number | null
}

const topicSchema = z.object({
  name: z.string().min(1, 'Topic name is required').max(120),
  topic_no: z
    .string()
    .refine((v) => v === '' || /^[1-9]\d{0,2}$/.test(v), {
      message: 'Must be a positive whole number (1–999)',
    }),
})

type TopicFormValues = z.infer<typeof topicSchema>

export type TopicSubmitValues = {
  name: string
  topic_no: number | null
}

export type TopicModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<TopicUI>
  onSubmit: (values: TopicSubmitValues) => void
}

function toFormValues(initial?: Partial<TopicUI>): TopicFormValues {
  return {
    name: initial?.name ?? '',
    topic_no: initial?.topic_no != null ? String(initial.topic_no) : '',
  }
}

export function TopicModal({ open, onOpenChange, initial, onSubmit }: TopicModalProps) {
  const form = useForm<TopicFormValues>({
    resolver: zodResolver(topicSchema),
    defaultValues: toFormValues(initial),
  })

  React.useEffect(() => {
    if (open) form.reset(toFormValues(initial))
  }, [open, initial, form])

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      name: values.name,
      topic_no: values.topic_no === '' ? null : parseInt(values.topic_no, 10),
    })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? 'Edit Topic' : 'Add Topic'}
      description="Topics are the leaves of the taxonomy. Questions are tagged to topics."
      onSubmit={handleSubmit}
      submitLabel={initial?.id ? 'Save changes' : 'Create topic'}
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Projectile motion" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="topic_no"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic number</FormLabel>
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
      </Form>
    </FormDialog>
  )
}
