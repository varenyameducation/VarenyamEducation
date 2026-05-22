import katex from 'katex'

// Splits a question body into prose / inline-math / display-math / image
// segments. Recognized delimiters:
//   \( ... \)       inline math   (Gemini's primary output)
//   \[ ... \]       display math  (Gemini's display math)
//   $$ ... $$       display math  (legacy / Markdown)
//   [[IMG:url]]     image placeholder
// Single-`$` delimiters are intentionally NOT recognized — they collide with
// prose currency markers ("costs $5") often enough that the false-positive
// rate isn't worth the convenience.

export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'img'; url: string }
  | { kind: 'inline-math'; latex: string }
  | { kind: 'display-math'; latex: string }

const SEGMENT_RE =
  /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\[\[IMG:([^\]]+)\]\]/g

const IMG_RE = /\[\[IMG:([^\]]+)\]\]/g

export function splitBody(body: string | null | undefined): BodySegment[] {
  const src = body ?? ''
  const segments: BodySegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  SEGMENT_RE.lastIndex = 0
  while ((m = SEGMENT_RE.exec(src))) {
    if (m.index > last) {
      segments.push({ kind: 'text', text: src.slice(last, m.index) })
    }
    if (m[1] !== undefined) {
      segments.push({ kind: 'inline-math', latex: m[1] })
    } else if (m[2] !== undefined) {
      segments.push({ kind: 'display-math', latex: m[2] })
    } else if (m[3] !== undefined) {
      segments.push({ kind: 'display-math', latex: m[3] })
    } else if (m[4] !== undefined) {
      segments.push({ kind: 'img', url: m[4] })
    }
    last = SEGMENT_RE.lastIndex
  }
  if (last < src.length) {
    segments.push({ kind: 'text', text: src.slice(last) })
  }
  return segments
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMathHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(displayMode ? `\\[${latex}\\]` : `\\(${latex}\\)`)
  }
}

// Render the non-image segments to a single HTML string. Inline math renders
// inline; display math is wrapped in a centered block. Image placeholders are
// stripped — use the `RenderedBody` React component if you need <img> tags.
export function renderBodyHtml(body: string | null | undefined): string {
  return splitBody(body)
    .map((seg) => {
      switch (seg.kind) {
        case 'text':
          return escapeHtml(seg.text)
        case 'inline-math':
          return renderMathHtml(seg.latex, false)
        case 'display-math':
          return `<div class="katex-display-block">${renderMathHtml(seg.latex, true)}</div>`
        case 'img':
          return ''
      }
    })
    .join('')
}

export function stripImagePlaceholders(body: string | null | undefined): string {
  if (!body) return ''
  return body.replace(IMG_RE, '[image]')
}
