'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Download, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPost, apiPut } from '@/lib/ui/api'
import type { TestSetupValues, TestStatus } from '@/lib/validation/test'
import type { SelectedQuestion } from '@/components/tests/selected-questions-sorter'

export interface TestActionBarProps {
  testId: string
  meta: TestSetupValues
  selected: SelectedQuestion[]
  disabledReason?: string | null
}

interface SavePayload {
  status: TestStatus
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'test'
  )
}

type Toast =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function TestActionBar({
  testId,
  meta,
  selected,
  disabledReason,
}: TestActionBarProps) {
  const queryClient = useQueryClient()
  const [toast, setToast] = React.useState<Toast>({ kind: 'idle' })
  const [downloading, setDownloading] = React.useState<'pdf' | 'docx' | null>(null)

  const isDisabled =
    !!disabledReason || selected.length === 0 || meta.title.trim().length === 0

  const slug = React.useMemo(() => slugify(meta.title), [meta.title])

  const saveMutation = useMutation({
    mutationFn: async ({ status }: SavePayload) => {
      const meta_res = await apiPut(`/api/tests/${testId}`, {
        title: meta.title,
        course_id: meta.course_id,
        subject: meta.subjects?.[0] ?? null,
        exam_type: meta.exam_type,
        duration_minutes: meta.duration_minutes,
        instructions: meta.instructions,
        status,
      })
      if (!meta_res.ok) return meta_res
      const items_res = await apiPost(`/api/tests/${testId}/questions`, {
        items: selected.map((s) => ({
          question_id: s.question.id,
          position: s.position,
          section_label: s.section_label || null,
          marks_override: s.marks_override,
        })),
      })
      return items_res
    },
    onSuccess: (result, vars) => {
      if (!result.ok) {
        setToast({ kind: 'error', message: result.error.message })
        return
      }
      setToast({
        kind: 'success',
        message:
          vars.status === 'published'
            ? 'Saved and published.'
            : vars.status === 'final'
              ? 'Saved as final.'
              : 'Draft saved.',
      })
      queryClient.invalidateQueries({ queryKey: ['tests'] })
    },
    onError: (err) =>
      setToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      }),
  })

  async function download(format: 'pdf' | 'docx') {
    if (isDisabled) return
    setDownloading(format)
    setToast({ kind: 'idle' })
    try {
      const save = await saveMutation.mutateAsync({ status: 'draft' })
      if (!save.ok) {
        setToast({ kind: 'error', message: `Save failed before download: ${save.error.message}` })
        return
      }
      const res = await fetch(`/api/tests/${testId}/export/${format}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        if (res.status === 503) {
          setToast({
            kind: 'error',
            message: "Server can't generate the file yet — try again in a minute.",
          })
        } else {
          const body = await res.json().catch(() => null)
          const message =
            body && typeof body === 'object' && 'error' in body
              ? (body as { error: { message: string } }).error.message
              : `Download failed (HTTP ${res.status}).`
          setToast({ kind: 'error', message })
        }
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `test-${slug}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setToast({
        kind: 'success',
        message: `Downloaded test-${slug}.${format}.`,
      })
    } catch (e) {
      setToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Download failed.',
      })
    } finally {
      setDownloading(null)
    }
  }

  const hint =
    disabledReason ??
    (selected.length === 0
      ? 'Add at least one question to save or download.'
      : meta.title.trim().length === 0
        ? 'Add a title to save or download.'
        : null)

  return (
    <section className="sticky bottom-0 z-10 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {toast.kind === 'success' && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {toast.message}
            </span>
          )}
          {toast.kind === 'error' && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {toast.message}
            </span>
          )}
          {toast.kind === 'idle' && hint && <span>{hint}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isDisabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ status: 'draft' })}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button
            type="button"
            disabled={isDisabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ status: 'published' })}
          >
            Save & Publish
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDisabled || downloading !== null}
            onClick={() => download('pdf')}
          >
            {downloading === 'pdf' ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Download PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDisabled || downloading !== null}
            onClick={() => download('docx')}
          >
            {downloading === 'docx' ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Download DOCX
          </Button>
        </div>
      </div>
    </section>
  )
}
