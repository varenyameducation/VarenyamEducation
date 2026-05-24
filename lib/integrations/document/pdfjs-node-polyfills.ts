// Polyfill the single browser global that `pdfjs-dist`'s legacy build
// references at module-load time so it doesn't crash with
// `ReferenceError: DOMMatrix is not defined` on Vercel's Node 20
// serverless runtime.
//
// IMPORTANT: only DOMMatrix is polyfilled. Path2D, ImageData,
// OffscreenCanvas etc. are deliberately left undefined — pdfjs-dist v5
// ships its own @napi-rs/canvas transitive dep for rendering and
// references those types through that dep, not through globalThis.
// An earlier version of this file polyfilled them via a separately-
// installed @napi-rs/canvas at a different version (0.1.55 vs the
// 0.1.100 pdfjs uses internally), which caused
//   `Value is none of these types String, Path` napi-rs type errors
// at render time. Don't reintroduce those polyfills unless a new
// `<X> is not defined` ReferenceError appears in the build logs.
//
// `dommatrix` is a pure-JS implementation — no native bindings, no
// platform-specific binaries, no Vercel bundling drama.

import DOMMatrixImpl from 'dommatrix'

const g = globalThis as unknown as Record<string, unknown>
if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = DOMMatrixImpl
