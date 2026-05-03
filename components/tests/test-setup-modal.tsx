'use client'

import * as React from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  testSetupSchema,
  testSetupDefaults,
  type TestSetupValues,
} from '@/lib/validation/test'
import { EXAM_TYPES } from '@/lib/validation/question'
import { MOCK_COURSES, SUBJECTS } from '@/lib/ui/mocks/taxonomy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface TestSetupModalProps {
  defaultValues?: Partial<TestSetupValues>
  onSubmit: (values: TestSetupValues) => Promise<void> | void
  submitLabel?: string
  busy?: boolean
}

export function TestSetupModal({
  defaultValues,
  onSubmit,
  submitLabel,
  busy,
}: TestSetupModalProps) {
  const methods = useForm<TestSetupValues>({
    resolver: zodResolver(testSetupSchema) as unknown as Resolver<TestSetupValues>,
    defaultValues: {
      ...testSetupDefaults,
      ...defaultValues,
    } as TestSetupValues,
    mode: 'onBlur',
  })
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = methods

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 rounded-md border bg-card p-5"
      aria-label="Test setup"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. JEE Foundation — Kinematics Drill #1"
          {...register('title')}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="course_id">Course</Label>
          <Select id="course_id" {...register('course_id')}>
            <option value="">Select course…</option>
            {MOCK_COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {errors.course_id && (
            <p className="text-sm text-destructive">{errors.course_id.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="exam_type">Exam type</Label>
          <Select id="exam_type" {...register('exam_type')}>
            {EXAM_TYPES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Subjects</Label>
        <Controller
          control={control}
          name="subjects"
          render={({ field }) => {
            const selected = (field.value ?? []) as string[]
            const toggle = (s: string) => {
              if (selected.includes(s)) {
                field.onChange(selected.filter((v) => v !== s))
              } else {
                field.onChange([...selected, s])
              }
            }
            return (
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => {
                  const active = selected.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggle(s)}
                      className="focus-visible:outline-none"
                    >
                      <Badge
                        variant={active ? 'default' : 'outline'}
                        className={cn('cursor-pointer', !active && 'hover:bg-accent')}
                      >
                        {s}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )
          }}
        />
        {errors.subjects && (
          <p className="text-sm text-destructive">
            {errors.subjects.message as string}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="duration_minutes">Duration (minutes)</Label>
          <Input
            id="duration_minutes"
            type="number"
            min={5}
            max={600}
            {...register('duration_minutes', { valueAsNumber: true })}
          />
          {errors.duration_minutes && (
            <p className="text-sm text-destructive">
              {errors.duration_minutes.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions (optional)</Label>
        <Textarea
          id="instructions"
          rows={4}
          placeholder="Shown above the question paper, e.g. marking scheme, allowed calculators."
          {...register('instructions')}
        />
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button type="submit" disabled={isSubmitting || busy}>
          {submitLabel ?? (isSubmitting || busy ? 'Creating…' : 'Create test')}
        </Button>
      </div>
    </form>
  )
}
