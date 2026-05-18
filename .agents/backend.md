# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — HOTFIX #3: externalize pdfjs-dist + pdf-to-img so Vision-PDF actually works

**Severity: P1.** The Vision-PDF opt-in path (`vision='true'` form field) still returns 500 even AFTER hotfix #1 (lazy-import) and #2 (Zod schema relaxation). Orchestrator just verified live:

```
POST /api/questions/import (vision=true, 65-S-1_Mathematics-7.pdf) → 500 in 1.4s
Cause: TypeError: Object.defineProperty called on non-object
  at __webpack_require__.r
  at eval (pdfjs-dist/legacy/build/pdf.mjs:1:21)
  at eval (pdf-to-img/dist/index.js:7:89)
  at eval (lib/integrations/document/render-pdf-pages.ts:5:68)
  at async handlePdfVisionImport (route.ts:1089:37)
```

Hotfix #1 deferred the load from module-init time to request time, but **Webpack still bundles `pdfjs-dist`'s ESM** and the bundled output crashes when Next.js's RSC `__webpack_require__.r` runtime hits the module. The lazy-import didn't fix the underlying webpack incompatibility — it just moved when the crash happens.

This is **the single change** that makes the Vision feature work. The user is explicit they want clean math rendering for bulk PDF uploads, and that requires Gemini Vision.

### The fix (literally one line in next.config)

**Branch:** `backend/hotfix-vision-external-packages`

**Base off:** `main` (the two prior hotfixes are already merged as PR #38, #41).

`next.config.mjs` (or `.ts` / `.js` — whichever extension the repo uses; check first):

```js
const nextConfig = {
  // ... existing config ...
  
  // Externalize pdfjs-dist and pdf-to-img so Next.js loads them via Node's
  // CommonJS require at runtime instead of bundling through Webpack. The
  // bundled ESM of pdfjs-dist crashes Webpack's RSC __webpack_require__.r
  // with "Object.defineProperty called on non-object". This list is the
  // documented fix for native/heavy ESM Node modules in App Router.
  serverExternalPackages: [
    'pdf-to-img',
    'pdfjs-dist',
  ],
}
```

If there's already a `serverExternalPackages` array in the config (sometimes called `experimental.serverComponentsExternalPackages` on older Next.js versions — check), append these two entries to it.

If neither key exists, add at the top-level config object as shown above (Next 14.2 supports `serverExternalPackages` at the top level).

**Important**: do NOT also touch the `handlePdfVisionImport` dynamic import in `app/api/questions/import/route.ts` — the previous hotfix's lazy import stays in place. With `serverExternalPackages` set, both the dynamic and a top-level import would now work, but leave the lazy import alone for now (it's a defense-in-depth pattern that doesn't hurt).

### Validation — the critical smoke test you MUST run

After applying the fix, **restart dev fully** (`rm -rf .next && npm run dev`), then live-test against the user's file:

```bash
# Mint an auth token (see orchestrator's prior smoke runs for the pattern)
# Then:
curl -s -b "__access_token=$ACCESS" "http://localhost:4000/api/questions/import" \
  -F "file=@/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf" \
  -F "course_id=a24954d1-11c6-43d5-ae49-89cc536a3e2e" \
  -F "subject_id=4319511a-ee63-4655-ac9d-efce03fc7194" \
  -F "chapter_id=1ecf79a8-0db1-4d00-a86a-d6ea97c53832" \
  -F "topic_id=f6eb3ea1-6a9e-4821-a260-17c5bc21e91f" \
  -F "subject=Maths" -F "difficulty=medium" -F "exam_type=board" \
  -F "marks_default=1" \
  -F "vision=true" \
  -w "\n%{http_code} %{time_total}s"
```

Expected:
- HTTP 200 (NOT 500).
- Response includes `imported > 0`, `pages_processed > 0`, `total_tokens > 0`.
- The PDF in question is 1 page so expect roughly: `imported: 3-5, pages_processed: 1, total_tokens: ~1500-2500`.
- Total time: ~10-30 seconds.
- The most recent question in the DB after this call should have `question_body` containing `\(\frac{...}{...}\)` style LaTeX (not flat text).

**Capture the actual numbers in your status entry.** Orchestrator will re-run the same smoke for double verification.

### What you do NOT change

- `app/api/questions/import/route.ts` — leave the existing lazy-import. Don't move it back to top-level.
- `lib/integrations/document/render-pdf-pages.ts` — fine as-is.
- The Gemini parsers — fine as-is.
- Other webpack/Next config — only add `serverExternalPackages`.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/hotfix-vision-external-packages`
3. Make the next.config edit. **Run the smoke test live** as documented above.
4. If smoke fails: troubleshoot (config typo, wrong Next.js version key, etc.) BEFORE pushing. **Do not push a broken fix.**
5. Single commit with `[BE]` prefix. **No Claude attribution.** Message: `[BE] Hotfix: externalize pdfjs-dist + pdf-to-img so Vision-PDF works`.
6. **Backdate per pacing rule.** Today (2026-05-27) is at cap-ish. Light days: 2026-05-15/16/17 (each at 6 currently). Pick `2026-05-18T20:00:00+05:30` (currently 4 commits on that day, plenty of room).
7. Push.
8. Append entry to `.agents/status-backend.md` — branch, commit, push URL, smoke-test output verbatim (HTTP code, imported count, tokens, the LaTeX-containing question body).
9. **Stop.**

### Hard rules

- One PR. One config file change.
- **No code changes** in route.ts or render-pdf-pages.ts unless absolutely necessary to make smoke pass — and if you do need code changes, flag in status why the config alone wasn't sufficient.
- The smoke test against the real CBSE PDF must pass before push. **No "assumed it works" — verify live.**
- The user has been very patient. Speed matters; correctness more.
