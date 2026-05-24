// Renders a PDF buffer to per-page PNG buffers via `pdf-to-img` (pdfjs-dist
// under the hood). Output PNGs feed into Gemini Vision in the opt-in PDF
// Vision path at /api/questions/import.
//
// Default scale is 2 (~150 DPI) — enough for board-paper math. When a page
// exceeds Gemini's 5 MiB inline-image cap, we re-render at 1.5 then 1.0
// before giving up.

// MUST come before `pdf-to-img`: installs DOMMatrix / Path2D / ImageData
// on globalThis so pdfjs-dist's top-level module evaluation doesn't crash
// with `ReferenceError: DOMMatrix is not defined` on Vercel's Node 20
// serverless runtime (Node doesn't expose these browser-only Canvas
// APIs by default).
import './pdfjs-node-polyfills'

import { pdf } from 'pdf-to-img'
import sharp from 'sharp'

export interface RenderedPage {
  pageNumber: number
  pngBuffer: Buffer
  width: number
  height: number
  scaleUsed: number
}

export interface RenderError {
  pageNumber: number
  reason: string
}

export interface RenderResult {
  pages: RenderedPage[]
  errors: RenderError[]
  totalPagesInDoc: number
}

export interface RenderOptions {
  maxPages?: number
  scale?: number
}

const DEFAULT_MAX_PAGES = 30
const DEFAULT_SCALE = 2
const FALLBACK_SCALES = [1.5, 1.0]
const GEMINI_INLINE_IMAGE_LIMIT = 5 * 1024 * 1024

async function readPngSize(buf: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata()
  return { width: meta.width ?? 0, height: meta.height ?? 0 }
}

export async function renderPdfPagesToPng(
  pdfBuffer: Buffer,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const initialScale = opts.scale ?? DEFAULT_SCALE

  const doc = await pdf(pdfBuffer, { scale: initialScale })
  const totalPagesInDoc = doc.length
  const pagesToRender = Math.min(totalPagesInDoc, maxPages)

  const pages: RenderedPage[] = []
  const errors: RenderError[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber++) {
      try {
        const initialBuf = await doc.getPage(pageNumber)
        if (initialBuf.length <= GEMINI_INLINE_IMAGE_LIMIT) {
          const { width, height } = await readPngSize(initialBuf)
          pages.push({
            pageNumber,
            pngBuffer: initialBuf,
            width,
            height,
            scaleUsed: initialScale,
          })
          continue
        }

        // Initial scale produced a too-large PNG. Re-open the doc at each
        // fallback scale and try until we fit under the cap.
        let placed = false
        for (const fbScale of FALLBACK_SCALES) {
          if (fbScale >= initialScale) continue
          const fbDoc = await pdf(pdfBuffer, { scale: fbScale })
          try {
            const fbBuf = await fbDoc.getPage(pageNumber)
            if (fbBuf.length <= GEMINI_INLINE_IMAGE_LIMIT) {
              const { width, height } = await readPngSize(fbBuf)
              pages.push({
                pageNumber,
                pngBuffer: fbBuf,
                width,
                height,
                scaleUsed: fbScale,
              })
              placed = true
              break
            }
          } finally {
            await fbDoc.destroy()
          }
        }
        if (!placed) {
          errors.push({
            pageNumber,
            reason: `Page exceeds Gemini 5 MiB cap even at scale 1.0 (${initialBuf.length} bytes)`,
          })
        }
      } catch (e) {
        errors.push({
          pageNumber,
          reason: `Render failed: ${e instanceof Error ? e.message : 'unknown error'}`,
        })
      }
    }
  } finally {
    await doc.destroy()
  }

  return { pages, errors, totalPagesInDoc }
}
