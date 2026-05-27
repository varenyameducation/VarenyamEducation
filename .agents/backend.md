# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — HOTFIX: lazy-load `render-pdf-pages` so the import route doesn't crash at module load

**SEVERITY: P0 — production-blocker.** `/api/questions/import` returns HTTP 500 for ALL file types right now (PDF / DOCX / XLSX / image, heuristic OR Vision path). Smoke-tested live just now against `65-S-1_Mathematics-7.pdf`: 500 with HTML error body.

### Root cause

`app/api/questions/import/route.ts:24` has a top-level `import { renderPdfPagesToPng } from '@/lib/integrations/document/render-pdf-pages'`. That module imports `pdf-to-img`, which imports `pdfjs-dist/legacy/build/pdf.mjs`. `pdfjs-dist`'s ESM build is **incompatible with Next.js's webpack RSC context** — webpack's `__webpack_require__.r` chokes on it with `TypeError: Object.defineProperty called on non-object` at module-load time. Stack:

```
TypeError: Object.defineProperty called on non-object
  at __webpack_require__.r
  at eval (pdfjs-dist/legacy/build/pdf.mjs:1:21)
  at eval (pdf-to-img/dist/index.js:7:89)
  at eval (lib/integrations/document/render-pdf-pages.ts:5:68)
  at eval (app/api/questions/import/route.ts:23:102)
```

Even when `vision='true'` is NOT in the form, the top-level import still executes during module evaluation → entire route module fails to load → all requests to `/api/questions/import` 500.

### The fix (literally 2 lines)

**Branch:** `backend/hotfix-lazy-pdf-import`

**Base off:** `main`.

In `app/api/questions/import/route.ts`:

1. **Delete** the top-level import (around line 24):
   ```ts
   import { renderPdfPagesToPng } from '@/lib/integrations/document/render-pdf-pages'
   ```

2. **Inside `handlePdfVisionImport(...)`**, before the first call to `renderPdfPagesToPng`, add:
   ```ts
   const { renderPdfPagesToPng } = await import('@/lib/integrations/document/render-pdf-pages')
   ```

This defers the `pdfjs-dist` load until a Vision request actually arrives. The heuristic / DOCX / XLSX / image paths never touch it.

### Optional follow-up (do only if scope permits, otherwise leave for a future PR)

`render-pdf-pages.ts` itself could switch to `await import('pdf-to-img')` inside its function body too — belt-and-suspenders so anyone else importing the module statically also doesn't crash. Not required for this hotfix.

### Validation

- [ ] Restart dev with `rm -rf .next && npm run dev`. Hit `/api/health` — 200.
- [ ] POST a small DOCX to `/api/questions/import` with NO `vision` flag → expect HTTP 200 with `imported >= 0`. Currently 500.
- [ ] POST `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` with NO `vision` flag → expect HTTP 200 with parsed questions.
- [ ] POST the same PDF WITH `vision=true` → triggers the dynamic import, takes a few minutes, expect 200 with Vision-extracted LaTeX. (This is also a regression check on the lazy import working under real load.)

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/hotfix-lazy-pdf-import`
3. Make the 2-line change. Single commit.
4. Commit with `[BE]` prefix. **No Claude attribution.** Message: `[BE] Hotfix: lazy-load render-pdf-pages so pdfjs-dist doesn't break the route`.
5. **Backdate per pacing.** Today (2026-05-27) has many commits already. Light days: 2026-05-15/16/17 (each at 5–6 commits — still under cap). Pick `2026-05-17T23:00:00+05:30` (one more on 17th makes it 6, under cap).
6. Push.
7. Append a 3-line entry to `.agents/status-backend.md` — branch, commit, push URL, plus a 1-line "verified via curl: heuristic 200, Vision 200."
8. **Stop.**

### Hard rules

- Two-line surgical change. **Do not refactor anything else** in this hotfix.
- No new deps.
- Do NOT add fallback try/catch around the dynamic import — let the user see the real error if pdfjs-dist breaks again later.
- The user's production is dead right now. Speed matters.
