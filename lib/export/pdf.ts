// Note: react-dom/server is dynamically imported inside generateTestPDF
// below — Next.js App Router rejects top-level imports of react-dom/server
// in server modules ("You're importing a component that imports
// react-dom/server"). Dynamic import sidesteps the build-time check without
// changing runtime behaviour. PDF rendering itself is delegated to the
// Browserless.io REST API (no local chromium/puppeteer), so the heavy
// browser binary — and its missing libnss3.so on Vercel's Lambda image —
// is out of the picture entirely.
import * as React from 'react'
import {
  getInstituteBranding,
  getTestWithQuestions,
  resolveLogoSignedUrl,
  type Branding,
} from './branding'
import { TestPaperDocument } from './TestPaperDocument'

// Load KaTeX CSS from jsDelivr at render time inside Browserless's browser
// instead of reading from /var/task — Vercel's function tracer was dropping
// the local node_modules/katex/dist/katex.min.css file (ENOENT → 500). The
// pinned version must match the katex npm dep's major.minor so the CSS lines
// up with the JS-rendered markup; the 0.16.x line is API-stable.
const KATEX_CDN_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css'
const BRAND_DEFAULT = '#0E6E84' // primary teal
const BRAND_LEGACY = '1B3A6B'

function brandHex(branding: Branding): string {
  const raw = (branding.brand_color_hex ?? '').replace(/^#/, '')
  if (!raw || raw.toUpperCase() === BRAND_LEGACY) return BRAND_DEFAULT
  return raw.startsWith('#') ? raw : `#${raw}`
}

function buildHeaderTemplate(): string {
  // Body block renders the full branded header on page 1; chrome header
  // is intentionally empty so subsequent pages don't double up the logo.
  return `<div style="font-size:0; width:100%;"></div>`
}

function buildFooterTemplate(branding: Branding): string {
  const accent = brandHex(branding)
  return `
    <div style="font-size:8px; width:100%; padding:4px 15mm 0; color:#6B7280; text-align:center; border-top:0.75pt solid ${escapeHtml(accent)}; font-family: Georgia, serif;">
      <span>${escapeHtml(branding.footer_text)}</span>
      <span style="margin:0 6px;">·</span>
      <span>${escapeHtml(branding.inst_name)}</span>
      <span style="margin:0 6px;">·</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Build an absolute public URL for the default brand logo. Browserless's
// headless browser fetches this directly over HTTP — no base64-in-JSON that
// can be truncated through the request body, and no disk read of a public/
// asset that isn't reliably present on Vercel's function filesystem (the old
// approach silently fell back to a stale signed URL → Chrome's 14×16
// broken-image placeholder). Requires NEXT_PUBLIC_APP_URL; returns null if
// unset so the caller surfaces a clear failure instead of a broken image.
function getDefaultLogoPublicUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/brand/varenyam-logo-mark.png`
}

export async function generateTestPDF(testId: string): Promise<Buffer> {
  const test = await getTestWithQuestions(testId)
  if (!test) throw new Error(`Test ${testId} not found`)

  const branding = await getInstituteBranding()
  const signedLogo = await resolveLogoSignedUrl(branding.logo_url)
  const brandingWithLogo: Branding = { ...branding, logo_url: signedLogo }

  // Default logo (Varenyam icon-only mark) → public URL for Browserless to
  // fetch. PaperTemplate prefers branding.logo_url if the institute has set
  // one; otherwise it falls back to this prop.
  const defaultLogoUrl = getDefaultLogoPublicUrl() ?? undefined

  const { renderToStaticMarkup } = await import('react-dom/server')

  const html =
    '<!doctype html>' +
    renderToStaticMarkup(
      React.createElement(TestPaperDocument, {
        test,
        branding: brandingWithLogo,
        logoSrc: defaultLogoUrl,
      }),
    )

  // Render via Browserless.io's managed Puppeteer (/pdf REST endpoint).
  // Five attempts at bundling @sparticuz/chromium into the Vercel function
  // all died on `libnss3.so: cannot open shared object file` — Vercel's
  // Lambda image ships neither the system libs chromium dynamically links
  // nor a tarball that bundles them. Offloading to Browserless sidesteps the
  // whole class of problem: we POST the HTML and get a PDF back.
  const browserlessToken = process.env.BROWSERLESS_TOKEN
  if (!browserlessToken) {
    throw new Error(
      'BROWSERLESS_TOKEN is not set. Sign up at browserless.io, copy your API token, ' +
        'and add it to Vercel env vars (Production scope).',
    )
  }

  const browserlessUrl = process.env.BROWSERLESS_URL ?? 'https://chrome.browserless.io'

  const res = await fetch(`${browserlessUrl}/pdf?token=${browserlessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      options: {
        format: 'letter',
        printBackground: true,
        // Margins match the reference DOCX: narrow top + right, comfortable
        // left + bottom. Width budget after margins is ~18cm on Letter.
        margin: { top: '14mm', bottom: '18mm', left: '25mm', right: '6mm' },
        displayHeaderFooter: true,
        headerTemplate: buildHeaderTemplate(),
        footerTemplate: buildFooterTemplate(brandingWithLogo),
      },
      addStyleTag: [{ url: KATEX_CDN_URL }],
      gotoOptions: { waitUntil: 'domcontentloaded' },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Browserless returned ${res.status}: ${detail.slice(0, 500)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export { buildHeaderTemplate, buildFooterTemplate }
