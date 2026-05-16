# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Import page revamp (simplified): 4-tier picker + image accept + clean results panel

**Critical context.** The previous sprint had you build a PDF Vision progress UI (SSE / per-page progress / "page X of N") on top of a BE Gemini-per-page pipeline. The user has rejected the Gemini-PDF path and reverted BE to plain text extraction + a heuristic LaTeX normalizer. **PDFs are instant again — no progress UI needed.** Single-image upload at the import page DOES still use Gemini (one call, takes 5-15s).

You shipped a previous version of this work on branch `frontend/import-page-revamp` with SSE plumbing — that branch is **not being merged**. You can cherry-pick the picker / image-accept / results panel pieces, but drop the SSE consumer.

**Branch:** `frontend/import-page-clean` (NEW branch)

**Base off:** `backend/bulk-import-heuristic` (BE's redo). If BE hasn't pushed yet when you start, wait or base off `main` and stub.

---

## Track 1 — Replace 3-tier dropdowns + hardcoded SUBJECTS with the 4-tier live cascade (KEEP)

`app/(dashboard)/questions/import/page.tsx`. Same as the prior sprint's brief: delete the `SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology']` enum, replace the 3-tier (Course / Chapter / Topic + standalone Subject enum) with the 4-tier live cascade (Course → Subject → Chapter → Topic) backed by `/api/taxonomy/courses|subjects|chapters|topics`.

If you can cleanly extract a shared `<TaxonomyCascade>` component used by both this page and the single-question `taxonomy-tag-picker.tsx`, do so. Otherwise inline 4 `<Select>` elements with copied fetch logic and note the duplication in your status entry.

## Track 2 — Accept image uploads (KEEP)

`<input type="file" accept=".xlsx,.docx,.pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp">`. Update the help copy:

> Upload a Word (.docx), PDF, Excel (.xlsx), or image (PNG / JPG / WebP) file.
> For images, Gemini Vision extracts the question with LaTeX math (one call, takes a few seconds).
> For PDFs and DOCX, text is parsed and math is normalized to LaTeX heuristically — math-heavy 2D layouts may need manual cleanup after import.
> MCQs auto-detected from `(A) (B) (C) (D)` options. Question numbering can be `1.` `Q1.` or similar.

## Track 3 — Results panel (SIMPLIFIED — no per-page progress)

Drop the SSE / "Page X of N" UI entirely. Single spinner + clear copy while the upload is in flight:

- For PDF / DOCX / XLSX: "Parsing your document…" (sub-second to a couple seconds; just show indeterminate spinner)
- For image: "Reading your image with Gemini Vision (5-15 seconds)…"

On response (HTTP 200):
- Big success row: "✓ 47 questions imported · 39 MCQ · 8 subjective"
- Below: errors list (collapsible) showing partial failures, if any. Use the existing envelope's `errors[]` array.
- For image uploads: also show "1 image processed · ~1.2k tokens (Gemini)" so the user has visibility on quota use.
- Clear "Import another" button to reset the form.

Drop:
- `Cancel` button (no longer needed — operations are short)
- AbortController plumbing
- Per-page progress bar
- `pages_processed` / `total_pages_in_doc` / `total_tokens` display for PDFs (BE may still return those fields for back-compat — just don't render them prominently; an "Advanced details" expander showing them is fine)

## Salvage from the prior `frontend/import-page-revamp` branch

You shipped that with SSE + 4-tier picker + image accept + results panel. The salvageable parts:
- 4-tier picker / cascade extraction → **keep**
- Image-accept attribute + help copy → **keep, but update copy** per the new direction
- Results panel structure → **keep skeleton, simplify** per Track 3 above
- SSE event consumer (`response.body.getReader()` chunking + `data:` line parsing) → **discard**
- AbortController / Cancel button → **discard**
- Per-page progress UI → **discard**

Cleanest: branch fresh off `backend/bulk-import-heuristic`, re-create the picker + image accept + simplified results panel. Don't try to surgically remove SSE from the existing branch — too tangled.

## Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-fe`.
- [ ] Manual test in dev:
  1. `/questions/import` shows all 5 real courses in the Course dropdown (no `Class 11 — PCM / JEE Foundation / NEET Class 12` mock leftovers).
  2. Cascade: pick CBSE → Subject populates → pick Maths → Chapter populates → etc.
  3. File input accepts PDF, DOCX, XLSX, PNG, JPG, WebP.
  4. Upload `65-S-1_Mathematics-7.pdf` → spinner appears briefly → results panel shows imported count. Math will be partially garbled — that's expected (BE's heuristic doesn't recover 2D layouts).
  5. Upload an image of a math question → spinner with "Reading your image with Gemini Vision…" → results panel shows 1 question imported with clean LaTeX.
- [ ] Regression: old Class-8 DOCX still imports correctly.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Wait for BE: `git fetch origin && git ls-remote origin backend/bulk-import-heuristic | grep refs/heads || echo "BE not pushed — wait"`.
3. `git checkout origin/backend/bulk-import-heuristic -b frontend/import-page-clean` (or base off main if BE merged).
4. `npx prisma generate`.
5. Implement. One commit OK.
6. Commit with `[FE]` prefix. **No Claude attribution.**
7. **Backdate per pacing.** Today (2026-05-27) is filling up. Light days 2026-05-15 / 16 / 17 have 1 commit each. Pick around `2026-05-15T20:00:00+05:30`.
8. Push (or commit locally for orchestrator push).
9. Append to `.agents/status-frontend.md`.
10. **Stop.** Skip `~/report.sh`.

## Hard rules

- Single PR.
- Don't touch `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**`.
- The 4-tier cascade dropdowns must use **live data**. No hardcoded enums. No mock fallbacks.
- No SSE plumbing. No progress bars. Operations are now short enough that a single spinner is the right UX.
- The user is testing this with `65-S-1_Mathematics-7.pdf` AND a standalone math image AND the old Class-8 DOCX. All three flows must work end-to-end visually.
