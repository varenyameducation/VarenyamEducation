'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TaxonomyTagPicker } from '@/components/questions/taxonomy-tag-picker'
import { apiPost } from '@/lib/ui/api'
import type { TaxonomyTag } from '@/types/taxonomy'
import { cn } from '@/lib/utils'

type RetagAction = 'add' | 'replace' | 'remove'

interface BulkRetagResult {
  updated: number
}

export interface BulkRetagModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  questionIds: string[]
  onSuccess?: () => void
}

export function BulkRetagModal({
  open,
  onOpenChange,
  questionIds,
  onSuccess,
}: BulkRetagModalProps) {
  const qc = useQueryClient()
  const [action, setAction] = React.useState<RetagAction>('add')
  const [tags, setTags] = React.useState<TaxonomyTag[]>([])
  const [error, setError] = React.useState<string | null>(null)

  // Reset state every time the modal opens with a fresh selection.
  React.useEffect(() => {
    if (open) {
      setAction('add')
      setTags([])
      setError(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        question_ids: questionIds,
        action,
        tags: tags.map((t) => ({
          course_id: t.course_id,
          subject_id: t.subject_id ?? null,
          chapter_id: t.chapter_id ?? null,
          topic_id: t.topic_id ?? null,
          exam_type: t.exam_type,
        })),
      }
      return apiPost<BulkRetagResult>('/api/questions/bulk/retag', payload)
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      qc.invalidateQueries({ queryKey: ['questions'] })
      onSuccess?.()
      onOpenChange(false)
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Retag failed'),
  })

  const canSubmit =
    questionIds.length > 0 &&
    (action === 'replace' ? tags.length > 0 : tags.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Move / copy to taxonomies</DialogTitle>
          <DialogDescription>
            Apply tag changes across <strong>{questionIds.length}</strong> selected
            question{questionIds.length === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Action</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: 'add' as const, label: 'Add tags (copy)', hint: 'Append; existing tags kept' },
                  { v: 'replace' as const, label: 'Replace tags (move)', hint: 'Wipe and set' },
                  { v: 'remove' as const, label: 'Remove tags', hint: 'Strip matching tags' },
                ]
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setAction(opt.v)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-xs',
                    action === opt.v
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {action === opt.v && <Check className="h-3 w-3 text-primary" />}
                    {opt.label}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TaxonomyTagPicker value={tags} onChange={setTags} />
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending
              ? 'Applying…'
              : action === 'replace'
                ? 'Replace tags'
                : action === 'remove'
                  ? 'Remove tags'
                  : 'Add tags'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
