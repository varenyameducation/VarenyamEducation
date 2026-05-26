# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Subject tier UI + live-fetch picker + branded paper redesign

This is a 3-track FE sprint on a single branch. All three tracks must ship together.

**Why:**
1. Taxonomy is moving to a **strict 4-tier hierarchy**: Course → Subject → Chapter → Topic. The Taxonomy Manager UI is currently 3-tier. It needs a new route level for Subject and the tag picker must walk all 4 levels.
2. The `TaxonomyTagPicker` (used by question form, edit page, bulk-retag modal) **reads from hardcoded mocks** (`MOCK_COURSES` / `MOCK_CHAPTERS` / `MOCK_TOPICS` in `lib/ui/mocks/taxonomy.ts`) instead of the live `/api/taxonomy/*` endpoints. That's why the dropdown only shows three fictional courses ("Class 11 — PCM", "JEE Foundation", "NEET Class 12") even though the user has created real courses in their DB. Replace with live fetches.
3. The question-paper export (PaperTemplate.tsx + docx.ts + pdf.ts) needs to be redesigned to match a reference DOCX. Diagrams currently render too large; questions need tighter formatting; the header must use Varenyam branding.

**Branch:** `frontend/subject-tier-and-paper`

**Base off:** `backend/subject-tier` if BE has not merged; `main` once it has. The Taxonomy Manager subject UI + tag picker rewrite both depend on `/api/taxonomy/subjects` existing.

---

## TRACK 1 — Taxonomy Manager: add Subject tier

Existing routes (3-tier):
- `app/(dashboard)/taxonomy/page.tsx` — Course grid
- `app/(dashboard)/taxonomy/[courseId]/page.tsx` — Chapter list
- `app/(dashboard)/taxonomy/[courseId]/[chapterId]/page.tsx` — Topic list

New routes (4-tier):
- `app/(dashboard)/taxonomy/page.tsx` — Course grid (unchanged structurally; click navigates to subjects under that course)
- `app/(dashboard)/taxonomy/[courseId]/page.tsx` — **Subject list** (new behavior): cards for each Subject under the course; "Add Subject" modal; click navigates to chapters under that subject
- `app/(dashboard)/taxonomy/[courseId]/[subjectId]/page.tsx` — **Chapter list** (NEW route depth): chapters under the selected subject; "Add Chapter" modal; click navigates to topics
- `app/(dashboard)/taxonomy/[courseId]/[subjectId]/[chapterId]/page.tsx` — Topic list (existing topic UI, just moved one level deeper)

Implementation notes:
- All four levels fetch live data via the relevant `/api/taxonomy/*` endpoints. Drop any remaining mock taxonomy imports.
- Each route shows breadcrumbs at the top: `Taxonomy / <Course> / <Subject> / <Chapter>` (depending on depth).
- Add/Edit/Delete modals per level. Use the existing `Dialog` + `react-hook-form` patterns.
- Soft-delete cascade is BE's job (Course→Subjects→Chapters→Topics); FE just needs to call DELETE on the right node and refresh the list.
- The "Subject" modal form: name (free-text, required, max 80 chars). No `subject_type` / enum dropdown — subjects are arbitrary strings per course.

---

## TRACK 2 — TaxonomyTagPicker: kill the mocks, fetch live, walk 4 levels

`components/questions/taxonomy-tag-picker.tsx` currently imports from `@/lib/ui/mocks/taxonomy` (lines 6-9). Rewrite it to:

- Fetch **all four** dropdowns from the API:
  - Courses: `GET /api/taxonomy/courses` (one-shot at mount, cached in component state)
  - Subjects: `GET /api/taxonomy/subjects?course_id=<picked>` (refetch when course changes)
  - Chapters: `GET /api/taxonomy/chapters?subject_id=<picked>` (refetch when subject changes)
  - Topics: `GET /api/taxonomy/topics?chapter_id=<picked>` (refetch when chapter changes)
  
- Disable / clear the dependent dropdowns until the parent is picked. The "Pick course first" placeholder text pattern in the screenshot is correct; extend it to all dependent levels.

- The picker's `value` shape becomes `TaxonomyTag` with the new `subject_id` field. When the user selects a chapter, automatically populate `subject_id` (and `course_id`) from the chapter's parent chain so the consumer doesn't have to think about it.

- Use a small SWR-style caching helper (or plain useEffect + state) — the lists are bounded (single institute), no pagination handling needed; passing `?limit=1000` to the list endpoints is fine.

- **Delete `lib/ui/mocks/taxonomy.ts`** at the end of the migration. Anything that still imports from it (probably old taxonomy manager fallbacks or test files) must be updated to live fetches or deleted.

