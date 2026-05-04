import * as React from 'react'
import katex from 'katex'
import type { Branding, TestWithQuestions } from './branding'

type Props = {
  test: TestWithQuestions
  branding: Branding
}

const OPTION_LETTERS = ['a', 'b', 'c', 'd'] as const

function renderKatex(source: string | null | undefined): string {
  if (!source) return ''
  try {
    return katex.renderToString(source, {
      output: 'html',
      throwOnError: false,
      displayMode: false,
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(source)
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function brandColor(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`
}

function HeaderBlock({ branding }: { branding: Branding }) {
  const showLogo = !!branding.logo_url
  const align = branding.logo_position
  return (
    <table className="paper-header" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
      <tbody>
        <tr>
          {showLogo && align === 'left' ? (
            <td style={{ width: 90, verticalAlign: 'middle' }}>
              <img src={branding.logo_url ?? ''} alt="logo" style={{ width: 72, height: 'auto' }} />
            </td>
          ) : null}
          <td style={{ textAlign: align === 'center' ? 'center' : 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: brandColor(branding.brand_color_hex) }}>
              {branding.inst_name}
            </div>
            {branding.tagline ? (
              <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{branding.tagline}</div>
            ) : null}
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              {branding.show_address && branding.address ? <span>{branding.address}</span> : null}
              {branding.show_phone && branding.phone ? (
                <span style={{ marginLeft: 12 }}>Ph: {branding.phone}</span>
              ) : null}
              {branding.show_website && branding.website ? (
                <span style={{ marginLeft: 12 }}>{branding.website}</span>
              ) : null}
            </div>
          </td>
          {showLogo && align === 'right' ? (
            <td style={{ width: 90, verticalAlign: 'middle', textAlign: 'right' }}>
              <img src={branding.logo_url ?? ''} alt="logo" style={{ width: 72, height: 'auto' }} />
            </td>
          ) : null}
        </tr>
      </tbody>
    </table>
  )
}

function TestMeta({ test }: { test: TestWithQuestions }) {
  return (
    <div className="paper-meta" style={{ marginTop: 12, fontSize: 12, color: '#222' }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{test.title}</div>
      {test.subject ? <span>Subject: {test.subject}</span> : null}
      {test.exam_type ? <span style={{ marginLeft: 12 }}>Exam: {test.exam_type.toUpperCase()}</span> : null}
      <span style={{ marginLeft: 12 }}>Duration: {test.duration_minutes} min</span>
      {test.instructions ? (
        <div style={{ marginTop: 6, fontSize: 11, color: '#555' }}>{test.instructions}</div>
      ) : null}
    </div>
  )
}

function QuestionBlock({
  index,
  row,
}: {
  index: number
  row: TestWithQuestions['test_questions'][number]
}) {
  const q = row.question
  const marks = row.marks_override ?? q.marks_correct
  return (
    <div className="question" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>Q{index + 1}.</strong>
        <span style={{ color: '#555' }}>[{String(marks)} marks]</span>
      </div>
      <div
        style={{ marginTop: 4 }}
        dangerouslySetInnerHTML={{ __html: renderKatex(q.question_body) }}
      />
      {q.question_type === 'mcq' || q.question_type === 'multi_select' ? (
        <ol style={{ marginTop: 6, paddingLeft: 18, listStyleType: 'lower-alpha' }}>
          {OPTION_LETTERS.map((letter) => {
            const option = (q as Record<string, unknown>)[`option_${letter}`]
            if (typeof option !== 'string' || !option) return null
            return (
              <li key={letter} dangerouslySetInnerHTML={{ __html: renderKatex(option) }} />
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

export function TestPaperDocument({ test, branding }: Props) {
  const grouped: { label: string | null; rows: TestWithQuestions['test_questions'] }[] = []
  for (const tq of test.test_questions) {
    const last = grouped[grouped.length - 1]
    if (!last || last.label !== tq.section_label) {
      grouped.push({ label: tq.section_label, rows: [tq] })
    } else {
      last.rows.push(tq)
    }
  }

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>{test.title}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body { font-family: 'Helvetica', 'Arial', sans-serif; color: #111; margin: 0; padding: 24px; }
              .paper-header { border-bottom: 2px solid ${brandColor(branding.brand_color_hex)}; padding-bottom: 8px; }
              .section-label { margin-top: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; color: ${brandColor(branding.brand_color_hex)}; }
              .question + .question { page-break-inside: avoid; }
              ol { margin: 4px 0; }
            `,
          }}
        />
      </head>
      <body>
        <HeaderBlock branding={branding} />
        <TestMeta test={test} />
        {grouped.map((group, gi) => {
          let runningIndex = grouped
            .slice(0, gi)
            .reduce((acc, g) => acc + g.rows.length, 0)
          return (
            <section key={gi}>
              {group.label ? <div className="section-label">{group.label}</div> : null}
              {group.rows.map((row) => {
                const node = <QuestionBlock key={row.id} index={runningIndex} row={row} />
                runningIndex++
                return node
              })}
            </section>
          )
        })}
      </body>
    </html>
  )
}
