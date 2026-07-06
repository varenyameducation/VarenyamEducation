'use client'

import * as React from 'react'
import Link from 'next/link'
import { Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DeleteQuestionDialog } from '@/components/questions/delete-question-dialog'
import { QuestionPreviewDrawer } from '@/components/questions/question-preview-drawer'
import { splitBody } from '@/lib/ui/render-body'
import { formatTagLabel } from '@/lib/ui/mocks/m2m'
import type { Question } from '@/lib/ui/api'
import type { DifficultyValue } from '@/lib/validation/question'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

const DIFFICULTY_STYLES: Record<DifficultyValue, string> = {
  easy: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  medium: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  hard: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  advanced: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

// Strip KaTeX / math delimiters and image placeholders to produce a
// plain-text preview string — used for truncated body in table rows.
function stripToPlainText(body: string | null | undefined, maxLen = 80): string {
  if (!body) return ''
  const segments = splitBody(body)
  let text = ''
  for (const seg of segments) {
    if (seg.kind === 'prose') text += seg.text
    else if (seg.kind === 'inline-math' || seg.kind === 'display-math') text += `[${seg.tex.trim().slice(0, 20)}…]`
    else text += '[img]'
  }
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed
}

interface QuestionTableProps {
  questions: Question[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onDeleted?: () => void
  // Pagination
  page: number
  onPageChange: (page: number) => void
}

export function QuestionTable({
  questions,
  selectedIds,
  onToggleSelected,
  onDeleted,
  page,
  onPageChange,
}: QuestionTableProps) {
  const [previewQuestion, setPreviewQuestion] = React.useState<Question | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [deleteQuestion, setDeleteQuestion] = React.useState<Question | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageStart = safePage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, questions.length)
  const pageItems = questions.slice(pageStart, pageEnd)

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((q) => selectedIds.has(q.id))
  const somePageSelected = pageItems.some((q) => selectedIds.has(q.id))

  const openPreview = (q: Question) => {
    setPreviewQuestion(q)
    setPreviewOpen(true)
  }

  const openDelete = (e: React.MouseEvent, q: Question) => {
    e.stopPropagation()
    setDeleteQuestion(q)
    setDeleteOpen(true)
  }

  const handleDeleteDialogDeleted = () => {
    setDeleteOpen(false)
    setDeleteQuestion(null)
    onDeleted?.()
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 py-14 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          No questions match your filters
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={() => {
                    for (const q of pageItems) {
                      const isSelected = selectedIds.has(q.id)
                      if (allPageSelected && isSelected) onToggleSelected(q.id)
                      else if (!allPageSelected && !isSelected) onToggleSelected(q.id)
                    }
                  }}
                  aria-label={allPageSelected ? 'Deselect page' : 'Select page'}
                  className={somePageSelected && !allPageSelected ? 'opacity-50' : ''}
                />
              </TableHead>
              <TableHead className="min-w-0 max-w-[320px]">Question</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-24">Difficulty</TableHead>
              <TableHead className="w-36">Tag</TableHead>
              <TableHead className="w-20">Marks</TableHead>
              <TableHead className="w-16">Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((q, rowIdx) => {
              const primaryTag = q.taxonomies?.[0] ?? null
              const extraTags = (q.taxonomies?.length ?? 0) - 1
              const bodyPreview = stripToPlainText(q.question_body)
              const isSelected = selectedIds.has(q.id)
              return (
                <TableRow
                  key={q.id}
                  data-state={isSelected ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => openPreview(q)}
                >
                  {/* Checkbox */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelected(q.id)}
                      aria-label={`Select question ${rowIdx + pageStart + 1}`}
                    />
                  </TableCell>

                  {/* Question body (truncated) */}
                  <TableCell className="min-w-0 max-w-[320px]">
                    <p className="truncate text-sm text-foreground/90">{bodyPreview}</p>
                  </TableCell>

                  {/* Type */}
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {q.question_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>

                  {/* Difficulty */}
                  <TableCell>
                    <Badge
                      className={cn('border-transparent text-[10px]', DIFFICULTY_STYLES[q.difficulty])}
                    >
                      {q.difficulty}
                    </Badge>
                  </TableCell>

                  {/* Primary tag */}
                  <TableCell>
                    {primaryTag ? (
                      <span
                        className="inline-flex max-w-[140px] items-center truncate rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px]"
                        title={formatTagLabel(primaryTag)}
                      >
                        <span className="truncate">{formatTagLabel(primaryTag)}</span>
                        {extraTags > 0 && (
                          <span className="ml-1 shrink-0 font-medium text-primary">
                            +{extraTags}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Marks */}
                  <TableCell>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      <span className="text-emerald-700">+{Number(q.marks_correct)}</span>
                      {' / '}
                      <span className="text-rose-600">−{Number(q.marks_negative)}</span>
                    </span>
                  </TableCell>

                  {/* Verified status dot */}
                  <TableCell>
                    {q.is_verified ? (
                      <span
                        className="flex items-center gap-1 text-[10px] text-emerald-600"
                        title="Verified"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                        OK
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-[10px] text-amber-600"
                        title="Needs review"
                      >
                        <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                        Review
                      </span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Edit"
                      >
                        <Link href={`/questions/${q.id}/edit`}>
                          <Edit2 className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Edit</span>
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={(e) => openDelete(e, q)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {pageStart + 1}–{pageEnd} of {questions.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage === 0}
              onClick={() => onPageChange(safePage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={safePage >= totalPages - 1}
              onClick={() => onPageChange(safePage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Preview drawer */}
      <QuestionPreviewDrawer
        question={previewQuestion}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onDeleted={() => {
          setPreviewOpen(false)
          onDeleted?.()
        }}
      />

      {/* Delete dialog (from row action button) */}
      {deleteQuestion && (
        <DeleteQuestionDialog
          question={deleteQuestion}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={handleDeleteDialogDeleted}
        />
      )}
    </div>
  )
}
