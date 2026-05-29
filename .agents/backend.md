# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — REWORK math rendering: native in both formats

User merged the previous rework. Both new issues surfaced:

**Issue 1 — PDF**: `ENOENT: no such file or directory, open '/var/task/node_modules/katex/dist/katex.min.css'`. Vercel's function tracer didn't ship the KaTeX CSS file. Browserless never gets the stylesheet → 500.

**Issue 2 — DOCX**: the MathJax-SVG-to-PNG approach you just shipped DOES produce visible math now (32 PNGs embedded, ~600-6000 B each), but the user is explicitly rejecting the image approach:
> "this time the document had really big maths letters are u rendering them as images or as HTML only? i want them as HTML only not in images format, please remove this blunder"

They're right. Native Word math (OOXML OMath) is the correct format — scales with font, editable in Word's equation editor, no pixelation, no oversize images. The image approach was a workaround; OMath is the real fix.

Two tracks, one branch, two commits, one PR. Both ship the actual right answer this time, not another workaround.

---

## Track A — PDF: load KaTeX CSS from CDN instead of disk

### Diagnosis

`lib/export/pdf.ts:114` reads `node_modules/katex/dist/katex.min.css` from the function's filesystem. Vercel's outputFileTracingIncludes for this route was simplified in the previous PR (puppeteer-core removed, entry deleted entirely), so the katex CSS file isn't being shipped into `/var/task/`. fs.readFileSync throws ENOENT.

### Fix

Don't read the file at all. Use Browserless's `addStyleTag` URL form to load KaTeX CSS directly from a CDN. Browserless's headless browser fetches it during rendering — no filesystem dependency, no bundling concern, also enables CSS caching at the CDN edge.

**`lib/export/pdf.ts`** — replace the file-read block:

```diff
-  // KaTeX stylesheet injected into the page so math renders with the right
-  // fonts/spacing (the HTML references katex markup but ships no <style>).
-  const katexCss = fs.readFileSync(path.join(process.cwd(), KATEX_CSS_PATH), 'utf-8')
-
   const browserlessUrl = process.env.BROWSERLESS_URL ?? 'https://chrome.browserless.io'
```

```diff
       addStyleTag: [{ content: katexCss }],
+      addStyleTag: [{ url: KATEX_CDN_URL }],
```

Add at module scope (replacing the now-unused `KATEX_CSS_PATH`):
```ts
// Load KaTeX CSS from jsDelivr at render time inside Browserless's browser
// instead of reading from /var/task — Vercel's function tracer was dropping
// the local file. Version pin must match the katex npm dep major+minor.
const KATEX_CDN_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css'
```

Verify the version against `package.json` katex dep (currently `^0.16.45`). Use the **same major.minor** to ensure CSS matches the JS-rendered markup. The 0.16.x line is API-stable; any 0.16.* CDN URL works.

Drop the unused `fs` + `path` imports if they're now unused.

### Track A validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `grep KATEX_CDN_URL lib/export/pdf.ts` → 2 hits (definition + usage).
- [ ] `grep katex.min.css lib/export/pdf.ts` → 0 hits (or only inside KATEX_CDN_URL).
- [ ] `grep "fs.readFileSync.*katex" lib/export/pdf.ts` → 0 hits.

---

## Track B — DOCX: switch math from PNG images to native OOXML OMath

### Diagnosis

Inspected the user's `test-jee-test (1).docx` via python zipfile:
- 32 `<w:drawing>` references
- 33 PNG files in `word/media/`
- First few image sizes (EMU): cx=428625 cy=571500 → **1.2 × 1.6 cm**. That's ~3× normal inline math height; way too tall for line flow.

The user explicitly wants math rendered as native Word equations, not images. This is the right call regardless — OMath is the canonical format, infinitely scalable, editable, file-size minimal.

### Fix

Pipeline becomes: **LaTeX → MathML (katex) → OMath XML (mathml2omml) → embed as raw XML in docx via `ImportedXmlComponent`**.

**Add dep:** `mathml2omml@^0.6.0` (verify exact latest version with `npm view mathml2omml version`).

If `mathml2omml` doesn't exist / install fails / API doesn't match expectations: **stop and write a status entry**. Don't pivot to a different library mid-flight — orchestrator will pick the alternative (likely `temml` or manual MathML-walk).

**Replace the math rendering helpers** in `lib/export/docx.ts`:

