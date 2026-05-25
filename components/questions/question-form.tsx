'use client'

import * as React from 'react'
import {
  useForm,
  FormProvider,
  Controller,
  useWatch,
  type Resolver,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  questionFormSchema,
  questionFormDefaults,
  QUESTION_TYPES,
  DIFFICULTIES,
  type QuestionFormValues,
} from '@/lib/validation/question'
import type { TaxonomyTag } from '@/lib/ui/mocks/m2m'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LaTeXEditor } from '@/components/ui/latex-editor'
import { Textarea } from '@/components/ui/textarea'
import { QuestionTypeFields } from '@/components/questions/question-type-fields'
import { ImageUploader } from '@/components/questions/image-uploader'
import { TaxonomyTagPicker } from '@/components/questions/taxonomy-tag-picker'
import { cn } from '@/lib/utils'

export interface QuestionFormProps {
  mode: 'create' | 'edit'
  initialValues?: Partial<QuestionFormValues>
  onSubmit: (values: QuestionFormValues) => Promise<void> | void
  submitLabel?: string
}

export function QuestionForm({
  mode,
  initialValues,
  onSubmit,
  submitLabel,
}: QuestionFormProps) {
  const methods = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema) as unknown as Resolver<QuestionFormValues>,
    defaultValues: {
      ...questionFormDefaults,
      ...initialValues,
    } as QuestionFormValues,
    mode: 'onBlur',
  })

  const {
    handleSubmit,
    register,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = methods

  const taxonomies = useWatch({ control, name: 'taxonomies' }) as TaxonomyTag[] | undefined

  // Whenever the chip list changes, mirror the first tag into the legacy
  // singular fields so the existing POST /api/questions submit path keeps
  // working. Once BE m2m lands these fields go away.
  React.useEffect(() => {
    const list = taxonomies ?? []
    const first = list[0]
    setValue('course_id', first?.course_id ?? '', { shouldValidate: false })
    setValue(
      'chapter_id',
      (first?.chapter_id ?? '') as QuestionFormValues['chapter_id'],
      { shouldValidate: false },
    )
    setValue(
      'topic_id',
      (first?.topic_id ?? '') as QuestionFormValues['topic_id'],
      { shouldValidate: false },
    )
    if (first?.subject) setValue('subject', first.subject, { shouldValidate: false })
    if (first?.exam_type) setValue('exam_type', first.exam_type, { shouldValidate: false })
  }, [taxonomies, setValue])

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-8"
        noValidate
        aria-label={mode === 'create' ? 'Create question' : 'Edit question'}
      >
        {/* Question type selector */}
        <section className="space-y-2">
          <Label>Question Type</Label>
          <div className="flex flex-wrap gap-3">
            {QUESTION_TYPES.map((qt) => (
              <Controller
                key={qt.value}
                control={control}
                name="question_type"
                render={({ field }) => {
                  const selected = field.value === qt.value
                  return (
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                        selected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      <input
                        type="radio"
                        className="h-3.5 w-3.5"
                        checked={selected}
                        onChange={() => field.onChange(qt.value)}
                        value={qt.value}
                      />
                      {qt.label}
                    </label>
                  )
                }}
              />
            ))}
          </div>
          {errors.question_type && (
            <p className="text-sm text-destructive">{errors.question_type.message}</p>
          )}
        </section>

        {/* Taxonomy chips */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="taxonomies">Taxonomy tags</Label>
            <span className="text-xs text-muted-foreground">
              Course × chapter × topic × exam_type. Add as many as apply.
            </span>
          </div>
          <Controller
            control={control}
            name="taxonomies"
            render={({ field, fieldState }) => (
              <TaxonomyTagPicker
                id="taxonomies"
                value={(field.value ?? []) as TaxonomyTag[]}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </section>

        {/* Difficulty (subject + exam type are derived from the first chip) */}
        <section className="space-y-2">
          <Label>Difficulty</Label>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <Controller
                key={d.value}
                control={control}
                name="difficulty"
                render={({ field }) => {
                  const selected = field.value === d.value
                  return (
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                        selected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      <input
                        type="radio"
                        className="h-3.5 w-3.5"
                        checked={selected}
                        onChange={() => field.onChange(d.value)}
                        value={d.value}
                      />
                      {d.label}
                    </label>
                  )
                }}
              />
            ))}
          </div>
        </section>

        {/* Marks */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="marks_correct">Marks (correct)</Label>
            <Input
              id="marks_correct"
              type="number"
              step="0.5"
              min="0"
              {...register('marks_correct', { valueAsNumber: true })}
            />
            {errors.marks_correct && (
              <p className="text-sm text-destructive">{errors.marks_correct.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="marks_negative">Negative marks</Label>
            <Input
              id="marks_negative"
              type="number"
              step="0.5"
              min="0"
              {...register('marks_negative', { valueAsNumber: true })}
            />
            {errors.marks_negative && (
              <p className="text-sm text-destructive">{errors.marks_negative.message}</p>
            )}
          </div>
        </section>

        {/* Question body */}
        <section className="space-y-2">
          <Label>Question body</Label>
          <Controller
            control={control}
            name="question_body"
            render={({ field }) => (
              <LaTeXEditor
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Type the question. LaTeX supported."
                minHeight={180}
              />
            )}
          />
          {errors.question_body && (
            <p className="text-sm text-destructive">{errors.question_body.message}</p>
          )}
        </section>

        {/* Type-specific fields */}
        <QuestionTypeFields />

        {/* Images */}
        <Controller
          control={control}
          name="image_paths"
          render={({ field }) => (
            <ImageUploader
              value={(field.value ?? []) as string[]}
              onChange={field.onChange}
            />
          )}
        />

        {/* Optional fields */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="solution">Solution (optional)</Label>
            <Textarea id="solution" rows={4} {...register('solution')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="explanation">Explanation (optional)</Label>
            <Textarea id="explanation" rows={4} {...register('explanation')} />
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {submitLabel ?? (mode === 'create' ? 'Create question' : 'Save changes')}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
