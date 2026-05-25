import * as React from 'react'
import katex from 'katex'
import type { Branding } from './branding'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

const COLOR_TEXT = '#1a1a1a'
const COLOR_MUTED = '#666'
const COLOR_LINE = '#bbb'

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
// LaTeX-ish text. Adjacent image placeholders (no text between them, or only
// whitespace) render in a centered flex row so two narrow figures can sit
// side-by-side when they fit; otherwise they stack naturally. Each image is
// capped at 4cm tall so a single figure cannot eat the page.
function renderBodyWithImages(source: string | null | undefined): string {
  if (!source) return ''
  const re = /\[\[IMG:([^\]]+)\]\]/g
  // Tokenize into a sequence of {text} and {img} parts.
  type Part = { kind: 'text'; value: string } | { kind: 'img'; url: string }
  const parts: Part[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m.index > last) parts.push({ kind: 'text', value: source.slice(last, m.index) })
    parts.push({ kind: 'img', url: m[1] })
    last = re.lastIndex
  }
  if (last < source.length) parts.push({ kind: 'text', value: source.slice(last) })

  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (p.kind === 'text') {
      out.push(renderKatex(p.value))
      i++
      continue
    }
    // Collect a run of adjacent images (allowing whitespace-only text between).
    const urls: string[] = [p.url]
    let j = i + 1
    while (j < parts.length) {
      const next = parts[j]
      if (next.kind === 'img') {
        urls.push(next.url)
        j++
        continue
      }
      // text part — only swallow if pure whitespace
      if (next.value.trim() === '') {
        j++
        continue
      }
      break
    }
    if (urls.length === 1) {
      const url = urls[0].replace(/"/g, '&quot;')
      out.push(
        `<img src="${url}" alt="" style="display:block;max-width:100%;max-height:4cm;margin:4mm auto;" />`,
      )
    } else {
      const inner = urls
        .map(
          (u) =>
            `<img src="${u.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;max-height:4cm;display:block;" />`,
        )
        .join('')
      out.push(
        `<div style="display:flex;gap:8mm;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:4mm 0;">${inner}</div>`,
      )
    }
    i = j
  }
  return out.join('')
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

function tintedFromBrand(hex: string): string {
  // Produce a very light tint of the brand color for the instruction box
  // background. Falls back to a neutral grey-blue if hex parse fails.
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#f4f6fa'
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  // Mix 8% brand into white.
  const mix = (c: number) => Math.round(c * 0.08 + 255 * 0.92)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
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

function sectionBlueprintSummary(
  rows: PaperRow[],
  startIndex: number,
): string {
  if (rows.length === 0) return ''
  const endIndex = startIndex + rows.length - 1
  const marksList = rows.map((r) =>
    Number(r.marks_override ?? r.question.marks_correct) || 0,
  )
  const total = marksList.reduce((a, b) => a + b, 0)
  const uniform = marksList.every((m) => m === marksList[0]) ? marksList[0] : null
  const range = startIndex === endIndex ? `Q${startIndex}` : `Q${startIndex}–Q${endIndex}`
  if (uniform != null) {
    return `(${range} · ${rows.length} × ${uniform} = ${total} marks)`
  }
  return `(${range} · ${rows.length} questions · ${total} marks)`
}

function answerLineCount(qtype: string, marks: number): number {
  if (qtype === 'numerical') return 1
  if (qtype === 'matrix_match') return 0
  // 2 lines per mark, capped between 2 and 6.
  const lines = Math.ceil(marks * 2)
  return Math.min(6, Math.max(2, lines))
}

const styles = {
  page: {
    fontFamily: "'Times New Roman', 'Liberation Serif', serif",
    color: COLOR_TEXT,
    fontSize: 12,
    lineHeight: 1.45,
  } as React.CSSProperties,
  // Header layout: logo | name+tagline | roll/name stub
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  } as React.CSSProperties,
  logoSlot: {
    width: '24mm',
    minWidth: '24mm',
    height: '24mm',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  logoImg: {
    maxWidth: '24mm',
    maxHeight: '24mm',
    objectFit: 'contain' as const,
  } as React.CSSProperties,
  logoPlaceholder: (color: string) =>
    ({
      width: '24mm',
      height: '24mm',
      border: `1px dashed ${color}`,
      color,
      fontSize: 9,
      letterSpacing: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
    }) as React.CSSProperties,
  brandCenter: {
    flex: 1,
    textAlign: 'center' as const,
    paddingTop: 2,
  } as React.CSSProperties,
  instName: (color: string) =>
    ({
      fontSize: 18,
      fontWeight: 700,
      color,
      letterSpacing: 0.6,
      lineHeight: 1.1,
    }) as React.CSSProperties,
  tagline: {
    fontSize: 11,
    fontStyle: 'italic' as const,
    color: COLOR_MUTED,
    marginTop: 2,
  } as React.CSSProperties,
  rollStub: (color: string) =>
    ({
      width: '32mm',
      minWidth: '32mm',
      border: `1px solid ${color}`,
      fontSize: 9,
      color: COLOR_TEXT,
    }) as React.CSSProperties,
  rollRow: {
    padding: '4px 6px',
    minHeight: '8mm',
  } as React.CSSProperties,
  brandDivider: (color: string) =>
    ({
      borderTop: `2px solid ${color}`,
      margin: '6px 0 10px',
    }) as React.CSSProperties,
  metaRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    columnGap: 12,
    fontSize: 11,
    marginBottom: 4,
  } as React.CSSProperties,
  metaLeft: { textAlign: 'left' as const } as React.CSSProperties,
  metaCenter: { textAlign: 'center' as const } as React.CSSProperties,
  metaRight: { textAlign: 'right' as const } as React.CSSProperties,
  title: (color: string) =>
    ({
      textAlign: 'center' as const,
      fontSize: 14,
      fontWeight: 700,
      margin: '8px 0 0',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
      paddingBottom: 4,
      borderBottom: `1px solid ${color}`,
      width: 'fit-content',
      marginLeft: 'auto',
      marginRight: 'auto',
    }) as React.CSSProperties,
  instructionsBox: (color: string) =>
    ({
      borderLeft: `3px solid ${color}`,
      background: tintedFromBrand(color),
      padding: '6px 10px',
      margin: '10px 0',
      fontSize: 11,
    }) as React.CSSProperties,
  instructionsTitle: (color: string) =>
    ({
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      color,
      marginBottom: 2,
    }) as React.CSSProperties,
  sectionWrap: {
    margin: '14px 0 6px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  sectionRule: (color: string) =>
    ({
      borderTop: `1px solid ${color}`,
      margin: '0 0 4px',
    }) as React.CSSProperties,
  sectionBar: (color: string) =>
    ({
      display: 'inline-block',
      background: color,
      color: '#fff',
      padding: '3px 14px',
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
    }) as React.CSSProperties,
  sectionBlueprint: {
    fontSize: 10,
    color: COLOR_MUTED,
    marginTop: 3,
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  question: {
    marginTop: 8,
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
    minWidth: '11mm',
    fontFamily: "'Courier New', 'Liberation Mono', monospace",
    fontSize: 11.5,
  } as React.CSSProperties,
  qMarks: {
    fontSize: 10,
    color: COLOR_MUTED,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  qBodyWrap: {
    flex: 1,
    paddingLeft: 2,
  } as React.CSSProperties,
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    columnGap: 16,
    rowGap: 2,
    marginLeft: '11mm',
    marginTop: 4,
  } as React.CSSProperties,
  option: { fontSize: 12 } as React.CSSProperties,
  answerLine: {
    borderBottom: `1px dotted ${COLOR_LINE}`,
    height: 18,
    marginTop: 5,
    marginLeft: '11mm',
  } as React.CSSProperties,
}

function HeaderBlock({ branding, accent }: { branding: Branding; accent: string }) {
  return (
    <>
      <div style={styles.headerRow}>
        <div style={styles.logoSlot}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="logo" style={styles.logoImg} />
          ) : (
            <div style={styles.logoPlaceholder(accent)}>LOGO</div>
          )}
        </div>
        <div style={styles.brandCenter}>
          <div style={styles.instName(accent)}>{branding.inst_name}</div>
          {branding.tagline ? <div style={styles.tagline}>{branding.tagline}</div> : null}
        </div>
        <div style={styles.rollStub(accent)}>
          <div style={{ ...styles.rollRow, borderBottom: `1px solid ${accent}` }}>
            <strong>Roll No.</strong>
          </div>
          <div style={styles.rollRow}>
            <strong>Name</strong>
          </div>
        </div>
      </div>
      <div style={styles.brandDivider(accent)} />
    </>
  )
}

