# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Two follow-up bugs from the OMath/Browserless PR

User merged. Two distinct issues to fix:

1. **DOCX**: Word refuses to open the exported file with "Word experienced an error trying to open the file." Orchestrator inspected the broken DOCX via python zipfile + regex and confirmed: every OMath element is wrapped in an `<undefined>` tag. That's invalid OOXML — Word's validator rejects.

   ```xml
   <w:p>
     <w:r>...<w:t>(A) </w:t></w:r>
     <undefined>
       <m:oMath xmlns:m="..." xmlns:w="...">...</m:oMath>
     </undefined>
   </w:p>
   ```

   `ImportedXmlComponent.fromXmlString(<m:oMath ...>...</m:oMath>)` is producing this `<undefined>` wrapper. Likely cause: docx-lib's xml-js parsing of the namespace-prefixed root tag doesn't populate `element.name` correctly, so the resulting `rootKey` is the string `"undefined"`.

2. **PDF**: Logo renders at **14×16 pixels** in the output PDF (Chrome's broken-image placeholder shape — 1 RGB image + 1 DeviceGray alpha mask, both 14×16). The current pipeline base64-encodes `public/brand/varenyam-logo-mark.png` to a data URL and stuffs it into the HTML sent to Browserless. Most likely: either the file isn't in the function bundle on Vercel (read returns null → falls back to `branding.logo_url` from DB → that signed URL is broken/expired → broken-image placeholder), OR the data URL itself is being corrupted/truncated through the JSON body to Browserless.

Both fixable in one branch.

---

## Track A — DOCX: stop `<undefined>` from wrapping every OMath

### Approach (try in order; ship the first one that works)

**Attempt 1 — strip xmlns from OMath before importing.** mathml2omml emits `<m:oMath xmlns:m="..." xmlns:w="...">`. The document root already declares both namespaces. The redundant declarations on the root element may be confusing docx-lib's xml-js parser. Strip them and re-test:

```ts
function mathRunFromLatex(tex: string, display: boolean): ImportedXmlComponent | null {
  const omath = latexToOmathXml(tex, display)
  if (!omath) return null
  // mathml2omml always emits <m:oMath ...>. Strip ALL xmlns attributes from
  // the root open-tag — docx-lib's xml-js parser appears to mis-parse the
  // element name when the root has its own namespace declarations, producing
  // <undefined>...</undefined> wrapping. The document.xml root declares
  // xmlns:m and xmlns:w already, so dropping them here is safe.
  const stripped = omath.replace(/^<m:oMath\s[^>]*>/, '<m:oMath>')
  try {
    return ImportedXmlComponent.fromXmlString(stripped)
  } catch {
    return null
  }
}
```

Build a real DOCX with this change, unzip + grep `<undefined`. If zero hits → Word should open it. Smoke-test: build the docx, open in `soffice --headless --convert-to pdf` or just inspect document.xml structure. If still `<undefined>` present → go to Attempt 2.

**Attempt 2 — post-process the docx buffer.** docx-lib's `Packer.toBuffer(doc)` returns a zip buffer. Unzip in-memory, strip the `<undefined>` and `</undefined>` tags from `word/document.xml`, rezip:

```ts
import JSZip from 'jszip'  // already a project dep

export async function generateTestDOCX(testId: string): Promise<Buffer> {
  // ... existing setup, build `doc`, then:
  const buf = await Packer.toBuffer(doc)
  // docx-lib v9.6 ImportedXmlComponent emits invalid <undefined> wrapping
  // around imported OMath — post-process the zip to strip those tags.
  const zip = await JSZip.loadAsync(buf)
  const docXml = await zip.file('word/document.xml')!.async('string')
  const cleaned = docXml.replace(/<\/?undefined>/g, '')
  zip.file('word/document.xml', cleaned)
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}
```

This is a workaround but a definite fix. Use ONLY if Attempt 1 doesn't work.

**Attempt 3 — last resort: subclass XmlComponent.** Define a custom `OmathComponent extends XmlComponent` with hardcoded `rootKey: 'm:oMath'` and `prepForXml` that returns the children directly. More involved. Only if Attempts 1 + 2 both fail.

### Track A validation

- [ ] Build a real DOCX containing math expressions (`\frac{1}{2}`, `\vec a \cdot \vec b`, quadratic formula display).
- [ ] `python3 -c "import zipfile; z=zipfile.ZipFile('/tmp/x.docx'); xml=z.read('word/document.xml').decode(); print('undefined count:', xml.count('undefined'))"` → must return **0** (or, if Attempts 1/2 leave the literal text "undefined" in normal content, the count of `<undefined` substrings specifically must be 0).
- [ ] `npx tsc --noEmit` exit 0.
- [ ] Document in your status entry which Attempt succeeded.

---

## Track B — PDF: serve the brand logo via public URL, not base64 data URL

### Why the current approach is broken

`lib/export/pdf.ts:84` calls `readBrandLogoDataUrl()` which `fs.readFileSync`s `public/brand/varenyam-logo-mark.png`. On Vercel, public/ files may not be in the function bundle — they're served as static assets but not necessarily available via fs from inside a function. If the read fails, the function silently falls back to `branding.logo_url` from the DB (a signed Supabase URL that may be invalid/expired). Browserless's headless browser fails to load that URL → renders the broken-image placeholder → 14×16 PDF embed.

### Fix

**1. Make `/brand/(.*)` publicly accessible** so Browserless can fetch the logo directly. Edit `middleware.ts` matcher:

```diff
- matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/health).*)'],
+ matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/health).*)'],
```

(`brand/` matches any path starting `brand/...` — covers `brand/varenyam-logo-mark.png`, `brand/varenyam-logo-full.png`, etc. Brand assets are publicly-served by design — no security concern.)

**This is technically INT's lane per PROTOCOL.md.** Orchestrator OK'd you doing it inline since it's a one-character regex addition tightly coupled with this fix; flag in status if you'd prefer it separated.

**2. Replace `readBrandLogoDataUrl` with `getDefaultLogoPublicUrl`** in `lib/export/pdf.ts`:

```ts
// Build an absolute public URL for the default brand logo. Browserless's
// headless browser fetches this directly — no base64-in-JSON nonsense, no
// fs.readFileSync that may fail on Vercel's function filesystem.
function getDefaultLogoPublicUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/brand/varenyam-logo-mark.png`
}
```

Replace the `readBrandLogoDataUrl()` call site in `generateTestPDF`:
```diff
- const defaultLogoDataUrl = readBrandLogoDataUrl() ?? undefined
+ const defaultLogoUrl = getDefaultLogoPublicUrl() ?? undefined
```

And the React prop:
```diff
- logoSrc: defaultLogoDataUrl,
+ logoSrc: defaultLogoUrl,
```

Delete the now-unused `readBrandLogoDataUrl` function + `cachedBrandLogo` variable + `fs`/`path` imports (only if both also unused elsewhere — verify).

**3. Verify `NEXT_PUBLIC_APP_URL` is set in Vercel** (already required by other auth routes; should be `https://varenyamedtech.in` in production). If not set, the function will throw a clear "logo URL is null" — better than silent broken-image.

