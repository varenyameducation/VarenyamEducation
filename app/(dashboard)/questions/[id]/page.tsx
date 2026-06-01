'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import 'katex/dist/katex.min.css'
import { AlertCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientDate } from '@/components/ui/client-date'
import { Separator } from '@/components/ui/separator'
import { DeleteQuestionDialog } from '@/components/questions/delete-question-dialog'
import { RenderedBody } from '@/lib/ui/render-body'
import { apiGet, type Question } from '@/lib/ui/api'
import { formatTagLabel } from '@/lib/ui/mocks/m2m'
import { resolveStorageUrl } from '@/lib/ui/storage-url'

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['questions', params.id],
    queryFn: () => apiGet<Question>(`/api/questions/${params.id}`),
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

  const q = data.data
  const tags = q.taxonomies ?? []

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
            <Badge>{q.difficulty}</Badge>
            {!q.is_verified && (
              <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100">
                Needs review · set correct answer
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/questions">Back to list</Link>
          </Button>
          <Button asChild>
            <Link href={`/questions/${q.id}/edit`}>Edit</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      <DeleteQuestionDialog
        question={q}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push('/questions')}
      />

      <article className="space-y-4 rounded-md border bg-card p-6">
        {tags.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-2 border-b pb-3">
            {tags.map((tag, idx) => {
              const href = tag.topic_id
                ? `/questions?topic=${tag.topic_id}`
                : tag.chapter_id
                  ? `/questions?chapter=${tag.chapter_id}`
                  : `/questions?course=${tag.course_id}`
              return (
                <Link
                  key={`${tag.course_id}-${tag.chapter_id ?? 'x'}-${tag.topic_id ?? 'x'}-${tag.exam_type}-${idx}`}
                  href={href}
                  className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs hover:bg-primary/10"
                  title={`Filter by ${formatTagLabel(tag)}`}
                >
                  {formatTagLabel(tag)}
                </Link>
              )
            })}
          </div>
        )}
        <RenderedBody className="prose prose-sm max-w-none" body={q.question_body} />

        {q.image_urls?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {q.image_urls.map((url) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={url}
                src={resolveStorageUrl(url)}
                alt="question image"
                className="max-h-64 w-full rounded border object-contain"
              />
            ))}
          </div>
        ) : null}

        {q.solution || q.solution_image_urls?.length ? (
          <section className="space-y-2 rounded-md bg-muted/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Solution
            </h2>
            {q.solution ? (
              <RenderedBody className="prose prose-sm max-w-none" body={q.solution} />
            ) : null}
            {q.solution_image_urls?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.solution_image_urls.map((url) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={url}
                    src={resolveStorageUrl(url)}
                    alt="solution image"
                    className="max-h-64 w-full rounded border bg-card object-contain"
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {q.explanation || q.explanation_image_urls?.length ? (
          <section className="space-y-2 rounded-md bg-muted/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Explanation
            </h2>
            {q.explanation ? (
              <RenderedBody className="prose prose-sm max-w-none" body={q.explanation} />
            ) : null}
            {q.explanation_image_urls?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.explanation_image_urls.map((url) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={url}
                    src={resolveStorageUrl(url)}
                    alt="explanation image"
                    className="max-h-64 w-full rounded border bg-card object-contain"
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <Separator />
        <p className="text-xs text-muted-foreground">
          Marks: +{Number(q.marks_correct)} / −{Number(q.marks_negative)} · Created{' '}
          <ClientDate iso={q.created_at} />
        </p>
      </article>
    </div>
  )
}
