// Polyfill DOM Canvas globals so `pdfjs-dist` (loaded transitively by
// `pdf-to-img`) doesn't crash with `ReferenceError: DOMMatrix is not
// defined` on Vercel's Node 20 serverless runtime.
//
// `pdfjs-dist`'s legacy build references DOMMatrix, DOMRect, DOMPoint,
// ImageData, and Path2D at module-load time (top-level), so the
// polyfills MUST be installed before pdf-to-img is imported. The route
// achieves this by importing this file before pdf-to-img.
//
// `@napi-rs/canvas` ships pure Rust + WASM implementations of these
// types — no native compilation step, no Cairo/libpng system deps, no
// post-install hook to fail on Vercel.

import {
  DOMMatrix,
  DOMPoint,
  DOMRect,
  ImageData,
  Path2D,
} from '@napi-rs/canvas'

const g = globalThis as unknown as Record<string, unknown>

if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = DOMMatrix
if (typeof g.DOMPoint === 'undefined') g.DOMPoint = DOMPoint
if (typeof g.DOMRect === 'undefined') g.DOMRect = DOMRect
if (typeof g.ImageData === 'undefined') g.ImageData = ImageData
if (typeof g.Path2D === 'undefined') g.Path2D = Path2D
