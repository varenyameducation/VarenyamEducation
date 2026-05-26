import * as React from 'react'
import katex from 'katex'
import type { Branding } from './branding'

// --- Brand palette (locked by orchestrator). Reads `brand_color_hex` from
// InstituteBranding; falls back to the new Varenyam teal if the row is
// missing or still carries the old `1B3A6B` navy default.
const BRAND_DEFAULT = '#0E6E84' // primary teal
const BRAND_LEGACY = '1B3A6B' // old navy default we override
const BRAND_RED = '#D63D2F' // horizontal dividers, marks chip border
const COLOR_TEXT = '#1F2937'
const COLOR_SUBTLE = '#6B7280'
const COLOR_HAIRLINE = '#D1D5DB'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

// Bundled Varenyam icon-only mark — served from /public/brand by Next.js in
// the browser preview, and inlined as a data URL by pdf.ts before Puppeteer
// renders the page (Puppeteer's setContent has no base URL).
const DEFAULT_LOGO_SRC = '/brand/varenyam-logo-mark.png'

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
  // Optional board/standard label, rendered bold in brand teal above the
  // meta grid (e.g. "Board: CBSE (Standard)"). Falls back to a synthesised
  // "Course (Class N)" if not provided.
  board_label?: string | null
  // Optional topic label rendered in the meta grid alongside Time / Marks.
  topic?: string | null
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
// LaTeX-ish text. Adjacent image placeholders sit side-by-side; each image
// is capped at 200×140 px to match the reference paper.
function renderBodyWithImages(source: string | null | undefined): string {
  if (!source) return ''
  const re = /\[\[IMG:([^\]]+)\]\]/g
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
    const urls: string[] = [p.url]
    let j = i + 1
    while (j < parts.length) {
      const next = parts[j]
      if (next.kind === 'img') {
        urls.push(next.url)
        j++
        continue
      }
      if (next.value.trim() === '') {
        j++
        continue
      }
      break
    }
    const imgStyle =
      'display:block;max-width:200px;max-height:140px;width:auto;height:auto;object-fit:contain;'
    if (urls.length === 1) {
      const url = urls[0].replace(/"/g, '&quot;')
      out.push(
        `<figure style="margin:6px auto;text-align:center;"><img src="${url}" alt="" style="${imgStyle}margin:0 auto;" /></figure>`,
      )
    } else {
      const inner = urls
        .map(
          (u) =>
            `<img src="${u.replace(/"/g, '&quot;')}" alt="" style="${imgStyle}" />`,
        )
        .join('')
      out.push(
        `<figure style="display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:6px 0;">${inner}</figure>`,
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

// Read brand color from branding row. Treat the legacy navy default and
// missing value as "use the new Varenyam teal".
function resolveBrandColor(branding: Branding): string {
  const raw = (branding.brand_color_hex ?? '').replace(/^#/, '')
  if (!raw || raw.toUpperCase() === BRAND_LEGACY) return BRAND_DEFAULT
  return raw.startsWith('#') ? raw : `#${raw}`
}

function tintedFromBrand(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#F4F6FA'
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  const mix = (c: number) => Math.round(c * 0.1 + 255 * 0.9)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
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

type MarkingSchemeRow = {
  section: string
  marksPerQuestion: number | string
  numQuestions: number
  total: number
}

function buildMarkingScheme(rows: PaperRow[]): MarkingSchemeRow[] {
  const groups = groupBySection(rows)
  return groups.map((g, idx) => {
    const marks = g.rows.map((r) => Number(r.marks_override ?? r.question.marks_correct) || 0)
    const total = marks.reduce((a, b) => a + b, 0)
    const uniform = marks.every((m) => m === marks[0]) ? marks[0] : null
    return {
      section: g.label ?? `Section ${String.fromCharCode(65 + idx)}`,
      marksPerQuestion: uniform != null ? uniform : 'Mixed',
      numQuestions: g.rows.length,
      total,
    }
  })
}

const DEFAULT_INSTRUCTIONS = [
  'All questions are compulsory.',
  'Read each question carefully before answering.',
  'Write answers in the space provided; use the rough sheet for working.',
  'Calculators are not allowed unless explicitly stated.',
  'Marks for each question are indicated on the right.',
]

function parseInstructions(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_INSTRUCTIONS
  const lines = raw
    .split(/\r?\n|•|·/u)
    .map((l) => l.replace(/^[\s\d.)\-]+/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : DEFAULT_INSTRUCTIONS
}

export function PaperTemplate({
  meta,
  rows,
  branding,
  logoSrc = DEFAULT_LOGO_SRC,
}: {
  meta: PaperMeta
  rows: PaperRow[]
  branding: Branding
  // Override the logo source. PDF pipeline passes a data URL here so
  // Puppeteer can render without external fetches.
  logoSrc?: string
}) {
  const brand = resolveBrandColor(branding)
  const groups = groupBySection(rows)
  const markingScheme = buildMarkingScheme(rows)
  const instructions = parseInstructions(meta.instructions)
  const effectiveLogo = branding.logo_url || logoSrc

  const boardLine =
    meta.board_label?.trim() ||
    (meta.course_name ? `${meta.course_name} (Standard)` : null)

  return (
    <div
      style={{
        fontFamily: "'Georgia', 'Liberation Serif', serif",
        color: COLOR_TEXT,
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      {/* Header: icon-only logo + centered inst name. No tagline. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          paddingBottom: 8,
          borderBottom: `1px solid ${BRAND_RED}`,
        }}
      >
        <div style={{ width: 50, flexShrink: 0 }}>
          {effectiveLogo ? (
            <img
              src={effectiveLogo}
              alt="logo"
              style={{ width: 'auto', height: 44, display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 50,
                height: 44,
                border: `1px dashed ${brand}`,
                color: brand,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1.2,
              }}
            >
              LOGO
            </div>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: brand,
              letterSpacing: 0.4,
              lineHeight: 1.05,
            }}
          >
            {branding.inst_name}
          </div>
        </div>
        <div style={{ width: 50, flexShrink: 0 }} />
      </header>

      {/* Board / standard line */}
      {boardLine ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: brand,
            margin: '10px 0 6px',
          }}
        >
          Board: {boardLine}
        </div>
      ) : null}

      {/* Title */}
      <h1
        style={{
          fontSize: 16,
          fontWeight: 700,
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          margin: '6px 0 12px',
          color: COLOR_TEXT,
        }}
      >
        {meta.title || 'Untitled Test'}
      </h1>

      {/* 3-col meta grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          rowGap: 4,
          columnGap: 16,
          fontSize: 11,
          marginBottom: 10,
        }}
      >
        <div>
          <span style={{ fontWeight: 700, color: brand }}>Time:</span>{' '}
          {meta.duration_minutes} min
        </div>
        <div>
          <span style={{ fontWeight: 700, color: brand }}>Maximum Marks:</span>{' '}
          {meta.total_marks}
        </div>
        <div>
          <span style={{ fontWeight: 700, color: brand }}>Topic:</span>{' '}
          {meta.topic ?? meta.subject ?? '—'}
        </div>
      </div>

      {/* General Instructions */}
      <section
        style={{
          background: tintedFromBrand(brand),
          borderLeft: `3px solid ${brand}`,
          padding: '8px 12px',
          margin: '8px 0 12px',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: brand,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 4,
          }}
        >
          General Instructions
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 10.5,
            color: COLOR_TEXT,
          }}
        >
          {instructions.map((line, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {line}
            </li>
          ))}
        </ol>
      </section>

      {/* Marking Scheme table */}
      {markingScheme.length > 0 && (
        <section style={{ margin: '6px 0 12px' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 11,
              color: brand,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            Marking Scheme
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 10.5,
              border: `1px solid ${COLOR_HAIRLINE}`,
            }}
          >
            <thead>
              <tr style={{ background: tintedFromBrand(brand) }}>
                {[
                  'Section',
                  'Marks / Question',
                  '# of Questions',
                  'Total Marks',
                  'Marks Obtained',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      border: `1px solid ${COLOR_HAIRLINE}`,
                      padding: '4px 8px',
                      textAlign: 'left',
                      color: brand,
                      fontWeight: 700,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markingScheme.map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{r.section}</td>
                  <td style={tdStyle}>{r.marksPerQuestion}</td>
                  <td style={tdStyle}>{r.numQuestions}</td>
                  <td style={tdStyle}>{r.total}</td>
                  <td style={{ ...tdStyle, minWidth: 70 }} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Sections + questions */}
      {groups.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${COLOR_HAIRLINE}`,
            padding: 24,
            textAlign: 'center',
            color: COLOR_SUBTLE,
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
              <SectionBar brand={brand} label={group.label ?? `Section ${String.fromCharCode(65 + gi)}`} />
              {group.rows.map((row, ri) => (
                <QuestionRow
                  key={row.id}
                  index={startIndex + ri}
                  row={row}
                  brand={brand}
                />
              ))}
            </section>
          )
        })
      )}
    </div>
  )
}

const tdStyle: React.CSSProperties = {
  border: `1px solid ${COLOR_HAIRLINE}`,
  padding: '4px 8px',
  textAlign: 'left',
  color: COLOR_TEXT,
}

function SectionBar({ brand, label }: { brand: string; label: string }) {
  return (
    <div
      style={{
        background: brand,
        color: '#fff',
        padding: '5px 12px',
        marginTop: 14,
        marginBottom: 6,
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}

function QuestionRow({ index, row, brand }: { index: number; row: PaperRow; brand: string }) {
  const q = row.question
  const marks = row.marks_override ?? q.marks_correct
  const isMcq = q.question_type === 'mcq' || q.question_type === 'multi_select'

  return (
    <div
      style={{
        marginBottom: 12,
        pageBreakInside: 'avoid',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <span style={{ fontWeight: 700, minWidth: 26, flexShrink: 0 }}>Q{index}.</span>
        <span
          style={{ flex: 1 }}
          dangerouslySetInnerHTML={{ __html: renderBodyWithImages(q.question_body) }}
        />
      </div>
      {isMcq ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: 32,
            rowGap: 4,
            marginLeft: 28,
            marginTop: 4,
            fontSize: 11,
          }}
        >
          {OPTION_LETTERS.map((letter) => {
            const value = (q as Record<string, unknown>)[
              `option_${letter.toLowerCase()}`
            ]
            if (typeof value !== 'string' || !value) return null
            return (
              <div key={letter}>
                <strong>({letter})</strong>{' '}
                <span dangerouslySetInnerHTML={{ __html: renderKatex(value) }} />
              </div>
            )
          })}
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
        <span
          style={{
            display: 'inline-block',
            border: `1px solid ${BRAND_RED}`,
            color: BRAND_RED,
            borderRadius: 999,
            padding: '0 8px',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          [ {String(marks)} ]
        </span>
      </div>
      {/* Reference to brand so a future option can colour something with it
          (e.g. a hover state in the React preview) without re-plumbing. */}
      <span style={{ display: 'none' }} data-brand={brand} />
    </div>
  )
}
