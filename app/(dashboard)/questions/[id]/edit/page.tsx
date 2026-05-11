'use client'

import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { QuestionForm } from '@/components/questions/question-form'
import type { QuestionFormValues } from '@/lib/validation/question'
import { MOCK_QUESTIONS } from '@/lib/ui/mocks/questions'

export default function EditQuestionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  // TODO: replace with apiGet<Question>(`/api/questions/${params.id}`).
  const q = MOCK_QUESTIONS.find((it) => it.id === params.id)
  if (!q) notFound()

  const initial: Partial<QuestionFormValues> = {
    course_id: q.course_id,
    chapter_id: q.chapter_id,
    topic_id: q.topic_id,
    subject: q.subject,
    question_type: q.question_type,
    difficulty: q.difficulty,
    exam_type: q.exam_type,
    marks_correct: q.marks_correct,
    marks_negative: q.marks_negative,
    question_body: q.question_body,
  }

  async function handleSave(values: QuestionFormValues) {
    // TODO: PATCH /api/questions/[id].
    // eslint-disable-next-line no-console
    console.info('[questions:edit]', params.id, values)
    router.push(`/questions/${params.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit question</h1>
      <QuestionForm
        mode="edit"
        initialValues={initial}
        onSubmit={handleSave}
        submitLabel="Save changes"
      />
    </div>
  )
}
