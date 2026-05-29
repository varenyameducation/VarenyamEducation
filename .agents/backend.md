# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — REWORK both export paths (DOCX math + PDF chromium)

**Severity: P0 — production exports are broken in two distinct ways.** After five failed @sparticuz/chromium hotfixes, orchestrator stopped iterating on Vercel-bundled chromium and inspected an actual DOCX produced from production. Both issues are now precisely diagnosed:

1. **DOCX**: all math content silently disappears (proven by inspecting `test-jee-test.docx` — text runs surrounding LaTeX delimiters survive, math segments vanish without even a fallback text). Root cause: `lib/export/docx.ts:67-89 renderLatexToPng()` wraps katex MathML output in `<foreignObject>` inside an SVG, then asks `sharp` to rasterize it. **libvips (sharp's engine) does not support `<foreignObject>`** — it produces a zero-content PNG without throwing, so the `try/catch` in `mathImageRun` never triggers the fallback. The DOCX gets an `ImageRun` with empty data → Word renders nothing.

2. **PDF**: 5 attempts on `@sparticuz/chromium` (v119, v121, v131, chromium-min runtime download, Node 20 pin) all failed with the same `libnss3.so: cannot open shared object file`. Confirmed not Node-version-related. The conclusion: Vercel's Lambda image doesn't ship the system libs chromium dynamically links, and the @sparticuz/chromium-min tarball does NOT bundle them either. We are giving up on in-bundle chromium and switching to **Browserless.io** (managed Puppeteer service) — the canonical solution for puppeteer-on-Vercel.

Two tracks, one branch, two commits, one PR.

---

## Track A — DOCX: swap math renderer from katex+foreignObject to MathJax SVG

### Diagnosis recap

Verified via Python unzip + XML inspection of an actual production DOCX. Math segments produce neither images nor fallback text — they're invisible. The current code:

```ts
// lib/export/docx.ts:67-89
const mathHtml = katex.renderToString(latex, { output: 'mathml', ... })
const svg = `<svg ...><foreignObject>${mathHtml}</foreignObject></svg>`
return sharp(Buffer.from(svg)).png().toBuffer()   // libvips can't render foreignObject
```

### Fix

Replace the renderer with a MathJax LaTeX→SVG converter. MathJax outputs **standalone SVG** (real `<path>` glyphs, no foreign markup), which sharp/libvips handles cleanly.

**Add dependency:** `mathjax-full@^3.2.2` (the canonical SVG-output flavor).

**Replace `renderLatexToPng` in `lib/export/docx.ts`:**

```ts
// Module-scope MathJax SVG converter, initialized once and reused across
// requests. Cold-start cost is ~200ms; warm requests pay nothing.
let cachedMathJax: { convert: (tex: string, display: boolean) => string } | null = null
async function getMathJax() {
  if (cachedMathJax) return cachedMathJax
  const { mathjax } = await import('mathjax-full/js/mathjax.js')
  const { TeX } = await import('mathjax-full/js/input/tex.js')
  const { SVG } = await import('mathjax-full/js/output/svg.js')
  const { liteAdaptor } = await import('mathjax-full/js/adaptors/liteAdaptor.js')
  const { RegisterHTMLHandler } = await import('mathjax-full/js/handlers/html.js')
  const { AllPackages } = await import('mathjax-full/js/input/tex/AllPackages.js')

  const adaptor = liteAdaptor()
  RegisterHTMLHandler(adaptor)
  const tex = new TeX({ packages: AllPackages })
  const svg = new SVG({ fontCache: 'none' })
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg })

  cachedMathJax = {
    convert: (latex: string, display: boolean) => {
      const node = doc.convert(latex, { display })
      return adaptor.outerHTML(node)
    },
  }
  return cachedMathJax
}

export async function renderLatexToPng(latex: string, display = false): Promise<Buffer> {
  const mj = await getMathJax()
  const svg = mj.convert(latex, display)
  // MathJax emits <mjx-container><svg ...>...</svg></mjx-container>.
  // Extract the inner <svg> so sharp gets a clean root.
  const inner = svg.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? svg
  return sharp(Buffer.from(inner))
    .resize({ width: PNG_PIXEL_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer()
}
```

Also update `mathImageRun` to pass `seg.kind === 'display-math'` as the `display` arg (currently it always renders inline). That just means changing `mathImageRun(tex)` callers to `mathImageRun(tex, isDisplay)`.

**Keep the fallback intact** — `mathImageRun` still returns `null` on any thrown error, `inlineRuns` still inserts the raw `\(...\)` text as fallback. Belt + suspenders.

### Track A validation

- [ ] `npm install mathjax-full@^3.2.2` clean.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Unit smoke (run from repo root in a quick `node -e` or write a 10-line script in `/tmp`): import `renderLatexToPng`, call with `'\\frac{1}{2}'` and `'\\vec{a} \\cdot \\vec{b}'`, write the PNG to `/tmp/test-math-{i}.png`, confirm files are > 1KB (not empty).
- [ ] Generate a real test DOCX by hitting `/api/tests/<id>/export/docx` locally with a JWT-signed admin cookie (against a test that has math content — Q2/Q3/Q5 from the prod sample is fine).
- [ ] Open the produced DOCX in any viewer (WSL `code --reuse-window` on the file is fine since Word desktop is on Windows side), inspect: math should render as small embedded images instead of vanishing.

---

## Track B — PDF: rip out @sparticuz/chromium-min, switch to Browserless.io

### Diagnosis recap

`@sparticuz/chromium` and `@sparticuz/chromium-min` both fail with `libnss3.so: cannot open shared object file` on every Vercel deploy regardless of version or Node pin. Vercel's Lambda image doesn't ship libnss3 and the Sparticuz tarball doesn't bundle it (the AL2-specific tarball path that was meant to is unreliable on Vercel's runtime). Five iterations, zero progress. Cutting losses.

