'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import 'katex/dist/katex.min.css'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientDate } from '@/components/ui/client-date'
import { Separator } from '@/components/ui/separator'
import { RenderedBody } from '@/lib/ui/render-body'
import { apiGet, type Question } from '@/lib/ui/api'
import { deriveQuestionTags, formatTagLabel } from '@/lib/ui/mocks/m2m'

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
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
  const tags = deriveQuestionTags(q)

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
        <Separator />
        <p className="text-xs text-muted-foreground">
          Marks: +{Number(q.marks_correct)} / −{Number(q.marks_negative)} · Created{' '}
          <ClientDate iso={q.created_at} />
        </p>
      </article>
    </div>
  )
}
