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
  EXAM_TYPES,
  type QuestionFormValues,
} from '@/lib/validation/question'
import {
  MOCK_COURSES,
  MOCK_CHAPTERS,
  MOCK_TOPICS,
} from '@/lib/ui/mocks/taxonomy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { LaTeXEditor } from '@/components/ui/latex-editor'
import { Textarea } from '@/components/ui/textarea'
import { QuestionTypeFields } from '@/components/questions/question-type-fields'
import { ImageUploader } from '@/components/questions/image-uploader'
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

  const courseId = useWatch({ control, name: 'course_id' })
  const chapterId = useWatch({ control, name: 'chapter_id' })

  const chapters = React.useMemo(
    () => MOCK_CHAPTERS.filter((c) => c.course_id === courseId),
    [courseId],
  )

  const topics = React.useMemo(
    () => MOCK_TOPICS.filter((t) => t.chapter_id === chapterId),
    [chapterId],
  )

  // Reset chapter+topic when course changes
  React.useEffect(() => {
    if (!courseId) return
    const stillValid = chapters.some((c) => c.id === chapterId)
    if (!stillValid) {
      setValue('chapter_id', '' as unknown as QuestionFormValues['chapter_id'])
      setValue('topic_id', '' as unknown as QuestionFormValues['topic_id'])
    }
  }, [courseId, chapterId, chapters, setValue])

  // Subject auto-fills from chapter
  React.useEffect(() => {
    if (!chapterId) return
    const ch = MOCK_CHAPTERS.find((c) => c.id === chapterId)
    if (ch) setValue('subject', ch.subject)
    const stillValid = topics.some((t) => t.id === chapterId)
    if (!stillValid) {
      setValue('topic_id', '' as unknown as QuestionFormValues['topic_id'])
    }
  }, [chapterId, topics, setValue])

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

        {/* Taxonomy row */}
        <section className="grid gap-4 md:grid-cols-3">
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
            <Label htmlFor="chapter_id">Chapter</Label>
            <Select
              id="chapter_id"
              disabled={!courseId || chapters.length === 0}
              {...register('chapter_id')}
            >
              <option value="">
                {courseId ? 'Select chapter…' : 'Pick a course first'}
              </option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.chapter_no ? `${c.chapter_no}. ${c.name}` : c.name}
                </option>
              ))}
            </Select>
            {errors.chapter_id && (
              <p className="text-sm text-destructive">{errors.chapter_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic_id">Topic</Label>
            <Select
              id="topic_id"
              disabled={!chapterId || topics.length === 0}
              {...register('topic_id')}
            >
              <option value="">
                {chapterId ? 'Select topic…' : 'Pick a chapter first'}
              </option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.topic_no ? `${t.topic_no}. ${t.name}` : t.name}
                </option>
              ))}
            </Select>
            {errors.topic_id && (
              <p className="text-sm text-destructive">{errors.topic_id.message}</p>
            )}
          </div>
        </section>

        {/* Subject (read-only) + difficulty + exam type */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              readOnly
              placeholder="Auto-filled from chapter"
              {...register('subject')}
            />
          </div>
          <div className="space-y-2">
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
