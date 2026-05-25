'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionForm } from '@/components/questions/question-form'
import type {
  DifficultyValue,
  ExamTypeValue,
  QuestionFormValues,
  QuestionTypeValue,
  SubjectValue,
} from '@/lib/validation/question'
import { apiGet, apiPatch, type Question } from '@/lib/ui/api'
import { normalizeQuestionFormForApi } from '@/lib/ui/normalize-question-form'
import type { TaxonomyTag } from '@/lib/ui/mocks/m2m'

function toFormInitialValues(q: Question): Partial<QuestionFormValues> {
  // Seed taxonomies from the singular fields the API still returns, so
  // the chip picker shows the existing tag on first load. Real m2m tags
  // come from the API once BE lands the new endpoint.
  const seedTag: TaxonomyTag | null = q.course_id
    ? {
        course_id: q.course_id,
        course_name: q.course?.name ?? 'Course',
        chapter_id: q.chapter_id ?? null,
        chapter_name: q.chapter?.name ?? null,
        topic_id: q.topic_id ?? null,
        topic_name: q.topic?.name ?? null,
        subject: q.subject as SubjectValue,
        exam_type: q.exam_type as ExamTypeValue,
      }
    : null
  return {
    course_id: q.course_id ?? '',
    chapter_id: (q.chapter_id ?? '') as QuestionFormValues['chapter_id'],
    topic_id: (q.topic_id ?? '') as QuestionFormValues['topic_id'],
    subject: q.subject as SubjectValue,
    taxonomies: seedTag ? [seedTag] : [],
    question_type: q.question_type as QuestionTypeValue,
    difficulty: q.difficulty as DifficultyValue,
    exam_type: q.exam_type as ExamTypeValue,
    marks_correct: Number(q.marks_correct),
    marks_negative: Number(q.marks_negative),
    question_body: q.question_body,
    option_a: q.option_a ?? '',
    option_b: q.option_b ?? '',
    option_c: q.option_c ?? '',
    option_d: q.option_d ?? '',
    correct_option: (q.correct_option ?? []).map(
      (c) => c.toLowerCase(),
    ) as QuestionFormValues['correct_option'],
    numerical_answer:
      q.numerical_answer != null ? Number(q.numerical_answer) : undefined,
    solution: q.solution ?? '',
    explanation: q.explanation ?? '',
    image_paths: q.image_urls ?? [],
  }
}

export default function EditQuestionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['questions', params.id],
    queryFn: () => apiGet<Question>(`/api/questions/${params.id}`),
  })

  const [mutationError, setMutationError] = React.useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: (values: QuestionFormValues) =>
      apiPatch<Question>(
        `/api/questions/${params.id}`,
        normalizeQuestionFormForApi(values),
      ),
    onSuccess: (result) => {
      if (!result.ok) {
        setMutationError(result.error.message)
        return
      }
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      router.push(`/questions/${params.id}`)
    },
    onError: (err) =>
      setMutationError(err instanceof Error ? err.message : 'Save failed'),
  })

  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        Loading question…
      </div>
    )
  }

  if (!data || !data.ok) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {data?.ok === false ? data.error.message : 'Could not load question.'}
        </div>
        <Button asChild variant="outline">
          <Link href="/questions">Back to list</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit question</h1>
      {mutationError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {mutationError}
        </div>
      )}
      <QuestionForm
        mode="edit"
        initialValues={toFormInitialValues(data.data)}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync(values)
        }}
        submitLabel={saveMutation.isPending ? 'Saving…' : 'Save changes'}
      />
    </div>
  )
}