```ts
// Drop these — no more image rendering:
//   getMathJax / renderLatexToPng / mathImageRun
// Drop these imports:
//   import { ImageRun } from 'docx'  (if only used for math)
//   import katex from 'katex'  (we'll re-add below for MathML output)

import katex from 'katex'
import mathml2omml from 'mathml2omml'
import { ImportedXmlComponent } from 'docx'

function latexToOmathXml(tex: string, display: boolean): string | null {
  try {
    const mathml = katex.renderToString(tex, {
      output: 'mathml',
      throwOnError: true,
      displayMode: display,
      strict: 'ignore',
    })
    // katex wraps output in <span class="katex"><math>...</math></span>.
    // Extract the inner <math> element — mathml2omml expects a pure MathML root.
    const inner = mathml.match(/<math[\s\S]*?<\/math>/)?.[0]
    if (!inner) return null
    return mathml2omml(inner)
  } catch {
    return null
  }
}

async function mathRunFromLatex(
  tex: string,
  display: boolean,
): Promise<ImportedXmlComponent | null> {
  const omath = latexToOmathXml(tex, display)
  if (!omath) return null
  // Word expects OMath wrapped in either <m:oMath> (inline) or
  // <m:oMathPara> (display). mathml2omml output starts with one of these
  // by default; if it doesn't, wrap it ourselves.
  const wrapped = /^<m:oMath/.test(omath)
    ? omath
    : `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${omath}</m:oMath>`
  return ImportedXmlComponent.fromXmlString(wrapped)
}
```

**Update `inlineRuns`:**

```ts
async function inlineRuns(source: string | null | undefined): Promise<ParagraphChild[]> {
  if (!source) return []
  const segments = splitBody(source)
  if (segments.every((s) => s.kind === 'prose')) {
    return [new TextRun(source)]
  }
  const runs: ParagraphChild[] = []
  for (const seg of segments) {
    if (seg.kind === 'prose') {
      if (seg.text.length > 0) runs.push(new TextRun(seg.text))
    } else if (seg.kind === 'inline-math' || seg.kind === 'display-math') {
      const run = await mathRunFromLatex(seg.tex, seg.kind === 'display-math')
      if (run) {
        runs.push(run)
      } else {
        // Fallback: raw LaTeX in delimiters so the math is at least readable
        const fallback =
          seg.kind === 'inline-math' ? `\\(${seg.tex}\\)` : `\\[${seg.tex}\\]`
        runs.push(new TextRun(fallback))
      }
    }
  }
  return runs
}
```

**Remove `mathjax-full` from `package.json`** — no longer needed. Lockfile regen via `npm install`.

**Sharp** stays in the file (still used by `imageParagraph` for question-body diagram images).

### Track B validation

- [ ] `npm install mathml2omml@^X` clean (use actual latest version BE confirms via `npm view`).
- [ ] `npm uninstall mathjax-full` clean. `ls node_modules/mathjax-full` → not present.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Unit smoke (similar to last sprint): generate a small DOCX with 3 math expressions (`\frac{1}{2}` inline, `\vec a \cdot \vec b` inline, the quadratic formula in display mode). Use python zipfile to verify:
  - `word/document.xml` contains `<m:oMath>` elements (NOT `<w:drawing>`).
  - `word/media/` is **empty** (or only contains diagram images, not math).
  - `[Content_Types].xml` declares the math namespace.
- [ ] Open the produced DOCX in any viewer that supports OMath (Word, LibreOffice). Math should render as actual scalable equations matching line height.

If the `ImportedXmlComponent.fromXmlString` approach doesn't produce a valid DOCX (Word complains on open), there's a fallback: pass the raw XML via `Document`'s `customXmlString` or wrap as a different docx-lib primitive. **Do not improvise — write a status entry detailing what failed and stop.**

---

## Workflow (both tracks, one branch)

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/native-math-pdf-css-and-docx-omath`
3. **Commit 1 (Track A):** `[BE] PDF export: load KaTeX CSS from jsDelivr CDN (fixes ENOENT on Vercel where the tracer dropped node_modules/katex/dist/katex.min.css)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-30T00:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-30T00:30:00+05:30'`.
4. **Commit 2 (Track B):** `[BE] DOCX export: render math as native OOXML OMath instead of PNG images (drop mathjax-full, add mathml2omml; user explicitly wants editable equations not raster blocks)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-30T00:35:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-30T00:35:00+05:30'`.
5. Push: `git push -u origin backend/native-math-pdf-css-and-docx-omath`.
6. Status entry covering both tracks. Run `~/report.sh backend "DOCX OMath + PDF KaTeX CDN PR ready"`.
7. **Stop.**

## Hard rules

- One branch, two commits, one PR.
- Track A: only `lib/export/pdf.ts` (and possibly `next.config.mjs` if you want to remove the now-irrelevant tracing entry — optional).
- Track B: `package.json`, `package-lock.json`, `lib/export/docx.ts` only.
- Don't touch `lib/ui/render-body-html.ts` or the splitter — that's correct.
- Don't touch the route files.
- **If `mathml2omml` package doesn't exist or API differs from above, STOP** — write status entry, don't pivot to a different library on your own. Orchestrator owns the library choice.
- **If the OMath embedding produces a broken DOCX (Word can't open it), STOP** — write status entry with the exact Word error. Don't try alternative embedding methods on your own.
- No Claude attribution.
- The user has been burned multiple times by export bugs. Apply precisely; if anything in the brief doesn't match reality, stop and ask. Don't ship a half-fix.
