'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RenderedBody, renderBodyToHtml } from '@/lib/ui/render-body'
import { apiDelete, type Question } from '@/lib/ui/api'
import { formatTagLabel } from '@/lib/ui/mocks/m2m'
import { cn } from '@/lib/utils'

export interface DeleteQuestionDialogProps {
  question: Question
  open: boolean
  onOpenChange: (open: boolean) => void
  // Called once the question has been permanently removed and the server
  // has confirmed. Parent decides what to do — re-route, refresh, etc.
  onDeleted?: () => void
}

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'] as const
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

export function DeleteQuestionDialog({
  question,
  open,
  onOpenChange,
  onDeleted,
}: DeleteQuestionDialogProps) {
  const qc = useQueryClient()
  const [errorCode, setErrorCode] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setErrorCode(null)
      setErrorMessage(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiDelete<unknown>(`/api/questions/${question.id}`)
      if (!res.ok) {
        const code = res.error.code || 'DELETE_FAILED'
        const message = res.error.message || 'Could not delete the question.'
        const err = new Error(message) as Error & { code: string }
        err.code = code
        throw err
      }
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] })
      onOpenChange(false)
      onDeleted?.()
    },
    onError: (err: Error & { code?: string }) => {
      setErrorCode(err.code ?? 'DELETE_FAILED')
      setErrorMessage(err.message)
    },
  })

  const inUse = errorCode === 'QUESTION_IN_USE'
  const isPending = mutation.isPending
  const isMcq =
    question.question_type === 'mcq' || question.question_type === 'multi_select'
  const tags = question.taxonomies ?? []

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            Delete question permanently?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the question and confirm permanent deletion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-mono uppercase">
              {question.question_type.replace('_', ' ')}
            </Badge>
            <Badge variant="secondary">{question.subject}</Badge>
            <Badge variant="outline">{question.difficulty}</Badge>
            {tags.slice(0, 2).map((tag, idx) => (
              <Badge
                key={`${tag.course_id}-${tag.chapter_id ?? 'x'}-${tag.topic_id ?? 'x'}-${idx}`}
                variant="outline"
                className="border-primary/30 bg-primary/5"
              >
                {formatTagLabel(tag)}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="outline">+{tags.length - 2} more</Badge>
            )}
          </div>

          <RenderedBody
            className="text-sm text-foreground/90"
            body={question.question_body}
          />

          {isMcq && (
            <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
              {OPTION_KEYS.map((key, idx) => {
                const value = question[key]
                if (!value) return null
                const letter = OPTION_LETTERS[idx]
                return (
                  <li key={key} className="rounded-md border bg-background px-3 py-1.5">
                    <span className="mr-2 font-semibold">({letter})</span>
                    <span
                      className="inline"
                      dangerouslySetInnerHTML={{
                        __html: renderBodyToHtml(String(value)),
                      }}
                    />
                  </li>
                )
              })}
            </ol>
          )}

          {question.question_type === 'numerical' &&
            question.numerical_answer != null && (
              <p className="text-sm">
                <span className="font-semibold">Answer:</span>{' '}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {String(question.numerical_answer)}
                </code>
              </p>
            )}
        </div>

        {inUse ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">This question is currently used in one or more test papers.</p>
            <p className="mt-1 text-xs">
              Remove it from those tests before deleting.
            </p>
          </div>
        ) : (
          <p className="text-xs text-destructive">
            This action cannot be undone. The question will be removed from the
            database. If this question is used in any test paper, the deletion
            will be blocked.
          </p>
        )}

        {errorMessage && !inUse && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        <DialogFooter>
          {inUse ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              OK, keep it
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={isPending}
                className={cn(isPending && 'cursor-wait')}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Delete permanently
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
