// Note: react-dom/server, puppeteer-core, and @sparticuz/chromium are
// dynamically imported inside generateTestPDF below — Next.js App Router
// rejects top-level imports of react-dom/server in server modules
// ("You're importing a component that imports react-dom/server"). Dynamic
// import sidesteps the build-time check without changing runtime
// behaviour, and keeps the chromium binary out of every build that
// doesn't touch this route.
import * as React from 'react'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getInstituteBranding,
  getTestWithQuestions,
  resolveLogoSignedUrl,
  type Branding,
} from './branding'
import { TestPaperDocument } from './TestPaperDocument'

const KATEX_CSS_PATH = 'node_modules/katex/dist/katex.min.css'
const BRAND_DEFAULT = '#0E6E84' // primary teal
const BRAND_LEGACY = '1B3A6B'

// On Vercel we use @sparticuz/chromium-min (JS-only, no bundled binary) and
// download the full self-contained chromium tarball — libnss3.so and every
// other shared lib baked in — into /tmp at runtime. The version in this URL
// MUST match the installed @sparticuz/chromium-min version exactly.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'

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

// Read the bundled Varenyam icon-only mark off disk and base64-encode it so
// Puppeteer can render the `<img src>` without going to the network.
// Cached after first read for the lifetime of the process.
let cachedBrandLogo: string | null = null
function readBrandLogoDataUrl(): string | null {
  if (cachedBrandLogo) return cachedBrandLogo
  try {
    const p = path.join(process.cwd(), 'public', 'brand', 'varenyam-logo-mark.png')
    const buf = fs.readFileSync(p)
    cachedBrandLogo = `data:image/png;base64,${buf.toString('base64')}`
    return cachedBrandLogo
  } catch {
    return null
  }
}

export async function generateTestPDF(testId: string): Promise<Buffer> {
  const test = await getTestWithQuestions(testId)
  if (!test) throw new Error(`Test ${testId} not found`)

  const branding = await getInstituteBranding()
  const signedLogo = await resolveLogoSignedUrl(branding.logo_url)
  const brandingWithLogo: Branding = { ...branding, logo_url: signedLogo }

  // Default logo (Varenyam icon-only mark) → inlined for Puppeteer. PaperTemplate
  // prefers branding.logo_url if the institute has set one; otherwise it
  // falls back to this prop.
  const defaultLogoDataUrl = readBrandLogoDataUrl() ?? undefined

  const { renderToStaticMarkup } = await import('react-dom/server')
  const puppeteer = (await import('puppeteer-core')).default

  const html =
    '<!doctype html>' +
    renderToStaticMarkup(
      React.createElement(TestPaperDocument, {
        test,
        branding: brandingWithLogo,
        logoSrc: defaultLogoDataUrl,
      }),
    )

  // Pick a chromium binary. On Vercel (and any other Linux serverless
  // host), @sparticuz/chromium ships a stripped-down Chromium tuned for
  // function-sized bundles. Locally we expect PUPPETEER_EXECUTABLE_PATH
  // in .env.local pointing at the system Chrome/Edge install (puppeteer-
  // core does not download a browser of its own).
  const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  let launchOptions: Parameters<typeof puppeteer.launch>[0]
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium-min')).default
    launchOptions = {
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    }
  } else {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    if (!executablePath) {
      throw new Error(
        'PUPPETEER_EXECUTABLE_PATH is not set. Point it at a local Chrome/Edge binary in .env.local (puppeteer-core does not download a browser), or run on Vercel where @sparticuz/chromium is used automatically.',
      )
    }
    launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath,
    }
  }

  const browser = await puppeteer.launch(launchOptions)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.addStyleTag({ path: KATEX_CSS_PATH })

    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      // Margins match the reference DOCX: narrow top + right, comfortable
      // left + bottom. Width budget after margins is ~18cm on Letter.
      margin: { top: '14mm', bottom: '18mm', left: '25mm', right: '6mm' },
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(),
      footerTemplate: buildFooterTemplate(brandingWithLogo),
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

export { buildHeaderTemplate, buildFooterTemplate }
