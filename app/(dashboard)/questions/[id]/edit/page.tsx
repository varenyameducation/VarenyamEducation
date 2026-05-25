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
  QuestionFormValues,
  QuestionTypeValue,
  SubjectValue,
} from '@/lib/validation/question'
import { apiGet, apiPatch, type Question } from '@/lib/ui/api'
import { normalizeQuestionFormForApi } from '@/lib/ui/normalize-question-form'
import type { TaxonomyTag } from '@/types/taxonomy'

function toFormInitialValues(q: Question): Partial<QuestionFormValues> {
  // Strip name fields off the API rows before seeding the picker — the
  // picker holds canonical id-only TaxonomyTag (names are rehydrated by
  // the server on the next read).
  const seedTags: TaxonomyTag[] = (q.taxonomies ?? []).map((row) => ({
    course_id: row.course_id,
    chapter_id: row.chapter_id ?? null,
    topic_id: row.topic_id ?? null,
    exam_type: row.exam_type,
  }))
  return {
    subject: q.subject as SubjectValue,
    taxonomies: seedTags,
    question_type: q.question_type as QuestionTypeValue,
    difficulty: q.difficulty as DifficultyValue,
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
