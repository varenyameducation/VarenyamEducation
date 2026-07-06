'use client'

import * as React from 'react'
import Link from 'next/link'
import { Edit2, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeleteQuestionDialog } from '@/components/questions/delete-question-dialog'
import { RenderedBody, renderBodyToHtml } from '@/lib/ui/render-body'
import { resolveStorageUrl } from '@/lib/ui/storage-url'
import { formatTagLabel } from '@/lib/ui/mocks/m2m'
import type { Question } from '@/lib/ui/api'
import type { DifficultyValue } from '@/lib/validation/question'
import { cn } from '@/lib/utils'

const DIFFICULTY_STYLES: Record<DifficultyValue, string> = {
  easy: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  medium: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  hard: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  advanced: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'] as const
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

interface QuestionPreviewDrawerProps {
  question: Question | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function QuestionPreviewDrawer({
  question,
  open,
  onOpenChange,
  onDeleted,
}: QuestionPreviewDrawerProps) {
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const handleDeleted = () => {
    setDeleteOpen(false)
    onOpenChange(false)
    onDeleted?.()
  }

  if (!question) return null

  const correctSet = new Set((question.correct_option ?? []).map((c) => c.toUpperCase()))
  const showAnswerHighlights = question.is_verified === true && correctSet.size > 0
  const isMcq =
    question.question_type === 'mcq' || question.question_type === 'multi_select'
  const tags = question.taxonomies ?? []

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col overflow-y-auto p-0">
          <SheetHeader className="border-b px-6 py-4">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <Badge variant="outline" className="font-mono uppercase">
                {question.question_type.replace('_', ' ')}
              </Badge>
              <Badge className={cn('border-transparent', DIFFICULTY_STYLES[question.difficulty])}>
                {question.difficulty}
              </Badge>
              <Badge variant="secondary">{question.subject}</Badge>
              {question.is_verified ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                  Needs review
                </span>
              )}
            </div>
            <SheetTitle className="sr-only">Question preview</SheetTitle>
            <SheetDescription className="sr-only">
              Full question details and actions
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Question body */}
            <RenderedBody className="text-sm text-foreground/90" body={question.question_body} />

            {/* Images */}
            {question.image_urls && question.image_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {question.image_urls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={resolveStorageUrl(url)}
                    alt="Question figure"
                    className="max-h-64 rounded border object-contain"
                  />
                ))}
              </div>
            )}

            {/* MCQ options */}
            {isMcq && (
              <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
                {OPTION_KEYS.map((key, idx) => {
                  const value = question[key]
                  if (!value) return null
                  const letter = OPTION_LETTERS[idx]
                  const isCorrect = showAnswerHighlights && correctSet.has(letter)
                  return (
                    <li
                      key={key}
                      className={cn(
                        'rounded-md border px-3 py-1.5',
                        isCorrect && 'border-emerald-300 bg-emerald-50',
                      )}
                    >
                      <span className="mr-2 font-semibold">({letter})</span>
                      <span
                        className="inline"
                        dangerouslySetInnerHTML={{ __html: renderBodyToHtml(String(value)) }}
                      />
                      {isCorrect && (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-700">
                          correct
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}

            {/* Numerical answer */}
            {question.question_type === 'numerical' && question.numerical_answer != null && (
              <p className="text-sm">
                <span className="font-semibold">Answer:</span>{' '}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {String(question.numerical_answer)}
                </code>
              </p>
            )}

            {/* Marks */}
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-emerald-700">
                +{Number(question.marks_correct)}
              </span>
              {' / '}
              <span className="font-medium text-rose-600">
                −{Number(question.marks_negative)}
              </span>
              {' marks'}
            </p>

            {/* Taxonomy tags */}
            {tags.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Taxonomy
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag, idx) => (
                    <span
                      key={`${tag.course_id}-${tag.chapter_id ?? 'x'}-${tag.topic_id ?? 'x'}-${idx}`}
                      className="inline-flex max-w-full truncate rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs"
                      title={formatTagLabel(tag)}
                    >
                      {formatTagLabel(tag)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 border-t px-6 py-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/questions/${question.id}/edit`}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Edit
              </Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {deleteOpen && (
        <DeleteQuestionDialog
          question={question}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}
