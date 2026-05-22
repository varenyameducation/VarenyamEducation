import * as React from 'react'
import katex from 'katex'
import type { Branding } from './branding'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

export type PaperQuestion = {
  id: string
  question_type: string
  question_body: string
  option_a?: string | null
  option_b?: string | null
  option_c?: string | null
  option_d?: string | null
  marks_correct: number | string
}

export type PaperRow = {
  id: string
  position: number
  section_label: string | null
  marks_override: number | string | null
  question: PaperQuestion
}

export type PaperMeta = {
  title: string
  course_name?: string | null
  subject?: string | null
  exam_type?: string | null
  duration_minutes: number
  total_marks: number
  instructions?: string | null
}

function renderKatex(source: string | null | undefined): string {
  if (!source) return ''
  const hasLatex = /\\[a-zA-Z]+|[\^_{}]|\$[^$]+\$/.test(source)
  if (!hasLatex) return escapeHtml(source)
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

// Render a body that may contain inline `[[IMG:<url>]]` placeholders plus
// LaTeX-ish text. Produces a single HTML string ready for
// dangerouslySetInnerHTML. Images use a hard max-height so they don't blow
// out the page layout in the PDF.
function renderBodyWithImages(source: string | null | undefined): string {
  if (!source) return ''
  const parts: string[] = []
  const re = /\[\[IMG:([^\]]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m.index > last) parts.push(renderKatex(source.slice(last, m.index)))
    const url = m[1].replace(/"/g, '&quot;')
    parts.push(
      `<img src="${url}" alt="" style="display:block;max-width:100%;max-height:200px;margin:6px 0;" />`,
    )
    last = re.lastIndex
  }
  if (last < source.length) parts.push(renderKatex(source.slice(last)))
  return parts.join('')
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

function examTypeLabel(t: string | null | undefined): string | null {
  if (!t) return null
  return t.toUpperCase()
}

function groupBySection(rows: PaperRow[]): { label: string | null; rows: PaperRow[] }[] {
  const groups: { label: string | null; rows: PaperRow[] }[] = []
  for (const tq of rows) {
    const last = groups[groups.length - 1]
    const label = tq.section_label?.trim() || null
    if (last && last.label === label) {
      last.rows.push(tq)
    } else {
      groups.push({ label, rows: [tq] })
    }
  }
  return groups
}

const styles = {
  page: {
    fontFamily: "'Times New Roman', 'Liberation Serif', serif",
    color: '#111',
    fontSize: 12,
    lineHeight: 1.5,
  } as React.CSSProperties,
  brandBar: (color: string) =>
    ({
      borderBottom: `2px solid ${color}`,
      paddingBottom: 8,
      marginBottom: 10,
    }) as React.CSSProperties,
  instName: (color: string) =>
    ({
      fontSize: 20,
      fontWeight: 700,
      color,
      textAlign: 'center',
      letterSpacing: 0.5,
    }) as React.CSSProperties,
  tagline: {
    fontSize: 11,
    textAlign: 'center',
    color: '#555',
    marginTop: 2,
  } as React.CSSProperties,
  metaTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 6,
    fontSize: 12,
  } as React.CSSProperties,
  metaCell: {
    padding: '2px 4px',
  } as React.CSSProperties,
  title: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 700,
    margin: '8px 0 4px',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  } as React.CSSProperties,
  rule: {
    border: 'none',
    borderTop: '1px solid #888',
    margin: '8px 0',
  } as React.CSSProperties,
  instructionsBox: (color: string) =>
    ({
      borderLeft: `3px solid ${color}`,
      background: '#f6f7fb',
      padding: '6px 10px',
      margin: '8px 0',
      fontSize: 11,
    }) as React.CSSProperties,
  instructionsTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  } as React.CSSProperties,
  sectionHeader: (color: string) =>
    ({
      marginTop: 14,
      paddingBottom: 4,
      borderBottom: `1px solid ${color}`,
      color,
      fontWeight: 700,
      fontSize: 13,
      textAlign: 'center' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    }) as React.CSSProperties,
  question: {
    marginTop: 10,
    pageBreakInside: 'avoid',
  } as React.CSSProperties,
  qHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  } as React.CSSProperties,
  qNumber: {
    fontWeight: 700,
    minWidth: 28,
  } as React.CSSProperties,
  qMarks: {
    fontSize: 11,
    color: '#444',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  qBody: {
    marginLeft: 28,
    marginTop: 2,
  } as React.CSSProperties,
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px 16px',
    marginLeft: 28,
    marginTop: 4,
  } as React.CSSProperties,
  option: {
    fontSize: 12,
  } as React.CSSProperties,
  answerLine: {
    borderBottom: '1px dotted #888',
    height: 18,
    marginTop: 6,
    marginLeft: 28,
  } as React.CSSProperties,
  footer: {
    marginTop: 20,
    paddingTop: 6,
    borderTop: '1px solid #aaa',
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  } as React.CSSProperties,
}

