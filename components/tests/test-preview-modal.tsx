'use client'

import * as React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SelectedQuestion } from '@/components/tests/selected-questions-sorter'

const LATEX_TOKEN = /\\[a-zA-Z]+|[\$\^_{}]/

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderBlock(body: string): string {
  if (!LATEX_TOKEN.test(body)) return escapeHtml(body)
  try {
    return katex.renderToString(body, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(body)
  }
}

export interface TestPreviewMeta {
  title: string
  duration_minutes: number
  total_marks: number
  instructions?: string
}

export interface InstituteBranding {
  inst_name: string
  tagline?: string | null
  brand_color_hex?: string | null
  footer_text?: string | null
}

export interface TestPreviewModalProps {
  meta: TestPreviewMeta
  selected: SelectedQuestion[]
  branding?: InstituteBranding | null
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const FALLBACK_BRANDING: InstituteBranding = {
  inst_name: 'Varenyam Coaching Institute',
  tagline: 'Excellence in Education',
  brand_color_hex: '1B3A6B',
  footer_text: 'Confidential — For Student Use Only',
}

export function TestPreviewModal({
  meta,
  selected,
  branding,
  trigger,
  open,
  onOpenChange,
}: TestPreviewModalProps) {
  // TODO: when integration exposes /api/institute/branding, fetch via useQuery
  // here and remove the FALLBACK constant — kept congruent with
  // lib/export/TestPaperDocument.tsx so WYSIWYG holds.
  const b = branding ?? FALLBACK_BRANDING
  const accent = `#${b.brand_color_hex ?? FALLBACK_BRANDING.brand_color_hex}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[92vh] w-[min(900px,95vw)] max-w-none overflow-y-auto p-0 sm:rounded-md">
        <DialogHeader className="border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Test preview</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <article
          className="bg-white p-8 text-[15px] leading-relaxed text-zinc-900"
          aria-label="Test paper preview"
        >
          <header
            className="mb-6 border-b-2 pb-4"
            style={{ borderColor: accent }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1
                  className="text-xl font-bold tracking-tight"
                  style={{ color: accent }}
                >
                  {b.inst_name}
                </h1>
                {b.tagline && (
                  <p className="text-xs text-zinc-600">{b.tagline}</p>
                )}
              </div>
              <div className="text-right text-xs text-zinc-700">
                <p>Duration: {meta.duration_minutes} min</p>
                <p>Total marks: {Number(meta.total_marks)}</p>
              </div>
            </div>
            <h2 className="mt-3 text-center text-lg font-semibold">{meta.title || 'Untitled test'}</h2>
          </header>

          {meta.instructions && (
            <section className="mb-4 rounded border-l-4 bg-zinc-50 p-3 text-sm" style={{ borderColor: accent }}>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-600">
                Instructions
              </p>
              <p className="whitespace-pre-wrap">{meta.instructions}</p>
            </section>
          )}

          {selected.length === 0 ? (
            <p className="rounded border border-dashed p-8 text-center text-sm text-zinc-500">
              No questions selected yet.
            </p>
          ) : (
            <SectionedQuestions items={selected} />
          )}

          <footer
            className={cn(
              'mt-8 border-t pt-3 text-center text-[11px] uppercase tracking-wider text-zinc-500',
            )}
          >
            {b.footer_text ?? 'Confidential'} · {b.inst_name}
          </footer>
        </article>
      </DialogContent>
    </Dialog>
  )
}

function SectionedQuestions({ items }: { items: SelectedQuestion[] }) {
  // Group consecutive items sharing the same section_label.
  const groups: { label: string; rows: SelectedQuestion[] }[] = []
  for (const it of items) {
    const label = it.section_label.trim()
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.label === label) {
      lastGroup.rows.push(it)
    } else {
      groups.push({ label, rows: [it] })
    }
  }

  let runningNumber = 0
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <section key={`${gi}-${g.label}`}>
          {g.label && (
            <h3 className="mb-2 border-b pb-1 text-sm font-semibold uppercase tracking-wide text-zinc-700">
              {g.label}
            </h3>
          )}
          <ol className="space-y-4">
            {g.rows.map((it) => {
              runningNumber += 1
              const marks =
                it.marks_override ?? Number(it.question.marks_correct) ?? 0
              return (
                <li key={it.question.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm font-semibold">
                      Q{runningNumber}.
                    </span>
                    <span className="shrink-0 text-xs text-zinc-600">
                      [{marks} mark{marks === 1 ? '' : 's'}]
                    </span>
                  </div>
                  <div
                    className="mt-1"
                    dangerouslySetInnerHTML={{
                      __html: renderBlock(it.question.question_body),
                    }}
                  />
                  {(it.question.question_type === 'mcq' ||
                    it.question.question_type === 'multi_select') && (
                    <ol className="ml-6 mt-2 space-y-1 text-sm">
                      {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map(
                        (k, idx) => {
                          const v = it.question[k]
                          if (!v) return null
                          const letter = String.fromCharCode(65 + idx)
                          return (
                            <li key={k}>
                              <span className="mr-2 font-semibold">({letter})</span>
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: renderBlock(String(v)),
                                }}
                              />
                            </li>
                          )
                        },
                      )}
                    </ol>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
