import Link from 'next/link'
import { notFound } from 'next/navigation'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MOCK_QUESTIONS } from '@/lib/ui/mocks/questions'

const LATEX_TOKEN = /\\[a-zA-Z]+|[\$\^_{}]/

function renderBlock(body: string): string {
  if (!LATEX_TOKEN.test(body)) {
    return body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
  try {
    return katex.renderToString(body, {
      throwOnError: false,
      displayMode: true,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return body
  }
}

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
  // TODO: replace with apiGet<Question>(`/api/questions/${params.id}`).
  const q = MOCK_QUESTIONS.find((it) => it.id === params.id)
  if (!q) notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Question detail</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono uppercase">
              {q.question_type.replace('_', ' ')}
            </Badge>
            <Badge variant="secondary">{q.subject}</Badge>
            <Badge variant="outline" className="uppercase">
              {q.exam_type}
            </Badge>
            <Badge>{q.difficulty}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/questions">Back to list</Link>
          </Button>
          <Button asChild>
            <Link href={`/questions/${q.id}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      <article className="space-y-4 rounded-md border bg-card p-6">
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderBlock(q.question_body) }}
        />
        <Separator />
        <p className="text-xs text-muted-foreground">
          Marks: +{Number(q.marks_correct)} / −{Number(q.marks_negative)} · Created{' '}
          {new Date(q.created_at).toLocaleString()}
        </p>
      </article>
    </div>
  )
}