function QuestionRow({ index, row }: { index: number; row: PaperRow }) {
  const q = row.question
  const marks = row.marks_override ?? q.marks_correct
  const isMcq = q.question_type === 'mcq' || q.question_type === 'multi_select'
  const nonMcqAnswerLines =
    q.question_type === 'numerical'
      ? 1
      : q.question_type === 'matrix_match'
        ? 0
        : Math.min(4, Math.max(2, Math.ceil(Number(marks) || 1)))

  return (
    <div style={styles.question}>
      <div style={styles.qHead}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <span style={styles.qNumber}>Q{index}.</span>
          <span
            dangerouslySetInnerHTML={{ __html: renderBodyWithImages(q.question_body) }}
            style={{ flex: 1 }}
          />
        </div>
        <span style={styles.qMarks}>[{String(marks)}]</span>
      </div>
      {isMcq ? (
        <div style={styles.optionsGrid}>
          {OPTION_LETTERS.map((letter) => {
            const value = (q as Record<string, unknown>)[
              `option_${letter.toLowerCase()}`
            ]
            if (typeof value !== 'string' || !value) return null
            return (
              <div key={letter} style={styles.option}>
                <strong>({letter})</strong>{' '}
                <span dangerouslySetInnerHTML={{ __html: renderKatex(value) }} />
              </div>
            )
          })}
        </div>
      ) : (
        Array.from({ length: nonMcqAnswerLines }).map((_, i) => (
          <div key={i} style={styles.answerLine} />
        ))
      )}
    </div>
  )
}

export function PaperTemplate({
  meta,
  rows,
  branding,
}: {
  meta: PaperMeta
  rows: PaperRow[]
  branding: Branding
}) {
  const accent = brandColor(branding.brand_color_hex)
  const groups = groupBySection(rows)
  const examLabel = examTypeLabel(meta.exam_type)

  return (
    <div style={styles.page}>
      <div style={styles.brandBar(accent)}>
        <div style={styles.instName(accent)}>{branding.inst_name}</div>
        {branding.tagline ? <div style={styles.tagline}>{branding.tagline}</div> : null}
      </div>

      <table style={styles.metaTable}>
        <tbody>
          <tr>
            <td style={styles.metaCell}>
              {meta.course_name ? <><strong>Course:</strong> {meta.course_name}</> : null}
            </td>
            <td style={{ ...styles.metaCell, textAlign: 'right' }}>
              <strong>Time:</strong> {meta.duration_minutes} min
            </td>
          </tr>
          <tr>
            <td style={styles.metaCell}>
              {meta.subject ? <><strong>Subject:</strong> {meta.subject}</> : null}
              {examLabel ? (
                <span style={{ marginLeft: 12 }}>
                  <strong>Exam:</strong> {examLabel}
                </span>
              ) : null}
            </td>
            <td style={{ ...styles.metaCell, textAlign: 'right' }}>
              <strong>Maximum Marks:</strong> {meta.total_marks}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={styles.title}>{meta.title || 'Untitled Test'}</div>

      {meta.instructions ? (
        <div style={styles.instructionsBox(accent)}>
          <div style={styles.instructionsTitle}>General Instructions</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{meta.instructions}</div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div
          style={{
            border: '1px dashed #bbb',
            padding: 24,
            textAlign: 'center',
            color: '#888',
            marginTop: 12,
          }}
        >
          No questions selected.
        </div>
      ) : (
        groups.map((group, gi) => {
          const startIndex =
            groups.slice(0, gi).reduce((acc, g) => acc + g.rows.length, 0) + 1
          return (
            <section key={gi}>
              {group.label ? (
                <div style={styles.sectionHeader(accent)}>{group.label}</div>
              ) : gi === 0 ? null : (
                <hr style={styles.rule} />
              )}
              {group.rows.map((row, ri) => (
                <QuestionRow key={row.id} index={startIndex + ri} row={row} />
              ))}
            </section>
          )
        })
      )}

      <div style={styles.footer}>
        {branding.footer_text} · {branding.inst_name}
      </div>
    </div>
  )
}
