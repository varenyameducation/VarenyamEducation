import * as React from 'react'
import type { Branding, TestWithQuestions } from './branding'
import { PaperTemplate, type PaperMeta, type PaperRow } from './PaperTemplate'

type Props = {
  test: TestWithQuestions
  branding: Branding
}

function computeTotalMarks(test: TestWithQuestions): number {
  let total = 0
  for (const tq of test.test_questions) {
    const m =
      tq.marks_override != null
        ? Number(tq.marks_override)
        : Number(tq.question.marks_correct)
    if (Number.isFinite(m)) total += m
  }
  return total
}

export function TestPaperDocument({ test, branding }: Props) {
  const meta: PaperMeta = {
    title: test.title,
    course_name: test.course?.name ?? null,
    subject: test.subject ?? null,
    exam_type: test.exam_type ?? null,
    duration_minutes: test.duration_minutes,
    total_marks: computeTotalMarks(test),
    instructions: test.instructions ?? null,
  }

  const rows: PaperRow[] = test.test_questions.map((tq) => ({
    id: tq.id,
    position: tq.position,
    section_label: tq.section_label,
    marks_override:
      tq.marks_override == null ? null : Number(tq.marks_override),
    question: {
      id: tq.question.id,
      question_type: tq.question.question_type,
      question_body: tq.question.question_body,
      option_a: tq.question.option_a,
      option_b: tq.question.option_b,
      option_c: tq.question.option_c,
      option_d: tq.question.option_d,
      marks_correct: Number(tq.question.marks_correct),
    },
  }))

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>{test.title}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { size: A4; margin: 18mm 16mm; }
              html, body { margin: 0; padding: 0; }
              body { padding: 0; }
            `,
          }}
        />
      </head>
      <body>
        <PaperTemplate meta={meta} rows={rows} branding={branding} />
      </body>
    </html>
  )
}