### Track B validation

- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run dev` (skip if port 4000 still EADDRINUSE — tsc + grep checks cover it).
- [ ] Grep verify: `grep readFileSync lib/export/pdf.ts` → no katex match and no varenyam-logo-mark.png match (both should be gone).
- [ ] Middleware test (after deploy by user): `curl -sI https://varenyamedtech.in/brand/varenyam-logo-mark.png` should return 200, NOT 307 to /login.

---

## Workflow (both tracks, one branch, two commits)

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/fix-omath-wrapping-and-pdf-logo`
3. **Commit 1 (Track A):** `[BE] DOCX export: fix <undefined> wrapping around OMath that broke Word open (strip xmlns from imported root + zip-buffer post-process fallback)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-30T02:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-30T02:30:00+05:30'`.
4. **Commit 2 (Track B):** `[BE] PDF export: serve brand logo via /brand public URL instead of base64 data URL (fixes 14x16 broken-image placeholder); open /brand/ in middleware matcher`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-30T02:35:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-30T02:35:00+05:30'`.
5. Push: `git push -u origin backend/fix-omath-wrapping-and-pdf-logo`.
6. Status entry covering both tracks. Run `~/report.sh backend "OMath wrapping + PDF logo fixes PR ready"`.
7. **Stop.**

## Hard rules

- One branch, two commits, one PR.
- Track A: `lib/export/docx.ts` only (and possibly `package.json` if you need a dep — should not; JSZip is already in tree).
- Track B: `lib/export/pdf.ts` + `middleware.ts`.
- For Track A, ship the FIRST successful approach. Don't bundle all three.
- Don't touch the route files, the OMath conversion (mathml2omml call), or `lib/export/branding.ts`.
- No Claude attribution.
- The user explicitly trusted us with the OMath ship and we broke their DOCX. Fix it properly this time. Test it actually opens (the structural well-formedness check from last sprint wasn't enough; Word has stricter validation).
- If Attempts 1+2 both fail and Attempt 3 looks like >1 hour of work, STOP and write status — orchestrator will rescope to "drop OMath, render math as small inline PNG via a fixed-DPI MathJax SVG pipeline" as the fallback.
