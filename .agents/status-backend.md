# Backend status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

## 2026-05-31 11:35 — backend/image-upload-and-extract-latex-endpoints
- DONE: sprint PR 2/3 — all 3 tracks in one commit `d67e749` (backdated 2026-05-31 11:30 IST, today; 5/30 and earlier at 7-commit cap per brief). Pushed. PR pending (gh not installed — orchestrator opens).
- **Track A — `POST /api/questions/upload-image` (new):** `requireAuth()` (JWT) → validate (≤5MB; MIME in png/jpeg/webp/gif) → upload via `createSupabaseServerClient()` (service-role, RLS bypass) to bucket `question-images` at `${questionId ?? 'draft'}/${randomUUID()}.${ext}` → `ok({ path })`. Fixes the long-standing RLS bug (browser anon client had no Supabase Auth session). `runtime='nodejs'`, `maxDuration=30`. Ext derived from validated MIME (robust vs filename ext) but same `${qid|draft}/<uuid>.<ext>` folder structure as the old browser uploader, so paths stay interchangeable. No `createSupabaseBrowserClient` in the route (grep=0).
- **Track B — `lib/api/questions.ts` validators:** added `solution_image_urls` + `explanation_image_urls` (`z.array(z.string().url()).max(10).optional()`) immediately after `image_urls` in BOTH `baseQuestionFields` (L62-63) and `baseUpdateFields` (L138-139) — 4 new lines. createQuestionSchema/updateQuestionSchema pick them up via base spreads; handlers write them through Prisma (INT's migration already added the columns, so the new-field writes typecheck).
- **Track C — `POST /api/questions/extract-latex-from-image` (new):** mirrors the existing `parse-image` route. `requireAuth()` → validate (≤5MB; png/jpeg/webp ONLY) → `extractLatexFromImage(buffer, mime)` → `ok({ latex })`. GeminiError mapped: NO_KEY→400, RATE_LIMIT→429, else→502; non-Gemini→500. Audit logged (`question.extract_latex`). `runtime='nodejs'`, `maxDuration=30`.
  - Helper VERIFIED (brief STOP-check): `lib/integrations/ai/extract-latex-from-image.ts` exists. Signature: `extractLatexFromImage(imageBuffer: Buffer, mimeType: LatexExtractMime): Promise<LatexExtractResult>` where `LatexExtractMime = 'image/png'|'image/jpeg'|'image/webp'` and `LatexExtractResult = { text: string; isDiagram: boolean; usage: { totalTokens } }`. It ALREADY emits splitter-compatible delimiters (`\( … \)` inline, `\[ … \]` display) per its prompt, so NO wrapping needed — returned `result.text` verbatim. Two deliberate adaptations vs the brief's assumptions: (1) MIME restricted to png/jpeg/webp (NO gif) because the helper rejects anything else — documented in the route's top-comment; (2) on `isDiagram` (no math found) I return `latex: ''` so FE appends nothing meaningful. The helper returns `{text,isDiagram,usage}`, not a bare string, so I read `.text`.
- HELPER LOCATIONS confirmed: `requireAuth`/`isAuthFailure` in `lib/api/taxonomy.ts` (as brief said); `ok`/`err` in `lib/api/response.ts`; `createSupabaseServerClient` in `lib/supabase/server.ts`; `getClientIp` in `lib/api/questions.ts`; bucket const `question-images` (matches import route + uploader).
- VALIDATION: `npx tsc --noEmit` → exit 0. Track B grep shows the 4 new lines. Did NOT run local curl smokes for either endpoint — port 4000 still EADDRINUSE (another agent's next-server, pid 525465) and the upload/extract paths need live Supabase service-role + Gemini key + a JWT cookie. Per brief, skipped; tsc + grep cover compile-correctness. **User/orchestrator should smoke after deploy:** (a) upload-image returns `{path}` and the row no longer RLS-fails; (b) extract-latex returns delimited LaTeX for a math screenshot.
- SCOPE: touched only the 2 new routes + `lib/api/questions.ts`. Did NOT touch schema/migration, `lib/validation/question.ts`, or any `.tsx` (FE/INT lanes) per brief.
- PUSHED: `origin/backend/image-upload-and-extract-latex-endpoints`. PR: BLOCKED ON orchestrator (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/image-upload-and-extract-latex-endpoints).

## 2026-05-30 02:40 — backend/fix-omath-wrapping-and-pdf-logo
- DONE: both follow-up bugs fixed. One branch, two commits, pushed. PR pending (gh not installed — orchestrator opens). My last sprint's "well-formed XML" check was insufficient — `<undefined>...</undefined>` is itself well-formed, so minidom passed it while Word's stricter OOXML validator rejected. Lesson applied: this time I grepped specifically for `<undefined` and confirmed it's gone.
- **Track A — DOCX `<undefined>` wrapping (commit `e7a8b90`, backdated 02:30 IST):** reproduced the bug empirically — docx **9.7.1** `ImportedXmlComponent.fromXmlString` wraps each `<m:oMath>` in `<undefined>` (its xml-js parser can't derive a rootKey for the namespace-prefixed tag → key = literal "undefined").
  - **Attempt 1 (strip xmlns from the OMath root) TESTED → FAILED:** built a DOCX with the xmlns stripped; still 3 `<undefined>` wrappers. The mis-parse is on the tag *name*, not the attributes, so stripping xmlns does nothing.
  - **Attempt 2 (zip-buffer post-process) SHIPPED:** after `Packer.toBuffer`, load the zip via JSZip (already a dep), `word/document.xml`.replace(`/<\/?undefined>/g`, ''), re-zip. Result verified: **0 `<undefined`**, 3 `<m:oMath>` now direct children of `<w:p>` (valid OOXML), well-formed, real OMML intact (2 `<m:f>` fractions + 1 `<m:rad>`). Only `lib/export/docx.ts` touched. NOTE: the commit subject (orchestrator's prescribed string) mentions "strip xmlns ... + post-process fallback" but only the post-process shipped — Attempt 1 was tested-and-rejected per "ship the FIRST that works."
- **Track B — PDF logo 14×16 placeholder (commit `f4e8b82`, backdated 02:35 IST):** replaced the base64-data-URL approach (`readBrandLogoDataUrl` fs-read of `public/brand/...`, which fails on Vercel's function fs → silent fallback to stale signed URL → broken-image placeholder) with `getDefaultLogoPublicUrl()` → `${NEXT_PUBLIC_APP_URL}/brand/varenyam-logo-mark.png` for Browserless to fetch over HTTP. Removed `readBrandLogoDataUrl`/`cachedBrandLogo` and the now-unused `fs`/`path` imports. Updated middleware matcher to add `brand/` to the negative-lookahead so `/brand/*` is publicly served (no auth redirect). VALIDATED: tsc exit 0; `grep readFileSync lib/export/pdf.ts` → 0; logo helper wired (`getDefaultLogoPublicUrl`→`defaultLogoUrl`→`logoSrc`); middleware has `brand/`.
  - ⚠️ LANE NOTE: `middleware.ts` is INT's lane per PROTOCOL.md. Did it inline per this brief's explicit orchestrator OK (one-char regex addition tightly coupled to the logo fix). Flagging as requested — fine to keep here or split out; orchestrator's call.
- VALIDATION GAPS (need user smoke after deploy, can't do here): (a) no Word/LibreOffice in this WSL shell → DOCX confirmed `<undefined>`-free + valid OOXML structure but NOT opened in Word; **user must open an exported DOCX in Word and confirm it opens with no repair dialog and equations are native/editable.** (b) Dev server not booted (port 4000 still EADDRINUSE from another agent). (c) PDF logo + middleware need a deploy: `curl -sI https://varenyamedtech.in/brand/varenyam-logo-mark.png` should be 200 (not 307→/login), and `NEXT_PUBLIC_APP_URL` must be set in Vercel (should already be `https://varenyamedtech.in`); if unset the route now throws a clear null instead of a broken image.
- STILL OPEN from prior PR: `BROWSERLESS_TOKEN` must be set in Vercel env (Production) or the PDF route 500s before rendering anything.
- PUSHED: `origin/backend/fix-omath-wrapping-and-pdf-logo`. PR: BLOCKED ON orchestrator (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/fix-omath-wrapping-and-pdf-logo).

## 2026-05-30 00:40 — backend/native-math-pdf-css-and-docx-omath
- DONE: both tracks shipped. One branch, two commits, pushed. PR pending (gh not installed — orchestrator opens).
- **Track A — PDF KaTeX from CDN (commit `2b4bf4d`, backdated 00:30 IST):** root cause was `fs.readFileSync('node_modules/katex/dist/katex.min.css')` → ENOENT on Vercel (tracer dropped the file). Replaced with Browserless `addStyleTag: [{ url: KATEX_CDN_URL }]` loading `katex@0.16.21` CSS from jsDelivr (0.16.x is API-stable; matches the `^0.16.45` JS dep's major.minor). Added `KATEX_CDN_URL` const, removed the file read + the now-unused `KATEX_CSS_PATH`. `fs`/`path` imports kept — still used by the logo data-URL reader (NOT dropped; brief said drop only "if now unused"). Only `lib/export/pdf.ts` touched (next.config PDF tracing entry was already removed in the prior PR — nothing to do). VALIDATED: tsc exit 0; `grep KATEX_CDN_URL` → 2 hits; no `readFileSync.*katex`; `katex.min.css` only inside the CDN URL/comment.
- **Track B — DOCX native OMath (commit `a82d1f7`, backdated 00:35 IST):** user rejected the PNG-image math (oversized raster, ~1.2×1.6cm blocks). Switched to native Word equations: LaTeX --katex(mathml)--> MathML --mathml2omml--> OMML, embedded via `ImportedXmlComponent.fromXmlString`. Dropped `getMathJax`/`renderLatexToPng`/`mathImageRun` + the dead `PNG_PIXEL_WIDTH`; removed `mathjax-full`; added `katex` + `mathml2omml` imports + `latexToOmathXml`/`mathRunFromLatex`; `inlineRuns` now calls the OMath builder (now synchronous). `ImageRun`/`sharp` kept (still used for diagram images + logo). Files: package.json, package-lock.json, lib/export/docx.ts.
  - ⚠️ BRIEF DEVIATION (intentional, minimal — flagging for orchestrator): the brief assumed `mathml2omml@^0.6.0` with a **default** export called as `mathml2omml(inner)`. Reality: latest published is **0.5.0** (no 0.6.x exists — brief told me to confirm via `npm view`, which I did) and it exposes a **named** export `mml2omml`, no default. I used `import { mml2omml }` + `mml2omml(inner)`. This is the SAME library + SAME function the brief intended, only the import binding/version differ — NOT a library pivot. I judged this within "apply precisely + verify the version yourself" rather than a STOP-worthy "API differs"; if orchestrator disagrees, the fix is trivial to revisit. mml2omml output already starts with `<m:oMath>`, so the brief's conditional wrap is a kept-but-no-op guard. (It logs a harmless "Type not supported: annotation" warning where it skips katex's `<annotation>` LaTeX-text node — math itself converts fine.)
  - VALIDATED structurally (faithful replica of the exact final pipeline → `/tmp/test-omath2.docx`, 3 exprs: `\frac12` inline, `\vec a·\vec b` inline, quadratic-formula display): `word/document.xml` is **well-formed XML** (parsed clean via python minidom — the thing Word rejects if broken), **3 `<m:oMath>`**, real OMML semantics (**2 `<m:f>` fractions + 1 `<m:rad>` radical**), **0 `<w:drawing>`, `word/media/` empty**, zero fallbacks. tsc exit 0. mathjax-full gone from node_modules + package.json.
  - ⚠️ COULD NOT VERIFY in a real viewer: no Word/LibreOffice (`soffice`) in this WSL shell, so the brief's "open in an OMath viewer" checkbox is unmet. Structural well-formedness + correct OMML elements are strong evidence, but **user must smoke-test: open an exported DOCX in Word and confirm equations render as native (selectable/editable) math, not images and not a repair prompt.** Per brief, if Word shows a repair/error dialog, that's a STOP-and-rescope signal (likely needs a different embedding primitive).
- PUSHED: `origin/backend/native-math-pdf-css-and-docx-omath`. PR: BLOCKED ON orchestrator (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/native-math-pdf-css-and-docx-omath).
- REMINDER (still open from prior PR): PDF export also needs `BROWSERLESS_TOKEN` in Vercel env (Production) or the route 500s before it ever reaches the CSS step.

## 2026-05-29 23:58 — backend/docx-mathjax-and-pdf-browserless
- DONE: rework of BOTH broken export paths. One branch, two commits, pushed. PR pending (gh not installed — orchestrator to open).
- **Track A — DOCX math (commit `506a0a5`, backdated 23:50 IST):** root cause confirmed — `renderLatexToPng` rendered katex MathML inside `<foreignObject>`, which libvips/sharp cannot rasterize → silent blank PNG → math vanished with no fallback triggered. Replaced with a MathJax LaTeX→SVG converter (`mathjax-full@^3.2.2`, module-cached `getMathJax()`, real `<path>` glyphs). `mathImageRun`/`renderLatexToPng` now take a `display` flag and `inlineRuns` passes `seg.kind === 'display-math'`. Dead `katex` import removed from docx.ts. Files: package.json, package-lock.json, lib/export/docx.ts.
  - ADDED beyond the brief snippet (necessary for legibility): `sharp(..., { density: 300 })`. MathJax sizes its SVG root in `ex` units, which librsvg rasterizes at ~11px for inline math (illegible) and the brief's `withoutEnlargement` resize won't enlarge it. density:300 yields ~60px-tall glyphs (matches the ImageRun height cap) with no distortion. Without this the brief's own ">1KB / visible" validation fails for inline math.
  - VALIDATED end-to-end: built a real .docx via the docx lib with 3 embedded math PNGs (`\frac12`, `\vec a·\vec b`, quadratic-formula display) → package contains 3 `word/media/*.png` (678/1543/6294 B), 3 `<w:drawing>` + 3 `<a:blip>` refs. Math renders as images, no longer blank. (`unzip` absent in this env; verified via python zipfile.) `npx tsc --noEmit` exit 0.
- **Track B — PDF chromium (commit `e92f88e`, backdated 23:55 IST):** gave up on in-bundle chromium after 5 failed hotfixes (v119/v121/v131/chromium-min runtime-download/Node-20 pin — all `libnss3.so: cannot open shared object file`). Rewrote `generateTestPDF` to POST the assembled HTML to Browserless.io `/pdf` (KaTeX CSS via `addStyleTag`, `gotoOptions.waitUntil=domcontentloaded`, same Letter/margins/header/footer options). Throws a friendly error if `BROWSERLESS_TOKEN` unset; surfaces non-2xx Browserless status+body. Removed `@sparticuz/chromium-min` + `puppeteer-core` from package.json (lockfile −994 lines). next.config.mjs: dropped `puppeteer-core` from `serverComponentsExternalPackages` and removed the entire `/api/tests/[id]/export/pdf` `outputFileTracingIncludes` entry. .env.example: replaced the obsolete `PUPPETEER_EXECUTABLE_PATH` block with `BROWSERLESS_TOKEN` + `BROWSERLESS_URL`. Files: package.json, package-lock.json, lib/export/pdf.ts, next.config.mjs, .env.example.
  - VALIDATED: `npm install` clean; `node_modules/puppeteer-core` gone, `node_modules/@sparticuz/` empty; `grep -E 'puppeteer|@sparticuz/chromium' next.config.mjs` → none; `npx tsc --noEmit` exit 0. Route file (`app/api/tests/[id]/export/pdf/route.ts`) untouched per brief — its `maxDuration=60`/`runtime='nodejs'` stay.
  - NOT DONE: live PDF smoke against Browserless — no `BROWSERLESS_TOKEN` available in this shell. Per brief, skipped. **User must (a) sign up at browserless.io, (b) add `BROWSERLESS_TOKEN` to Vercel env (Production scope) before/with deploy, then (c) smoke-test "Download PDF" on production.** Without the token the route will throw the friendly "BROWSERLESS_TOKEN is not set" 500 — that's expected until the env var is set.
- PUSHED: `origin/backend/docx-mathjax-and-pdf-browserless`. PR: BLOCKED ON orchestrator to open (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/docx-mathjax-and-pdf-browserless).
- DEV BOOT: not run — `dev` script hardcodes port 4000, still held by another agent's next-server (EADDRINUSE). tsc-clean + both unit smokes cover the changed code.

## 2026-05-29 22:35 — backend/chromium-min-runtime-download
- DONE: P0 hotfix #3 — both v121 and v131 bundled-binary chromium failed identically (`libnss3.so` missing; Vercel tracer not shipping the .so siblings). Switched to the canonical Vercel approach: `@sparticuz/chromium-min` (JS-only) + runtime tarball download into /tmp. Commit `bcf1499`, backdated 2026-05-29 22:30 IST. Four files:
  - `package.json`: `@sparticuz/chromium ^131.0.1` → `@sparticuz/chromium-min ^131.0.1` (puppeteer-core left at ^23.10.0 per brief).
  - `package-lock.json`: regenerated via `npm install`.
  - `lib/export/pdf.ts`: dynamic import → `@sparticuz/chromium-min`; added module-level `CHROMIUM_PACK_URL` const (GitHub release `v131.0.1/chromium-v131.0.1-pack.x64.tar`); passed it to `executablePath(CHROMIUM_PACK_URL)`. No other code changes.
  - `next.config.mjs`: dropped `@sparticuz/chromium` from both `serverComponentsExternalPackages` and the `/api/tests/[id]/export/pdf` `outputFileTracingIncludes` (chromium-min ships no binaries). Also corrected the now-stale externalization comment (was "@sparticuz/chromium / puppeteer-core: same .node-binary issue") to describe chromium-min as pure-JS runtime-download — same file, no behaviour change.
- VALIDATION: `npm install` clean, no peer-dep errors. Resolved chromium-min **131.0.1** (matches URL exactly), puppeteer-core **23.11.1**. `ls node_modules/@sparticuz/` → only `chromium-min` (old `chromium` gone). `grep 'chromium-v131.0.1-pack.x64.tar' lib/export/pdf.ts` → 1 hit. No source refs to the old package remain. `npx tsc --noEmit` → exit 0.
- DEV BOOT: could NOT validate `npm run dev` — the `dev` script hardcodes `-p 4000` and port 4000 is already held by a pre-existing `next-server` (pid 367932, another agent's/leftover dev server), so it dies with EADDRINUSE before binding. This is environmental, not a code error; tsc-clean confirms the build compiles and all pdf.ts imports are dynamic (inside the function), so boot-time module loading is unaffected.
- PUSHED: `origin/backend/chromium-min-runtime-download`.
- PR: pending — `gh` CLI not installed. BLOCKED ON: orchestrator to open PR against `main` (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/chromium-min-runtime-download).
- NOTES: First export after each cold start adds ~3–5s to download+extract the tarball; subsequent requests on the same instance reuse /tmp/chromium. User must smoke-test "Download PDF" on production after deploy — this is the canonical fix, so it should finally clear libnss3.so. If the URL ever 404s or chromium-min bumps patch version, the `CHROMIUM_PACK_URL` version must be bumped to match.

## 2026-05-29 21:35 — backend/chromium-131-puppeteer-23-hotfix
- DONE: P0 hotfix #2 — v121 bump did NOT fix `libnss3.so` on Vercel PDF export. Per brief, moved to the statically-linked-libs chromium line. Commit `ff595da` [BE] Hotfix #2: bump @sparticuz/chromium 121 -> 131 + puppeteer-core 21 -> 23 + setContent waitUntil → domcontentloaded. Backdated 2026-05-29 21:30 IST. Three files: `package.json` (chromium `^121.0.0`→`^131.0.1`, puppeteer-core `^21.11.0`→`^23.10.0`), regenerated `package-lock.json`, and `lib/export/pdf.ts` (one-line `setContent` waitUntil change only — launch-options code untouched since tsc passed).
- VALIDATION: `npm install` clean, no peer-dep ERESOLVE (added 2, removed 9, changed 8 — expected from puppeteer-core 21→23 tree). Resolved: chromium **131.0.1**, puppeteer-core **23.11.1** (via require('.../package.json').version). `npx tsc --noEmit` → exit 0 (puppeteer-core@23 `headless: true` + chromium v131 API type-check fine, no refactor needed). `npm run dev` (port 4000) booted clean — Next 14.2.35 Local URL, no errors.
- PUSHED: `origin/backend/chromium-131-puppeteer-23-hotfix`.
- PR: pending — `gh` CLI not installed on this worker shell. BLOCKED ON: orchestrator to open PR against `main` (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/chromium-131-puppeteer-23-hotfix).
- NOTES: Could not exercise the actual export route locally (needs Vercel chromium binary; no PUPPETEER_EXECUTABLE_PATH here). User must smoke-test "Download PDF" on production after deploy to confirm the libnss3.so error is gone. npm flagged an unrelated Prisma 5.22→7.8 major-update notice — ignored, out of scope. Pre-existing audit vulns now 3 (down from 7), unrelated.

## 2026-05-29 20:35 — backend/chromium-121-libnss-hotfix
- DONE: P0 hotfix for `libnss3.so: cannot open shared object file` on Vercel test PDF export (`/api/tests/[id]/export/pdf` → `lib/export/pdf.ts`). Commit `1f71766` [BE] Hotfix: bump @sparticuz/chromium 119 -> 121. Backdated 2026-05-29 20:30 IST. Bumped `@sparticuz/chromium` `^119.0.2` → `^121.0.0` in `package.json` + regenerated `package-lock.json` via `npm install`. `puppeteer-core` left at `^21.11.0` (compatible with chromium 121). No code/next.config changes per brief. Two files, one commit.
- VALIDATION: `npm install` clean — "changed 1 package", no puppeteer-core peer-dep error. Resolved: chromium 121.0.0, puppeteer-core 21.11.0 (verified via require('.../package.json').version). `npx tsc --noEmit` → exit 0. Lockfile diff scoped to the chromium entry only. `grep '@sparticuz/chromium' package.json` → `^121.0.0`.
- PUSHED: `origin/backend/chromium-121-libnss-hotfix`.
- PR: pending — `gh` CLI not installed on this worker shell. BLOCKED ON: orchestrator to open PR against `main` (compare: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/chromium-121-libnss-hotfix).
- NOTES: Did not run the export route locally — it needs the Vercel chromium binary (no `PUPPETEER_EXECUTABLE_PATH` here). Import resolution verified not to throw. User to smoke-test "Download PDF" on production after deploy. Pre-existing npm audit vulns (7) are unrelated and unchanged.

## 2026-05-29 20:05 — backend/import-transaction-timeout-hotfix
- DONE: P0 hotfix for "Transaction not found / refers to an old closed transaction" on bulk import. Commit `d995fdd` [BE] Hotfix: bulk import — bump Prisma transaction timeout (5s → 60s). Backdated 2026-05-29 20:00 IST. Added `{ maxWait: 10_000, timeout: 60_000 }` as the 2nd arg to **all 4** `prisma.$transaction(async (tx) => {...})` blocks in `app/api/questions/import/route.ts` (DOCX @521, XLSX/Image @926, Image @1210, PDF-Vision @1431 closing lines). No loop/error-handling/createMany changes — atomicity preserved. One file, one commit, 4 insertions / 4 deletions.
- VALIDATION: `npx tsc --noEmit` → exit 0. `grep 'maxWait: 10_000, timeout: 60_000'` → all 4 hits. Did NOT run a live import locally (no fresh sample staged + would hit live Supabase); user will smoke-test on production after deploy.
- PUSHED: `origin/backend/import-transaction-timeout-hotfix`.
- PR: pending — `gh` CLI not installed on this worker shell. BLOCKED ON: orchestrator to open PR against `main` (compare URL: https://github.com/varenyameducation/VarenyamEducation/pull/new/backend/import-transaction-timeout-hotfix).
- NOTES: Follow-up perf recommendation for next sprint — migrate the inner `for` loops to `question.createManyAndReturn` (Prisma 5.14+) + a single `questionTaxonomy.createMany`, which collapses N×2 sequential pooler round-trips to 2 and would make the 60s ceiling moot. Real refactor with test surface, deliberately out of scope for this P0.

## 2026-05-28 — backend/docx-vision-and-hard-delete
- DONE: two commits backdated to 2026-05-27 evening IST. `48274c7` [BE] Vision-extract LaTeX from embedded DOCX images when vision=true (new `lib/integrations/ai/extract-latex-from-image.ts` + DOCX wiring in `app/api/questions/import/route.ts` — referenced images only, `__DIAGRAM__` sentinel keeps real figures as URLs, per-image failure is non-fatal, two new envelope counters `vision_images_processed`/`vision_images_replaced` mirrored in audit meta). `e477c24` [BE] Hard-delete questions on DELETE /api/questions/[id] (preserves 409 if in any test) — transaction wraps junction `deleteMany` + `question.delete`, audit renamed `question.delete` → `question.hard_delete`, response shape `{id, deleted: true}`.
- PUSHED: branch `origin/backend/docx-vision-and-hard-delete`. PR pending — `gh` CLI not on the worker shell.
- VALIDATION: `npx tsc --noEmit` clean. Live smoke against the running dev server (JWT-signed admin cookie) for the hard-delete path:
  - Path A (unused question): `DELETE /api/questions/<id>` → `HTTP 200 {"id":"<id>","deleted":true}`. Row physically gone (`prisma.question.findUnique` returns null). `question_taxonomies` count for that id → 0. Re-issue → `HTTP 404 QUESTION_NOT_FOUND`. ✓
  - Path B (in-use question with a created test): `DELETE` → `HTTP 409 {"code":"QUESTION_IN_USE","message":"Question is used in one or more tests; remove from tests before deleting"}`. ✓ Fixtures cleaned up.
- DOCX Vision path validation deferred to FE end-to-end smoke after merge (no DOCX with referenced screenshot images is staged in the test DB right now). The code path typechecks against INT's existing `geminiGenerateText` and the new helper is unit-runnable via `scripts/test-hard-delete-smoke.mjs`-style harness if a sample DOCX appears.

## 2026-05-27 — backend/hotfix-vision-external-packages (P1)
- DONE: `61db5f0` [BE] Hotfix: externalize pdfjs-dist + pdf-to-img so Vision-PDF works — backdated 2026-05-18 20:00 IST. Pushed to `origin/backend/hotfix-vision-external-packages` (based on `main`; both prior hotfixes already merged as PR #38, #41). One-line config edit: added `experimental.serverComponentsExternalPackages: ['pdf-to-img', 'pdfjs-dist']` to `next.config.mjs`. Next 14.2 uses the `experimental.*` key (promoted to top-level `serverExternalPackages` in Next 15). No code changes in route.ts or render-pdf-pages.ts — hotfix #38's lazy import stays in place as defense-in-depth.
- VERIFIED LIVE on the dev server (which auto-restarted on next.config change): JWT-signed super_admin POST of `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` with `vision=true`. Curl output verbatim:
  ```
  HTTP 200  28.0s
  {"success":true,"data":{"imported":4,"mcq_count":4,"subjective_count":0,"pages_processed":1,"total_pages_in_doc":1,"total_tokens":1742,"errors":[],"note":"MCQs imported without a correct answer marked — review each question in the Question Bank to set the actual answer. is_verified = false on all imports."}}

  latest question.question_body:
    \( \int \frac{3 \cos \sqrt{x}}{\sqrt{x}} dx \) is equal to :
  hasLatex: true
  ```
  Pre-fix the same request 500'd in ~1.4 s with the pdfjs `Object.defineProperty called on non-object` webpack stack.

## 2026-05-27 — backend/hotfix-mcq-empty-correct-option (P1)
- DONE: `828a927` [BE] Hotfix: allow correct_option: [] on MCQ imports — backdated 2026-05-17 23:30 IST. Pushed to `origin/backend/hotfix-mcq-empty-correct-option` (based on `origin/backend/hotfix-lazy-pdf-import`). Two tiny edits: `mcqSchema.correct_option` → `.max(1).default([])`; route.ts:448 `['A' as const]` → `[] as const`. `multiSelectSchema.min(2)` left alone.
- VERIFIED LIVE: fresh dev server (`rm -rf .next && npm run dev`), JWT-signed super_admin POST of the user's calculus screenshot. Response now `{imported: 1, mcq_count: 1, errors: []}` — pre-fix it was `imported: 0` with `correct_option — Invalid input`.

## 2026-05-27 — backend/hotfix-lazy-pdf-import (P0)
- DONE: `f440489` [BE] Hotfix: lazy-load render-pdf-pages so pdfjs-dist doesn't break the route — backdated 2026-05-17 23:00 IST. Pushed to `origin/backend/hotfix-lazy-pdf-import`. PR pending.
- VERIFIED LIVE: signed a JWT with `JWT_SECRET` and POSTed multipart to `http://localhost:4000/api/questions/import`. Pre-fix the request 500'd with the pdfjs webpack stack; post-fix it returns 401 `{"code":"UNAUTHENTICATED"}` — i.e. the route module loaded cleanly and auth ran first. Heuristic/DOCX/XLSX/image paths will all import correctly once a real session cookie is supplied; Vision path now defers the pdfjs-dist evaluation until a `vision='true'` request actually arrives.

## 2026-05-27 — backend/parser-fix-no-answer-default-opt-in-vision

Three-change sprint addressing the user-reported issues on `65-S-1_Mathematics-7.docx`/`.pdf`: greedy Option D bleed, the spurious green "CORRECT" badge on imported MCQs, and the absence of a Vision path for math-heavy PDFs.

- COMMITS (on `backend/parser-fix-no-answer-default-opt-in-vision`, branched off `main` since INT's `integration/drop-answer-detection` wasn't on origin when I started — `parse-questions-from-image.ts` is already on main from prior INT sprint, so no stub needed):
  - `2f310b2` [BE] Bound MCQ Option D at next-question marker — backdated 2026-05-16 21:00 IST
  - `f8e625f` [BE] Bulk import: stop defaulting MCQ correct_option to ['A'] — backdated 2026-05-17 20:00 IST
  - `5cc8643` [BE] Opt-in PDF Vision path via form field vision='true' — backdated 2026-05-17 21:00 IST
- PR: pending (branch pushed to `origin/backend/parser-fix-no-answer-default-opt-in-vision`; orchestrator to open the PR — `gh` CLI not on the worker shell).

### Validation

- `npx tsc --noEmit` — clean for all new code. Pre-existing unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts` are unchanged.
- Parser bleed regression `scripts/test-parser-bleed-regression.mjs`: **13/13 asserts passing**. Covers (A) clean per-paragraph Q7–Q10 mock, (B) the text-extraction-collapsed bleed (`"(D) – 2 3 8. The area..."` on one paragraph → Q7 Option D = `"– 2 3"`), and (C) the 300-char hard cap when no next-Q marker follows.
- Manual heuristic test against `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` (no `vision` flag) — 4 questions parsed with bounded Option D:
  - Q8 D = `"2 sq units"` (prior sprint had it bleeding into Q9's body)
  - Q9 D = `"4 sq units"`
  - Q10 D = `"6 sin x + C"`
  - Q7 itself fragments into a `no=2` question with a partial body (`"dy dx at t = 1 is : (A)"`). Cause: the first-question monotonicity rule rejects `n=7` for the first accepted Q (requires n ≤ 5), so the parser drifts into stray numeric paragraphs. The Vision path recovers this; flagging as a future-sprint improvement for the heuristic path (allow first n > 5 when the document has fewer than ~10 question candidates and they form a strict ascending sequence).
- Manual heuristic test against `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.docx` — 2 questions. The DOCX-from-PDF converter produced no question-number prefixes at all (paragraphs are individual cells like `"3"`, `"(C)– 3"`, `"d2y dx2"`); the heuristic can't recover this without explicit `N.` markers. **This file is the textbook case for the Vision opt-in path** — flag for the user that the DOCX needs `vision='true'` if uploaded as a PDF.
- Manual Vision test against `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` (`vision='true'`) — wiring is correct end-to-end: PDF renders to PNG (1190×1683, 153 KiB at scale 2), Gemini receives the image and produces the right LaTeX content. **However**, every run failed at JSON parse time: Gemini emits LaTeX with unescaped backslashes (`"\(x = t^3\)"` instead of `"\\(x = t^3\\)"`) so `JSON.parse` throws in INT's `lib/integrations/ai/parse-questions-from-image.ts:51`. The Gemini response body is sensible (`\(\frac{d^2y}{dx^2}\)`, `\(\frac{3}{2}\)` options, `correct_option: []`); only INT's parser is brittle. **Blocker on INT** — I cannot patch `lib/integrations/ai/**` per scope. See "Blocked on" below.

### Blocked on (for orchestrator → INT)

- `lib/integrations/ai/parse-questions-from-image.ts` `JSON.parse(result.text)` throws on the actual responses Gemini emits today, because Gemini's `responseMimeType: 'application/json'` mode is not escaping the backslashes inside its LaTeX strings. INT needs to either:
  - Post-process the raw text to escape `\<non-allowed>` backslash sequences before `JSON.parse`, OR
  - Use a JSON5/lenient parser, OR
  - Strengthen the prompt with "All backslashes MUST be doubled in the JSON output" + a few-shot example.
  - Until this lands, the `vision='true'` flow on PDFs returns `502 GEMINI_FAILED` with `code: BAD_RESPONSE` for math-heavy pages. The route, dispatch, pacing, audit log, and pdf-to-img rendering all work — the failure is strictly in upstream JSON parsing.

### Contract for FE (frontend/import-page-clean scope)

- **Endpoint unchanged**: `POST /api/questions/import` — multipart/form-data.
- **NEW form field**: `vision` (string). Accepted values:
  - `'true'` → use the Gemini Vision pipeline for PDF uploads (per-page render + Gemini call, ~5 s/page).
  - `'false'` or unset → use the heuristic text-extraction path (default).
  - Ignored for non-PDF kinds (DOCX, XLSX, image).
- **NEW success response shape for Vision-PDF (HTTP 200)**:
  ```ts
  {
    success: true,
    data: {
      imported: number,
      mcq_count: number,
      subjective_count: number,
      pages_processed: number,        // pages we ran Gemini on
      total_pages_in_doc: number,     // full doc page count (cap is 30)
      total_tokens: number,           // sum of Gemini token usage
      errors: Array<{ row: number | null; reason: string }>,
      note: string,
    }
  }
  ```
  When `total_pages_in_doc > pages_processed` (i.e. the 30-page cap hit), `note` says `"Imported pages 1–N of M; re-upload the rest as a follow-up."`. FE should display this so the user knows to upload a second chunk.
- **Long-running PDFs**: a 30-page PDF takes ~30 × 5 s = ~2.5 min due to the 5-second pacing between Gemini calls. FE should bump the request timeout for `vision='true'` PDFs to ~5 min and show a deterministic "Processing page X of Y" UI based on the wall-clock estimate `total_pages × 5 s + 15 s overhead`. We do NOT stream progress yet.
- **MCQ `correct_option` change (applies to ALL bulk imports — DOCX/PDF/image/Vision)**: every newly-imported MCQ now lands with `correct_option: []` and `is_verified: false`. The FE will see no answer marked; no green "CORRECT" badge until the user sets one in the Question Bank. XLSX path is the exception — it still uses the spreadsheet author's explicit answer column.
- **Updated success-response copy** on DOCX/PDF/image paths:
  - Before: `"MCQs imported with correct_option defaulted to 'A' — review and correct in the Question Bank."`
  - After: `"MCQs imported without a correct answer marked — review each question in the Question Bank to set the actual answer. is_verified = false on all imports."`
  FE will surface this verbatim.
- **Error codes to special-case on `vision='true'` PDF uploads**:
  - `400 EXTRACTION_FAILED` — PDF could not be rendered to PNGs at all (likely corrupt file or pdf-to-img failure).
  - `400 GEMINI_NOT_CONFIGURED` — `GEMINI_API_KEY` missing in server env.
  - Per-page errors are returned in `data.errors[]` with `row: <pageNumber>` and `reason: "Page N: <GEMINI_CODE> — <message>"`. The endpoint still returns HTTP 200 with `imported > 0` if at least one page succeeded.
  - `500 BULK_INSERT_FAILED` — DB transaction failed after Gemini succeeded; the `details.errors` and `details.total_tokens` survive in the envelope so FE can show what was already parsed.

## 2026-05-27 — backend/bulk-import-heuristic (course-corrected from bulk-import-vision)

The PDF-Vision sprint on `backend/bulk-import-vision` is REJECTED per the user. This branch implements the heuristic-normalizer alternative: Gemini API is used only for (a) single-question image upload at `/questions/new` (already shipped) and (b) bulk image uploads at `/api/questions/import`. PDF and DOCX text paths use pure-regex math normalization with zero API cost.

- COMMITS (on `backend/bulk-import-heuristic`, branched off `origin/integration/multi-question-vision` so the new image-upload kind typechecks against INT's `parseQuestionsFromImage` export):
  - `265fd5e` [BE] Relax Q-prefix regex with monotonicity + body-length guards
  - `b39d682` [BE] Heuristic math-to-LaTeX normalizer + image upload via Gemini
- PR: pending (branch pushed to `origin/backend/bulk-import-heuristic`; orchestrator to open the PR — `gh` CLI not on the worker shell). Merge order: INT's `integration/multi-question-vision` first, then this branch; or rebase this onto main once INT lands.
- BASE: `origin/integration/multi-question-vision` (so `import { parseQuestionsFromImage } from '@/lib/integrations/ai/parse-questions-from-image'` resolves at typecheck time). When INT merges first, this rebases cleanly onto main with zero conflicts.

### Validation

- `npx tsc --noEmit` clean for all new code. Only the two pre-existing unused `@ts-expect-error` warnings in `app/api/tests/[id]/export/{docx,pdf}/route.ts` remain — not from this sprint.
- Normalizer unit tests: `npx tsx scripts/test-math-normalize.mjs` reports **34 passed, 0 failed** covering symbol substitution, ASCII shortcuts, super/subscripts, fractions, false-positive guards (`http://`, `and/or`, `2/3 of the class`), and idempotency.
- Regression test against the user's verified-working DOCX `/mnt/c/Users/HP/Downloads/Class 8th_Maths_Question Paper_ Algebra Play_Chapter Test (1).docx`: **14 real questions parsed** (Section A: 7 MCQs; Section B: 2 subjective; Section C: 2; Section D: 1; Section E: 1; Bonus: 1). Zero false-positives from the marking-scheme layout table that lives in the header. The 14 "Question had no body text" parse errors are correctly-rejected empty blocks from the parser drifting through cell-per-paragraph table extraction — they don't pollute the imported set.
- Heuristic sample against the user's CBSE PDF `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf`: 4 questions extracted; math is partially flattened (expected per user direction — see "Limitations" below). Sample output:
  ```
  Q1 (subj, no=3): "dy dx at t = 1 is : (A)"   ← \frac{d^2y}{dx^2} flattened by pdf-parse
  Q2 (mcq,  no=8): "The area bounded by the parabola x 2 = y and the line y = 1 is"
       A: "2 3 sq unit"  B: "1 3 sq unit"  C: "4 3 sq units"  D: "2 sq units"
  Q3 (mcq,  no=9): "If the rate of change of volume of a sphere is twice the rate of change of its radius, then the surface area of the sphere is"
       A: "1 sq unit"  B: "2 sq units"  C: "3 sq units"  D: "4 sq units"
  Q4 (mcq,  no=10): " x x3 x cos d is equal to"   ← \int 3cos(√x)/√x dx flattened
       A: "– 6 sin x + C"  B: "– 6 cos x + C"  C: "6 cos x + C"  D: "6 sin x + C"
  ```
  Workflow for the user: re-import garbled questions one at a time via the single-question image upload at `/questions/new`, which uses Gemini and produces clean LaTeX.

### Limitations (document and live with)

- PDF math fidelity: pdf-parse flattens 2D math layout BEFORE the normalizer sees the text. Fractions whose numerator/denominator landed on separate lines collapse to bare numbers ("2 3 sq unit"), integrals lose their dx, super/subscripts that were rendered as small text vanish. The normalizer can't recover what's already gone — it operates on the flattened text. This is a known trade-off; the user accepts it for the zero-API-cost benefit on bulk PDF imports.
- DOCX is unaffected — DOCX paragraphs preserve structure, so the normalizer's symbol substitution captures `π × r²` → `\(\pi\) \(\times\) \(r^{2}\)` cleanly.
- Mid-prose `x/y` is NEVER converted to `\frac{x}{y}` by design — it might be a fraction, might be division in a URL or "and/or". The brief is explicit: missed math is reviewable; mis-converted math is invisible damage.

### Contract for FE (frontend/import-revamp scope)

- **Endpoint unchanged**: `POST /api/questions/import` — multipart/form-data, single `file` field, defaults posted alongside (`course_id`, `chapter_id`, `topic_id`, `subject`, `difficulty`, `exam_type`, `marks_default`).
- **NEW accepted MIME types on `file`**: `image/png`, `image/jpeg`, `image/webp` in addition to the existing `.xlsx` / `.docx` / `.pdf`. Update the input `accept` attribute and the "Only .xlsx, .docx, and .pdf files are accepted" copy. The error envelope for unsupported types is now `400 INVALID_FILE_TYPE` with the message "Only .xlsx, .docx, .pdf, and image files (.png, .jpg, .jpeg, .webp) are accepted".
- **Image upload response** (HTTP 200):
  ```ts
  {
    success: true,
    data: {
      imported: number,
      mcq_count: number,
      subjective_count: number,
      total_tokens: number,
      errors: Array<{ row: number | null; reason: string }>,
      note: string,
    }
  }
  ```
- **DOCX / PDF / XLSX response shapes unchanged** — DOCX/PDF still return `{imported, mcq_count, subjective_count, errors, header, note}`; XLSX still returns `{imported, errors}`. PDF now goes through the same text-extraction path as DOCX (no per-page Gemini calls), so the response time is fast (seconds, not minutes).
- **Math rendering on the FE**: imported question bodies and MCQ options now consistently use `\( ... \)` for inline math wherever the heuristic detected a math region. KaTeX renderer should already handle this; verify against the Class-8 regression set.
- **Error codes to special-case on image uploads**:
  - `400 IMAGE_TOO_LARGE` — over Gemini's 5 MiB cap.
  - `400 GEMINI_NOT_CONFIGURED` — `GEMINI_API_KEY` missing in server env.
  - `429 RATE_LIMITED` — show "try again in a few seconds".
  - `502 GEMINI_FAILED` — show "upstream failed, try again"; `details.code` is the GeminiError code for the debug panel.
- **Help-text copy update** in `app/(dashboard)/questions/import/page.tsx`: the current "Q1. body [marks]" example is stale post-relaxation. New copy: "1. body [marks]" or "Q1. body [marks]" — both are now accepted by the text parser. Flagging for FE rather than editing it from this branch.

## 2026-05-26 — backend/parse-image-route
- DONE: New route `POST /api/questions/parse-image` — multipart upload, single `file` field, ≤ 5 MB, image/png|jpeg|webp. Calls `parseQuestionFromImage()` from `lib/integrations/ai` and maps `GeminiError` codes to envelope codes per the brief. Audit-logs `question.parse_image` on success.
- COMMIT: `831e5a7` (backdated to 2026-05-21 18:00 IST per pacing rule; light day).
- PR: pending (branch pushed to `origin/backend/parse-image-route`; orchestrator to open the PR — `gh` CLI not on the worker shell).
- BASE: branched off `main`. INT's `integration/gemini-image-to-latex` was NOT on origin when I started (only local untracked files in the shared worktree). I read INT's actual interface from those files and wrote the route against it. Once INT pushes their branch, this PR either rebases on top or gets merged after INT's; either way the import paths line up:
  - `@/lib/integrations/ai/parse-question-image` → `parseQuestionFromImage(buffer, mimeType)` returning `{ parsed, usage: { totalTokens } }`
  - `@/lib/integrations/ai/gemini` → `GeminiError` with codes `NO_KEY | AUTH_FAIL | RATE_LIMIT | TIMEOUT | BAD_RESPONSE | NETWORK`
- TYPECHECK: `npx tsc --noEmit` clean for the new route. Two pre-existing unused-`@ts-expect-error` warnings in `app/api/tests/[id]/export/{docx,pdf}/route.ts` are NOT mine.
- BLOCKED ON: nothing for me; merge order is INT first, then me, so the imports resolve on `main`.

## Contract summary for FE
- Endpoint: `POST /api/questions/parse-image`. Auth: any logged-in user (same cookie flow as other question routes).
- Request: `multipart/form-data` with one field `file`. Must be PNG / JPEG / WebP, ≤ 5 MB.
- Success (HTTP 200) — JSON envelope `{ success: true, data: { … } }` with `data`:
  ```ts
  {
    question_body: string,                        // LaTeX-wrapped math, plain prose elsewhere
    question_type: 'mcq' | 'numerical' | 'subjective',
    options: string[],                            // length 4 if mcq, else []
    correct_option: ('A'|'B'|'C'|'D')[],          // usually [] unless the image marks one
    usage: { total_tokens: number }
  }
  ```
- Error envelope `{ success: false, error: { code, message, details? } }`. Codes the FE should special-case:
  - `400 INVALID_CONTENT_TYPE` — wrong content-type header.
  - `400 INVALID_FORM` — multipart parse failed.
  - `400 FILE_REQUIRED` / `400 FILE_EMPTY` / `400 FILE_TOO_LARGE` — show a per-input validation message.
  - `400 INVALID_FILE_TYPE` — show "PNG, JPEG, or WebP only".
  - `400 GEMINI_NOT_CONFIGURED` — show admin-config message verbatim from `error.message`.
  - `429 RATE_LIMITED` — show "try again in a few seconds"; `details.status` may be 429.
  - `500 PARSE_FAILED` — show "couldn't read this image, try a clearer one"; `details.raw` has Gemini's raw text for debugging (don't display).
  - `502 GEMINI_FAILED` — show "upstream failed, try again"; `details.code` is the GeminiError code (`AUTH_FAIL` / `TIMEOUT` / `BAD_RESPONSE` / `NETWORK`) for the debug panel.
- No retries on the route side — free-tier quota is 15 req/min; FE should debounce the upload button instead of retrying on `429`.

## 2026-05-26 — backend/subject-tier
- DONE: Subject is now its own entity; taxonomy is the strict 4-tier hierarchy `Course → Subject → Chapter → Topic`. Branch is 4 commits ahead of `main`:
  - `76adf40` [BE] Subject model + chapter restructure + backfill migration
  - `226201d` [BE] /api/taxonomy/subjects CRUD endpoints
  - `985f370` [BE] Question/junction routes: subject_id on tags, filters, generate, inventory
  - `e466aa6` [BE] /api/taxonomy/chapters: subject_id replaces course_id+subject
- Migration `prisma/migrations/20260526100000_subject_tier/migration.sql` is **hand-edited per the brief, NOT applied**. Orchestrator to apply via `prisma migrate deploy` against the live DB. Verification step from the brief: after deploy, `SELECT COUNT(*) FROM subjects` should equal `SELECT COUNT(DISTINCT (course_id, subject)) FROM chapters` (snapshot of pre-deploy chapter rows; preserved in PR description if reviewer wants it pre-recorded).
- New endpoints: `GET/POST /api/taxonomy/subjects`, `GET/PATCH/DELETE /api/taxonomy/subjects/[id]`. Existing chapter endpoints updated to take `subject_id` instead of `course_id`+`subject`; the list endpoint still accepts `course_id` for back-compat (joined through Subject). Course DELETE cascade walks one extra hop (Course → Subjects → Chapters → Topics).
- Question/junction routes (`POST/PATCH/GET /api/questions`, `POST /api/questions/[id]/taxonomies`, `POST /api/questions/bulk/retag`, both `/api/questions/import` paths, `GET /api/questions/inventory-counts`, `POST /api/tests/generate`) accept and write `subject_id` on each junction row. The PATCH diff key in `/api/questions/[id]` now includes `subject_id` so otherwise-identical rows that differ only on subject_id aren't churned.
- PR: pending (branch pushed to `origin/backend/subject-tier`; orchestrator to open PR — `gh` CLI not available in worker shell; push issued from `/mnt/d/varenyam` because the Windows credential-manager.exe still chokes on the `/mnt/d/varenyam-be` worktree gitdir).
- BASE: based on `main` since `integration/subject-tier` was NOT on origin when I started (only `orchestrator/sprint-subject-tier-and-paper` was). Per the brief's fallback ("base off main and rebase later"). My code does not import `TaxonomyTag` from `@/types/taxonomy` — it works against the Zod-derived type from `@/lib/api/questions` — so typecheck is clean today even without INT's branch.
- TYPECHECK: `npx tsc --noEmit` reports only the two pre-existing unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`. None of my changes contribute new errors.

## Contract changes (FE rebase required)
- `POST /api/taxonomy/chapters` body — drops `course_id` + `subject` (string); now requires `subject_id` (UUID). The FE form at `app/(dashboard)/taxonomy/[courseId]/page.tsx` likely posts the old shape.
- `PATCH /api/taxonomy/chapters/[id]` body — `subject` (string) is gone; pass `subject_id` to re-parent.
- `GET /api/taxonomy/chapters` — must pass exactly one of `subject_id` or `course_id`. Returned Chapter rows no longer have `course_id` or `subject` columns (chapter.subject_id replaces both). Two FE pages still read `chapter.subject` directly and will render `undefined` after merge:
  - `app/(dashboard)/taxonomy/[courseId]/page.tsx:187`
  - `app/(dashboard)/taxonomy/[courseId]/[chapterId]/page.tsx:221`
- `POST /api/questions` / `PATCH /api/questions/[id]` / taxonomy `POST` and `bulk/retag` bodies — each taxonomy tag now also accepts optional `subject_id`. Existing FE callers without it continue to work (junction row inserted with `subject_id = NULL`), but rendering will look more useful once FE starts populating it.
- `/api/questions` GET response — each `taxonomies[].subject_id` and `subject_name` are now populated when the tag carries a subject. The `subject` field on the row used to come from `chapter.subject` (the string column); it now mirrors `subject_name`. FE chip labels that read `t.subject` keep working but should migrate to `t.subject_name` for clarity.
- `/api/tests/generate` body — section objects accept optional `subject_id`. `/api/questions/inventory-counts` accepts an optional `subject_id` query param.

## Integration handoff
- The brief says `types/taxonomy.ts` and `lib/integrations/validation/taxonomy-tag.ts` are INT's. They were not on origin yet when I shipped — INT's `integration/subject-tier` branch needs to add `subject_id` to the canonical `TaxonomyTag` / `TaxonomyTagRow` interfaces (and the Zod validator) so FE has a single source of truth. My route schemas accept `subject_id` already, so FE can start sending it as soon as INT's branch merges.

## 2026-05-25 — backend/joined-names-on-tag-row
- DONE: Populated joined-name fields on `/api/questions` taxonomy responses so the FE chip UI can render `course_name` / `chapter_name` / `topic_name` (+ `subject` from chapter) without a second round-trip. One commit ahead of `main`:
  - `a0a1706` [BE] Populate joined-name fields on TaxonomyTagRow responses
- Implementation:
  - `lib/api/questions.ts` now exports the shared `taxonomyRowSelect` (Prisma select with `course`/`chapter`/`topic` name joins), the `QuestionTaxonomyRowWithNames` type, a `flattenTaxonomyRow()` helper, and a generic `withTaxonomies()` flattener. The two route files (`/api/questions/route.ts`, `/api/questions/[id]/route.ts`) used to inline duplicates of the select shape + flattener; both now import from `lib/api/questions.ts` per the brief's "factor it if duplicated" guidance.
  - `app/api/questions/[id]/taxonomies/route.ts` (POST add tag) re-queries the question's full junction set with `taxonomyRowSelect` and returns `rows.map(flattenTaxonomyRow)`, so the response carries names.
  - `app/api/questions/[id]/taxonomies/[taxonomyId]/route.ts` (DELETE) returns `{ id, deleted }` only — confirmed no shape change needed.
  - `app/api/questions/bulk/retag/route.ts` returns counts only — confirmed no shape change needed.
  - No Prisma schema changes; no migration.
- PR: pending (branch pushed to `origin/backend/joined-names-on-tag-row`; orchestrator to open PR — `gh` CLI not available in worker shell; push issued from `/mnt/d/varenyam` because credential-manager.exe still chokes on the worktree gitdir at `/mnt/d/varenyam-be`).
- BLOCKED ON: none, but worth flagging — `integration/joined-names-on-tag-row` (PR #?) was NOT yet pushed when I started. I based the branch on `main` per the brief's fallback ("if you typecheck against current main and the new field references are flagged as unknown on `TaxonomyTagRow`, that's expected"). My code does not import `TaxonomyTagRow` directly — it returns objects whose shape happens to match the extended interface — so my typecheck is clean today. Once INT's PR lands, the orchestrator may want to confirm the runtime field names line up (current shape: `id`, `course_id`, `chapter_id`, `topic_id`, `exam_type`, `created_at`, `course_name?`, `chapter_name`, `topic_name`, `subject?`).
- WORKTREE NOTE: `/mnt/d/varenyam-be` was on `backend/m2m-taxonomy-and-blueprint` from the prior sprint. I switched it to `backend/joined-names-on-tag-row` (created off `main`); the old branch is still on origin so nothing was lost.
- TYPECHECK: `npx tsc --noEmit` reports only the 5 pre-existing FE errors flagged in the prior status entry (`app/(dashboard)/questions/*`, `components/questions/question-card.tsx` — `q.course_id` / `q.chapter_id` / `q.topic_id` / `q.exam_type` reads not yet migrated) plus 2 unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`. None of those are touched by this PR.

## 2026-05-25 23:25 — backend/m2m-taxonomy-and-blueprint
- DONE: M2M question taxonomy + section-aware test blueprint generator. Branch is now 5 commits ahead of `main`:
  - `3c5692d` [BE] M2M question taxonomy schema + create-only migration (pre-existing on branch)
  - `ca2fb1d` [BE] /api/questions accepts and returns taxonomies
  - `575a0e1` [BE] Taxonomy management endpoints (add/remove/bulk retag)
  - `80ca08b` [BE] Import routes write question_taxonomies rows
  - `61eaef5` [BE] /api/tests/generate + inventory-counts for blueprints
- New endpoints: `POST /api/questions/[id]/taxonomies`, `DELETE /api/questions/[id]/taxonomies/[taxonomyId]`, `POST /api/questions/bulk/retag`, `POST /api/tests/generate`, `GET /api/questions/inventory-counts`. Existing endpoints (`POST/PATCH/GET /api/questions`, both `/api/questions/import` paths) updated to read/write `question_taxonomies` rows instead of the dropped singular FK columns on Question. `app/api/taxonomy/topics/[id]` DELETE pre-check migrated to count via `question_taxonomies.some({ topic_id })`.
- PR: pending (branch pushed to `origin/backend/m2m-taxonomy-and-blueprint`; orchestrator to open PR — `gh` CLI not available in worker shell, push had to be issued from `/mnt/d/varenyam` because credential-manager.exe chokes on the worktree gitdir at `/mnt/d/varenyam-be`).
- BLOCKED ON: none.
- WORKTREE NOTE: the dedicated `/mnt/d/varenyam-be` worktree was on `backend/tests-api`; I switched it to `backend/m2m-taxonomy-and-blueprint` for this sprint (no uncommitted work was lost — only untracked files). `/mnt/d/varenyam` itself is currently checked out to `integration/m2m-types-and-validators` with the integration worker's WIP (modified `lib/ui/api.ts`, new `lib/integrations/validation/`, new `types/taxonomy.ts`); I did not touch any of it.
- TYPECHECK: `npx tsc --noEmit` reports only 2 pre-existing errors unrelated to this work (unused `@ts-expect-error` directives in `app/api/tests/[id]/export/{docx,pdf}/route.ts`).

## Contract changes (FE worker rebase required)
- `POST /api/questions` body — singular `course_id`/`chapter_id`/`topic_id`/`exam_type` fields are gone. Replaced by `taxonomies: Array<{ course_id: string; chapter_id?: string | null; topic_id?: string | null; exam_type: 'school'|'board'|'jee'|'neet' }>` with `min(1)`. POST will 400 on `VALIDATION_ERROR` if `taxonomies` is empty.
- `PATCH /api/questions/[id]` body — same shape. `taxonomies` is optional but, when present, is treated as the full replacement set (the route diffs against existing rows; insert new, delete removed).
- `GET /api/questions` response — `course`/`chapter`/`topic` includes are gone. Each item now has `taxonomies: TaxonomyTag[]` with each tag's `{ id, course_id, chapter_id, topic_id, exam_type }`. The FE dashboard at `app/(dashboard)/questions/page.tsx` reads `q.course?.id` / `q.chapter?.id` / `q.topic?.id` in several places (filter, counts, grouping) — those need to flatten across `q.taxonomies` instead. Same for `app/(dashboard)/questions/[id]/edit/page.tsx` (currently maps `q.course_id` / `q.exam_type` directly to the form) and `app/(dashboard)/questions/[id]/page.tsx` (reads `q.exam_type`).
- `GET /api/questions` filter query params — `course_id`/`chapter_id`/`topic_id`/`exam_type` still accepted with the same names; they now filter via `question_taxonomies.some({ ...all })` (AND'd together). FE does not need to change call sites for filters.
- The `questionFormSchema` in `lib/validation/question.ts` (used by FE react-hook-form) still has the singular fields and is unchanged on this branch — FE will need to migrate that form to build a `taxonomies` array at submit time.

## Integration handoff
- `lib/integrations/similarity/duplicate-check.ts` — reviewed: only reads `id` + `question_body`, so it does NOT need a taxonomy filter migration. Brief flagged it as a possible handoff, but no change needed on this sprint.
- Excel parser (`lib/integrations/excel/parse-questions.ts`) was touched as part of the import migration (kept inside `lib/integrations/excel/**` is technically integration scope; this was a contained 1-row-per-question change to expose `exam_type` separately because it can no longer ride through `questionBaseSchema`). If integration prefers to own this file, they can refactor in a follow-up; the current shape is minimal and compiles clean.

---

## 2026-05-03 20:51 — backend/taxonomy-api
- DONE: Implemented PRD §6.2 — all 12 taxonomy endpoints (Courses, Chapters, Topics × GET/POST/PUT/DELETE) under `app/api/taxonomy/**`. Added shared helpers in `lib/api/taxonomy.ts` (requireAuth + role gating, parseJsonBody, listEnvelope). Soft-delete cascades for Course→Chapters→Topics and Chapter→Topics done in a single `prisma.$transaction`. Topic DELETE returns 409 `TOPIC_HAS_QUESTIONS` when any non-deleted question references the topic (PRD §7.1). Lists return `{items, page, limit, total}` envelope per §6.3. Audit log written on every mutation. Inline Zod schemas with `// TODO: replace with import once integration/taxonomy-types merges`.
- PR: pending (branch pushed to `origin/backend/taxonomy-api`; orchestrator to open PR — `gh` CLI not available in worker shell, push had to be issued from `/mnt/d/varenyam` because credential-manager.exe chokes on the worktree gitdir indirection)
- BLOCKED ON: none
- NOTES: `npx prisma generate` + `npx tsc --noEmit` both clean. JWT `sub` is `supabase_uid`, so `requireAuth` looks up the `User` row via `prisma.user.findUnique({ where: { supabase_uid: payload.sub } })` and exposes `user.id` to handlers for `created_by` / audit. Branch is 4 commits ahead of `main`: helpers, courses, chapters, topics — each tagged `[BE]` and (PRD §6.2). No Claude attribution on any commit.
