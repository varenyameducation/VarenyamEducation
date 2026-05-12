'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { QuestionForm } from '@/components/questions/question-form'
import type { QuestionFormValues } from '@/lib/validation/question'
import { apiPost, type Question } from '@/lib/ui/api'
import { normalizeQuestionFormForApi } from '@/lib/ui/normalize-question-form'

export default function NewQuestionPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [mutationError, setMutationError] = React.useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (values: QuestionFormValues) =>
      apiPost<Question>('/api/questions', normalizeQuestionFormForApi(values)),
    onSuccess: (result) => {
      if (!result.ok) {
        setMutationError(result.error.message)
        return
      }
      queryClient.invalidateQueries({ queryKey: ['questions'] })
      router.push(`/questions/${result.data.id}`)
    },
    onError: (err) =>
      setMutationError(err instanceof Error ? err.message : 'Create failed'),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New question</h1>
        <p className="text-sm text-muted-foreground">
          Add a question to the bank. LaTeX is rendered live in the preview pane.
        </p>
      </header>
      {mutationError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {mutationError}
        </div>
      )}
      <QuestionForm
        mode="create"
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values)
        }}
        submitLabel={createMutation.isPending ? 'Creating…' : 'Create question'}
      />
    </div>
  )
}