### Fix

**Remove** `@sparticuz/chromium-min` and `puppeteer-core` from `package.json` — both are unused after this change.

**Rewrite `lib/export/pdf.ts`** to POST the rendered HTML to Browserless's `/pdf` REST endpoint instead of launching chromium locally.

```ts
// At top of generateTestPDF, after the renderToStaticMarkup line, keep
// the existing `html` string assembly intact. Then replace the
// puppeteer.launch + page.setContent + page.pdf + browser.close block
// with this:

const browserlessToken = process.env.BROWSERLESS_TOKEN
if (!browserlessToken) {
  throw new Error(
    'BROWSERLESS_TOKEN is not set. Sign up at browserless.io, copy your API token, ' +
      'and add it to Vercel env vars (Production scope).',
  )
}

const katexCss = fs.readFileSync(path.join(process.cwd(), KATEX_CSS_PATH), 'utf-8')

const browserlessUrl =
  process.env.BROWSERLESS_URL ?? 'https://chrome.browserless.io'

const res = await fetch(`${browserlessUrl}/pdf?token=${browserlessToken}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    html,
    options: {
      format: 'letter',
      printBackground: true,
      margin: { top: '14mm', bottom: '18mm', left: '25mm', right: '6mm' },
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(),
      footerTemplate: buildFooterTemplate(brandingWithLogo),
    },
    addStyleTag: [{ content: katexCss }],
    gotoOptions: { waitUntil: 'domcontentloaded' },
  }),
})

if (!res.ok) {
  const detail = await res.text().catch(() => '')
  throw new Error(`Browserless returned ${res.status}: ${detail.slice(0, 500)}`)
}

return Buffer.from(await res.arrayBuffer())
```

Delete the entire `if (isServerless) ... else ...` puppeteer launch block. Delete the `puppeteer-core` and `@sparticuz/chromium-min` dynamic imports. Remove the `CHROMIUM_PACK_URL` constant. The function reduces from ~150 lines to ~50.

### Update `.env.example`

Add:
```
# Browserless.io API token for PDF generation
# Sign up at https://browserless.io — free tier: ~1000 PDFs/month
BROWSERLESS_TOKEN=

# Optional: override Browserless endpoint (defaults to chrome.browserless.io)
# Useful if you provision a dedicated instance later
BROWSERLESS_URL=
```

### Update `next.config.mjs`

Drop the now-unneeded externalization + tracing. `puppeteer-core` line was already removed in a prior PR — confirm and don't reintroduce. In `serverComponentsExternalPackages`, remove `'puppeteer-core'` if it's still there. In `outputFileTracingIncludes`, drop the entire `/api/tests/[id]/export/pdf` entry — no native binaries to ship.

### Track B validation

- [ ] `npm install` (after package.json edits) clean. `ls node_modules/@sparticuz/` empty or directory gone; `ls node_modules/puppeteer-core` directory gone.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Local smoke: with `BROWSERLESS_TOKEN` set in `.env.local` (use a free trial token from browserless.io), hit `/api/tests/<id>/export/pdf` and confirm a real PDF downloads.
- [ ] `next.config.mjs` no longer references `@sparticuz/chromium*` or `puppeteer-core` anywhere.

---

## Workflow (both tracks on one branch)

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/docx-mathjax-and-pdf-browserless`
3. **Commit 1 (Track A):** `[BE] DOCX export: swap math renderer from katex+foreignObject to MathJax SVG (libvips can't rasterize foreignObject; math was vanishing)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T23:50:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T23:50:00+05:30'`.
4. **Commit 2 (Track B):** `[BE] PDF export: replace @sparticuz/chromium-min with Browserless.io REST API (5 chromium hotfixes failed; libnss3.so persistently missing on Vercel Lambda image)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T23:55:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T23:55:00+05:30'`.
5. Push: `git push -u origin backend/docx-mathjax-and-pdf-browserless`.
6. Append a status entry to `.agents/status-backend.md` covering both tracks. Run `~/report.sh backend "DOCX mathjax + PDF browserless PR ready"`.
7. **Stop.**

## Hard rules

- One branch, two commits, one PR.
- Track A: only `package.json`, `package-lock.json`, `lib/export/docx.ts`. Do NOT touch `lib/ui/render-body-html.ts` (the splitter is correct).
- Track B: only `package.json`, `package-lock.json`, `lib/export/pdf.ts`, `next.config.mjs`, `.env.example`. Do NOT touch the route file (`app/api/tests/[id]/export/pdf/route.ts`) — its `maxDuration = 60` + `runtime = 'nodejs'` stay correct.
- Don't write any tests beyond the unit smoke described in Track A validation. We're shipping a fix, not adding test infrastructure.
- No Claude attribution.
- If `mathjax-full` install fails (transitive native bindings, peer deps), stop and write a status entry — orchestrator will rescope.
- If you can't run the local PDF smoke (no BROWSERLESS_TOKEN handy), skip it and write so in status. User will smoke on production.
- This is the recovery from a long chain of failed hotfixes. Apply precisely; do NOT improvise.
