// Note: react-dom/server and puppeteer are dynamically imported inside
// generateTestPDF below — Next.js App Router rejects top-level imports of
// react-dom/server in server modules ("You're importing a component that
// imports react-dom/server"). Dynamic import sidesteps the build-time check
// without changing runtime behaviour.
import * as React from 'react'
import { getInstituteBranding, getTestWithQuestions, resolveLogoSignedUrl, type Branding } from './branding'
import { TestPaperDocument } from './TestPaperDocument'

const KATEX_CSS_PATH = 'node_modules/katex/dist/katex.min.css'

function buildHeaderTemplate(branding: Branding): string {
  return `
    <div style="font-size:8px; width:100%; padding:0 15mm; color:#666; display:flex; justify-content:space-between;">
      <span>${escapeHtml(branding.inst_name)}</span>
      <span>${branding.tagline ? escapeHtml(branding.tagline) : ''}</span>
    </div>
  `
}

function buildFooterTemplate(branding: Branding): string {
  return `
    <div style="font-size:8px; width:100%; padding:0 15mm; color:#666; display:flex; justify-content:space-between;">
      <span>${escapeHtml(branding.footer_text)}</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
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

export async function generateTestPDF(testId: string): Promise<Buffer> {
  const test = await getTestWithQuestions(testId)
  if (!test) throw new Error(`Test ${testId} not found`)

  const branding = await getInstituteBranding()
  const signedLogo = await resolveLogoSignedUrl(branding.logo_url)
  const brandingWithLogo: Branding = { ...branding, logo_url: signedLogo }

  const { renderToStaticMarkup } = await import('react-dom/server')
  const puppeteer = (await import('puppeteer')).default

  const html =
    '<!doctype html>' +
    renderToStaticMarkup(React.createElement(TestPaperDocument, { test, branding: brandingWithLogo }))

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.addStyleTag({ path: KATEX_CSS_PATH })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(brandingWithLogo),
      footerTemplate: buildFooterTemplate(brandingWithLogo),
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

export { buildHeaderTemplate, buildFooterTemplate }