function MetaBlock({ meta, accent }: { meta: PaperMeta; accent: string }) {
  const examLabel = examTypeLabel(meta.exam_type)
  const centerBits: string[] = []
  if (meta.subject) centerBits.push(`Subject: ${meta.subject}`)
  if (examLabel) centerBits.push(`Exam: ${examLabel}`)
  return (
    <>
      <div style={styles.metaRow}>
        <div style={styles.metaLeft}>
          {meta.course_name ? <span><strong>Course:</strong> {meta.course_name}</span> : null}
        </div>
        <div style={styles.metaCenter}>
          {centerBits.length > 0 ? <span>{centerBits.join(' · ')}</span> : null}
        </div>
        <div style={styles.metaRight}>
          <strong>Duration:</strong> {meta.duration_minutes} min
          {' · '}
          <strong>Max Marks:</strong> {meta.total_marks}
        </div>
      </div>
      <div style={styles.title(accent)}>{meta.title || 'Untitled Test'}</div>
    </>
  )
}

function QuestionRow({ index, row }: { index: number; row: PaperRow }) {
  const q = row.question
  const marks = row.marks_override ?? q.marks_correct
  const marksNum = Number(marks) || 0
  const isMcq = q.question_type === 'mcq' || q.question_type === 'multi_select'
  const lines = answerLineCount(q.question_type, marksNum)

  return (
    <div style={styles.question}>
      <div style={styles.qHead}>
        <div style={{ display: 'flex', flex: 1, gap: 4 }}>
          <span style={styles.qNumber}>Q{index}.</span>
          <span
            style={styles.qBodyWrap}
            dangerouslySetInnerHTML={{ __html: renderBodyWithImages(q.question_body) }}
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
        Array.from({ length: lines }).map((_, i) => (
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

  return (
    <div style={styles.page}>
      <HeaderBlock branding={branding} accent={accent} />
      <MetaBlock meta={meta} accent={accent} />

      {meta.instructions ? (
        <div style={styles.instructionsBox(accent)}>
          <div style={styles.instructionsTitle(accent)}>General Instructions</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{meta.instructions}</div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${COLOR_LINE}`,
            padding: 24,
            textAlign: 'center',
            color: COLOR_MUTED,
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
                <div style={styles.sectionWrap}>
                  <div style={styles.sectionRule(accent)} />
                  <div style={styles.sectionBar(accent)}>{group.label}</div>
                  <div style={styles.sectionRule(accent)} />
                  <div style={styles.sectionBlueprint}>
                    {sectionBlueprintSummary(group.rows, startIndex)}
                  </div>
                </div>
              ) : null}
              {group.rows.map((row, ri) => (
                <QuestionRow key={row.id} index={startIndex + ri} row={row} />
              ))}
            </section>
          )
        })
      )}
    </div>
  )
}
