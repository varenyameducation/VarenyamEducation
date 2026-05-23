'use client'

import * as React from 'react'
import katex from 'katex'

// Shared body renderer for question text. Splits on [[IMG:url]] placeholders
// and renders each non-image segment via KaTeX (when LaTeX-ish tokens are
// detected, otherwise as plain escaped text).
//
// The `[[IMG:<absolute-or-storage-path>]]` placeholder is emitted by the DOCX
// importer; storage paths are converted to absolute URLs upstream so this
// component can just drop them into an <img>.

const LATEX_TOKEN = /\\[a-zA-Z]+|[\^_{}]|\$[^$]+\$/
const IMG_RE = /\[\[IMG:([^\]]+)\]\]/g

function renderInlineHtml(text: string): string {
  if (!text) return ''
  if (!LATEX_TOKEN.test(text)) return escapeHtml(text)
  try {
    return katex.renderToString(text, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(text)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
      {segments.map((seg, i) =>
        seg.kind === 'img' ? (
          <img
            key={i}
            src={seg.url}
            alt=""
            className="my-2 max-h-72 max-w-full rounded border"
          />
        ) : (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderInlineHtml(seg.text) }}
          />
        ),
      )}
    </div>
  )
}

type Segment = { kind: 'text'; text: string } | { kind: 'img'; url: string }

function splitBody(body: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  let m: RegExpExecArray | null
  IMG_RE.lastIndex = 0
  while ((m = IMG_RE.exec(body))) {
    if (m.index > last) {
      segments.push({ kind: 'text', text: body.slice(last, m.index) })
    }
    segments.push({ kind: 'img', url: m[1] })
    last = IMG_RE.lastIndex
  }
  if (last < body.length) {
    segments.push({ kind: 'text', text: body.slice(last) })
  }
  return segments
}