- **Delete the `MOCK_M2M_TAGS_BY_QUESTION` block in `lib/ui/mocks/m2m.ts`** since questions now always come from BE with real taxonomy rows. Keep `mockInventoryCounts` only if it's still used by a degradation path; otherwise remove that too.

- The picker is used by: question form, question edit page, bulk-retag modal. All three should "just work" after the rewrite because they consume the same `TaxonomyTag[]` interface.

- Chip rendering: now that BE populates `subject_name` on `TaxonomyTagRow`, the chip label can be `course_name → subject_name → chapter_name → topic_name · exam_type` (joining with `→` and dropping null segments). Update `formatTagLabel` in `lib/ui/mocks/m2m.ts` (which is now a misnamed module — feel free to rename to `lib/ui/taxonomy-helpers.ts` or similar if you prefer; not required).

---

## TRACK 3 — Question paper redesign (BIG)

The current `lib/export/PaperTemplate.tsx` + `lib/export/docx.ts` + `lib/export/pdf.ts` produce papers that the user finds badly formatted: diagrams render too large, questions aren't laid out tightly, header doesn't match brand. **Redesign to match the reference DOCX** the user provided and apply Varenyam brand colors.

### Reference document analysis (already done by orchestrator)

Reference: `/mnt/c/Users/HP/Downloads/Class 8th_Maths_Question Paper_ Algebra Play_Chapter Test (1).docx`

Key structural decisions to replicate:
1. **Page setup**: US Letter, narrow margins (top ~1.4cm, bottom ~1.8cm, left ~2.5cm, right ~0.6cm). Body text in a serif font (Georgia or Times New Roman).
2. **Header (running, on every page)**: Logo on left, course/subject/chapter title in middle ("Class 8 – Maths – Chapter Test"). The reference puts a "Scan to Download App" QR on the left — **the user explicitly does NOT want barcodes/QR**. Replace with the Varenyam logo image instead.
3. **First page** (in order, top to bottom):
   - Brand header (logo + institute name centered + tagline) — primary teal
   - 1px brand-red horizontal rule
   - "Board: <board> (Standard)" — single line, bold, brand teal
   - Test mode chips (Adaptive Practice / Beginner Test / Advanced Test / Answer Key) — **OPTIONAL** based on data; if the test is plain, render just the title. Don't replicate all four modes if our test doesn't have them.
   - Meta grid (3-col): Time, Maximum Marks, Topic — bold labels in teal
   - Student Name + Roll No. (dotted lines for handwriting)
   - "General Instructions" header, bulleted list (use the instructions string from the test if provided, else a default 5-point list)
   - **Marking Scheme table** — replicate this. Columns: Section / Marks for each Question / # of Questions / Total Marks / Marks Obtained (blank column for grading). Filled from the test's section blueprint summary.
4. **Section dividers** ("Section – A (Multiple Choice Questions)") — full-width filled bar, brand-teal background, white bold text. Section type description in italics underneath.
5. **Questions**:
   - Number prefix "Q1." in bold
   - Question body in normal weight
   - MCQ options laid out in **2-column grid** ((A) ... (B) ... on one row, (C) ... (D) ... on the next). Use HTML table in DOCX / flex grid in PaperTemplate.tsx.
   - Marks chip `[ 1 ]` right-aligned on the line below options (matches reference)
   - **Diagrams (image_urls)**: cap rendered width to `max(200px, 35% of page width)` and `max(180px image height)`. Center them. This fixes the "diagrams look too big" complaint.
6. **Spacing**: question→options 4pt gap, options→marks 2pt gap, marks→next-question 12pt gap (tighter than what we have today).
7. **Footer (running)**: brand-color top rule, then small text: `<footer_text> · <inst_name> · Page X of Y`. Already done in current code; keep but use new teal color.

### Brand palette (locked — use these exact hex codes)

```
Primary teal     #0E6E84   header chrome, section bars, footer rule
Primary red      #D63D2F   horizontal dividers, marks-chip border, callouts
Accent yellow    #F2B33D   reserved for the logo accent only (do not use elsewhere)
Body text        #1F2937
Subtle text      #6B7280   meta labels, page numbers
Hairline         #D1D5DB   table borders
```

The existing `InstituteBranding.brand_color_hex` defaults to `1B3A6B` (old navy). Update the row in DB via orchestrator — but the template should also accept the new brand color via the existing branding fetch. **Do NOT hardcode the teal in the template** — read it from `InstituteBranding.brand_color_hex` and have it default to the new `#0E6E84` if the row says `1B3A6B` or is unset. (One-line fallback in the template; orchestrator will update the DB row separately.)

### Logo asset

The user's Varenyam logo is at `public/brand/varenyam-logo-full.png` (full wordmark) and `public/brand/varenyam-logo-mark.png` (icon only). Both are committed by orchestrator alongside this brief.

