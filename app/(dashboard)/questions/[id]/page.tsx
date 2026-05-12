'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { apiGet, type Question } from '@/lib/ui/api'

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
