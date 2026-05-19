'use client'

import * as React from 'react'
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
import { PaperTemplate, type PaperRow } from '@/lib/export/PaperTemplate'
import type { Branding } from '@/lib/export/branding'
import type { SelectedQuestion } from '@/components/tests/selected-questions-sorter'

export interface TestPreviewMeta {
  title: string
  course_name?: string | null
  subject?: string | null
  exam_type?: string | null
  duration_minutes: number
  total_marks: number
  instructions?: string | null
}

export interface TestPreviewModalProps {
  meta: TestPreviewMeta
  selected: SelectedQuestion[]
  branding?: Branding | null
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const FALLBACK_BRANDING: Branding = {
  inst_name: 'Varenyam Coaching Institute',
  tagline: 'Excellence in Education',
  address: null,
  phone: null,
  email: null,
  website: null,
  logo_url: null,
  brand_color_hex: '1B3A6B',
  logo_position: 'left',
  paper_font: 'formal',
  footer_text: 'Confidential — For Student Use Only',
  show_address: false,
  show_phone: false,
  show_website: false,
}

export function TestPreviewModal({
  meta,
  selected,
  branding,
  trigger,
  open,
  onOpenChange,
}: TestPreviewModalProps) {
  const b = branding ?? FALLBACK_BRANDING

  const rows: PaperRow[] = selected.map((s) => ({
    id: s.question.id,
    position: s.position,
    section_label: s.section_label || null,
    marks_override:
      s.marks_override == null ? null : Number(s.marks_override),
    question: {
      id: s.question.id,
      question_type: s.question.question_type,
      question_body: s.question.question_body,
      option_a: s.question.option_a ?? null,
      option_b: s.question.option_b ?? null,
      option_c: s.question.option_c ?? null,
      option_d: s.question.option_d ?? null,
      marks_correct: Number(s.question.marks_correct),
    },
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[92vh] w-[min(900px,95vw)] max-w-none overflow-y-auto p-0 sm:rounded-md">
        <DialogHeader className="border-b bg-card px-6 py-3">
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

        <div className="bg-white p-8" aria-label="Test paper preview">
          <PaperTemplate
            meta={{
              title: meta.title,
              course_name: meta.course_name ?? null,
              subject: meta.subject ?? null,
              exam_type: meta.exam_type ?? null,
              duration_minutes: meta.duration_minutes,
              total_marks: meta.total_marks,
              instructions: meta.instructions ?? null,
            }}
            rows={rows}
            branding={b}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
