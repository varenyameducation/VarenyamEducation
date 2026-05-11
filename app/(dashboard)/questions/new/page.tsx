'use client'

import { useRouter } from 'next/navigation'
import { QuestionForm } from '@/components/questions/question-form'
import type { QuestionFormValues } from '@/lib/validation/question'

export default function NewQuestionPage() {
  const router = useRouter()

  async function handleCreate(values: QuestionFormValues) {
    // TODO: wire to POST /api/questions once backend lands.
    //       For now log + return to list with a toast-style query param.
    // eslint-disable-next-line no-console
    console.info('[questions:create]', values)
    router.push('/questions?created=1')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New question</h1>
        <p className="text-sm text-muted-foreground">
          Add a question to the bank. LaTeX is rendered live in the preview pane.
        </p>
      </header>
      <QuestionForm mode="create" onSubmit={handleCreate} />
    </div>
  )
}
