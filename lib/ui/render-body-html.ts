import katex from 'katex'

// Splits question_body into: prose | inline-math | display-math | img.
// Each math segment is rendered with katex in the correct displayMode.
// Each prose segment is HTML-escaped (no markdown). Images are surfaced as
// typed segments so server-side callers (paper export) can render their own
// <img> tags; the convenience helper renderBodyToHtml strips images to an
// [image] marker for compact text previews.
//
// Recognized delimiters:
//   \( ... \)   inline math
//   \[ ... \]   display math
//   $$ ... $$   display math (alt)
//   $ ... $     inline math (single-line only; greedy across newlines is avoided)
//   [[IMG:url]] image placeholder (DOCX importer emits these)
//
// This module is server-safe (no `'use client'`, no React imports) so it can
// be consumed from the paper export pipeline. The React wrapper lives in
// `./render-body.tsx` and re-exports the same helpers.

export const SEGMENT_RE =
  /(\[\[IMG:[^\]]+\]\]|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
export const IMG_RE = /\[\[IMG:([^\]]+)\]\]/g

export type BodySegment =
  | { kind: 'prose'; text: string }
  | { kind: 'inline-math'; tex: string }
  | { kind: 'display-math'; tex: string }
  | { kind: 'img'; url: string }

export function splitBody(body: string): BodySegment[] {
  const segments: BodySegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  SEGMENT_RE.lastIndex = 0
  while ((m = SEGMENT_RE.exec(body))) {
    if (m.index > last) {
      segments.push({ kind: 'prose', text: body.slice(last, m.index) })
    }
    const tok = m[0]
    if (tok.startsWith('[[IMG:')) {
      const rawUrl = tok.slice(6, -2)
      // Only allow Supabase storage URLs or relative paths. Drop unknown
      // external URLs to prevent tracking pixels and open-redirect abuse.
      const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      const isAllowed =
        (supabaseBase && rawUrl.startsWith(`${supabaseBase}/storage/`)) ||
        /^\//.test(rawUrl) ||
        !/^https?:\/\//i.test(rawUrl) // bare path like "draft/abc.png"
      if (isAllowed) segments.push({ kind: 'img', url: rawUrl })
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

export function renderMath(tex: string, displayMode: boolean): string {
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

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain-HTML helper for compact previews (test creator picker / sortable list,
// question card option pills, paper-export option values) that don't carry
// inline images. Image segments are stripped to '[image]' — callers that need
// real <img> tags should walk splitBody() themselves.
export function renderBodyToHtml(body: string | null | undefined): string {
  if (!body) return ''
  return splitBody(body)
    .map((seg) => {
      if (seg.kind === 'prose') return escapeHtml(seg.text)
      if (seg.kind === 'inline-math') return renderMath(seg.tex, false)
      if (seg.kind === 'display-math') return renderMath(seg.tex, true)
      return '[image]'
    })
    .join('')
}

export function stripImagePlaceholders(body: string | null | undefined): string {
  if (!body) return ''
  return body.replace(IMG_RE, '[image]')
}