- Use `varenyam-logo-full.png` in the PaperTemplate header (high-res, looks great printed).
- For the DOCX export, embed the logo using the existing `docx` library `ImageRun` pattern.
- For the PDF export (Puppeteer-based), reference the public path directly.
- The reference DOCX has the logo around 110-130px tall in the header. Match that.

### File-by-file changes

#### `lib/export/PaperTemplate.tsx`

- Restructure the header to match the reference layout.
- 2-column MCQ option grid via CSS Grid (`grid-template-columns: 1fr 1fr; gap: 8px 32px`).
- Image rendering: wrap each `image_url` in a centered figure with `max-width: 280px; max-height: 180px; object-fit: contain;`. Inline image placeholders `[[IMG:url]]` in `question_body` get the same constraints.
- Marks chip: small inline span with `border: 1px solid var(--brand-red); border-radius: 999px; padding: 0 6px; font-size: 11px;` text `[ <marks> ]`.
- Section divider component: full-width banner.
- Use Georgia 11pt for body (reference uses 10-11pt; 11 is comfortable on screen too).

#### `lib/export/docx.ts`

- Match the same layout in the `docx` library's TypeScript API. Two-column MCQ via `Table` with single row, two cells.
- Embed logo via `ImageRun` reading from `public/brand/varenyam-logo-full.png`.
- Image width cap: `width: 280, height: 180` on `ImageRun` instances. Keep aspect ratio via the `transformation` option.
- Marking-scheme table: separate `Table` with the columns enumerated above. Compute from `test.sections` blueprint summary.
- Header (`Header` with `headerReference`): logo on left, title centered, page number right.
- Section banner: `Table` with single cell, background fill `0E6E84`, white bold text.

#### `lib/export/pdf.ts`

- This wraps Puppeteer over the PaperTemplate HTML. Update CSS to use the new palette and tighter spacing. Update the chrome footer to use brand-teal top border instead of whatever it has.

#### Test creator preview

- `components/tests/test-preview-modal.tsx` should show a render-faithful preview using the same PaperTemplate component (since it's already React). Confirm it still works after the redesign.

### Validation for the paper redesign

- Generate a paper with: 2 sections, mixed question types (mcq + numerical + subjective), at least one question with an inline `[[IMG:url]]` placeholder. Eyeball the DOCX and PDF outputs against the reference.
- Diagrams must not exceed ~280×180 px regardless of source image size.
- Print preview at 100% should fit one question per ~quarter page for MCQs.

---

## Final validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-fe`.
- [ ] Smoke test in dev: question creation form shows the 5 real courses (not the three mocks), and selecting a course populates real subjects, then real chapters, then real topics.
- [ ] Generate a paper via `/tests/<id>/export/docx` and `/tests/<id>/export/pdf`, open both; verify branded header + 2-col MCQ + capped images.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Wait for BE to push `backend/subject-tier`. Verify with `git fetch origin && git log origin/backend/subject-tier --oneline -3` — if branch missing, BE is still working; wait for orchestrator dispatch.
3. `git checkout -b frontend/subject-tier-and-paper` based on `origin/backend/subject-tier` (or `main` if BE merged). Update `npx prisma generate` against the new schema.
4. Implement all three tracks. Commit by group:
   - `[FE] Taxonomy Manager: add Subject route level + CRUD UI`
   - `[FE] TaxonomyTagPicker: live-fetch all 4 dropdowns; delete mocks`
   - `[FE] Paper redesign: branded header + 2-col MCQ + capped diagrams (DOCX + PDF + PaperTemplate)`
5. Push. If credential-manager refuses from `/mnt/d/varenyam-fe`, commit locally and write a clear note in status — orchestrator will push from `/mnt/d/varenyam` via `git push -u origin frontend/subject-tier-and-paper:frontend/subject-tier-and-paper`.
6. Append status entry to `.agents/status-frontend.md` with branch, commit list, push URL (or "push pending creds"), and any deferred follow-ups.
7. **Stop.** Skip `~/report.sh`.

## Hard rules

- Single PR. Three commits, one branch.
- Do not touch `types/**`, `app/api/**`, `prisma/**`, `lib/integrations/**`.
- Do not break the existing question creation / bulk retag / blueprint generation flows. The whole point of dropping mocks is to make them work against real data; don't regress them.
- Do not hardcode the brand color in the template. Read from `InstituteBranding.brand_color_hex` with fallback to `#0E6E84` if the value is missing or equal to the old `1B3A6B` default.
- Diagrams must respect the size cap. The user's #1 complaint is "diagrams look really big" — that's a regression criterion.
- No Claude attribution.
