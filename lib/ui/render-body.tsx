'use client'

import * as React from 'react'
import katex from 'katex'

// Splits question_body into: prose | inline-math | display-math | img.
// Each math segment is rendered with katex in the correct displayMode.
// Each prose segment is HTML-escaped (no markdown). Images get a real <img>.
//
// Recognized delimiters:
//   \( ... \)   inline math
//   \[ ... \]   display math
//   $$ ... $$   display math (alt)
//   $ ... $     inline math (single-line only; greedy across newlines is avoided)
//   [[IMG:url]] image placeholder (DOCX importer emits these)

const SEGMENT_RE =
  /(\[\[IMG:[^\]]+\]\]|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
const IMG_RE = /\[\[IMG:([^\]]+)\]\]/g

type Segment =
  | { kind: 'prose'; text: string }
  | { kind: 'inline-math'; tex: string }
  | { kind: 'display-math'; tex: string }
  | { kind: 'img'; url: string }

function splitBody(body: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  let m: RegExpExecArray | null
  SEGMENT_RE.lastIndex = 0
  while ((m = SEGMENT_RE.exec(body))) {
    if (m.index > last) {
      segments.push({ kind: 'prose', text: body.slice(last, m.index) })
    }
    const tok = m[0]
    if (tok.startsWith('[[IMG:')) {
      segments.push({ kind: 'img', url: tok.slice(6, -2) })
    } else if (tok.startsWith('\\[')) {
      segments.push({ kind: 'display-math', tex: tok.slice(2, -2) })
    } else if (tok.startsWith('\\(')) {
      segments.push({ kind: 'inline-math', tex: tok.slice(2, -2) })
    } else if (tok.startsWith('$$')) {
      segments.push({ kind: 'display-math', tex: tok.slice(2, -2) })
    } else {
      segments.push({ kind: 'inline-math', tex: tok.slice(1, -1) })
    }
    last = SEGMENT_RE.lastIndex
  }
  if (last < body.length) {
    segments.push({ kind: 'prose', text: body.slice(last) })
  }
  return segments
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(tex)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain-HTML helper for compact previews (test creator picker / sortable list)
// that already do their own truncation and don't want React components.
export function renderBodyToHtml(body: string | null | undefined): string {
  if (!body) return ''
  return splitBody(body)
    .map((seg) => {
      if (seg.kind === 'prose') return escapeHtml(seg.text)
      if (seg.kind === 'inline-math') return renderMath(seg.tex, false)
      if (seg.kind === 'display-math') return renderMath(seg.tex, true)
      // Images are stripped to a marker in compact mode — call sites that want
      // real images should use the <RenderedBody> component instead.
      return '[image]'
    })
    .join('')
}

export function RenderedBody({
  body,
  className,
}: {
  body: string | null | undefined
  className?: string
}) {
  const segments = React.useMemo(() => splitBody(body ?? ''), [body])
  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'img') {
          return (
            <img
              key={i}
              src={seg.url}
              alt=""
              className="my-2 max-h-72 max-w-full rounded border"
            />
          )
        }
        if (seg.kind === 'prose') {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: escapeHtml(seg.text) }}
            />
          )
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: renderMath(seg.tex, seg.kind === 'display-math'),
            }}
          />
        )
      })}
    </div>
  )
}

export function stripImagePlaceholders(body: string | null | undefined): string {
  if (!body) return ''
  return body.replace(IMG_RE, '[image]')
}
