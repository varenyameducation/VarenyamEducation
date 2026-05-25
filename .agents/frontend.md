# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Multi-tax UX + blueprint test creator + paper template redesign

**Sprint goal:** Three FE deliverables on one branch.
1. **Question multi-tax UX** — every question form, import flow, and detail view treats taxonomy as a multi-tag list (course × chapter × topic × exam_type), not a single dropdown chain.
2. **Test creator with blueprint** — section builder + difficulty-blueprint sliders that auto-pick questions; live inventory counts; preserve manual override.
3. **Paper template redesign** — the printable/PDF/DOCX paper looks like a real institutional question paper, not a stock document.

**Branch:** `frontend/multitax-blueprint-paper`

**You are blocked on the BE PR until its first commits land** for the API shape. Start with paper template redesign (no API dependency) while waiting, then do multi-tax UI against mocked API responses, then blueprint UI. Wire to real APIs in the last commits once BE merges.

### Track 1 — Question multi-tax UX

- [ ] `components/questions/question-form.tsx` — replace the singular Course / Chapter / Topic / Exam-type select chain with a **TaxonomyTagPicker** component (new file in `components/questions/taxonomy-tag-picker.tsx`). Behavior:
  - Shows currently attached tags as removable chips (e.g. `Class 8 CBSE · Algebra Play · school ✕`).
  - "Add tag" button opens an inline form: Course select → Chapter select (optional) → Topic select (optional) → Exam type select (required). On confirm, append to the chips list.
  - At least one tag required; form rejects submit otherwise.
  - Component is controlled — parent holds `taxonomies: TaxonomyTag[]` in form state.
- [ ] Question detail page (`app/(dashboard)/questions/[id]/page.tsx`) — show all attached taxonomies as a chip row above the body, not just one badge. Each chip clickable → filters the question bank by that tag.
- [ ] Question card (`components/questions/question-card.tsx`) — collapse multiple tags into "Class 8 CBSE · school +2 more" with a tooltip listing the rest.
- [ ] Bulk re-tag UI on the question bank list — checkbox column + "Move/Copy to…" button in the toolbar that opens a modal letting the user add/remove tags across the selected rows. Modal calls `POST /api/questions/bulk/retag`.
- [ ] Import flow (`app/(dashboard)/questions/import/page.tsx`) — the existing "defaults" form (Course / Chapter / Topic / Exam-type) is still used **for this brief** as the seed tag for all imported rows. Add a one-line note: "These tags will be applied to every imported question. You can add more tags later in bulk." Multi-tag-at-import UI is out of scope this sprint.

### Track 2 — Test creator with blueprint

- [ ] `app/(dashboard)/tests/new/page.tsx` — add a new mode toggle at the top: **Manual pick** (current behavior, preserved) vs **Blueprint** (new).
- [ ] **Blueprint mode** UI:
  - Meta inputs: title, course (select), subject (select — Physics/Chemistry/Maths/Biology), exam type (select), duration (minutes), instructions.
  - "Sections" list — each section row has: label input (e.g. "Section A"), optional chapter multi-select, optional topic multi-select, optional question_type select, and **difficulty sliders** for `easy/medium/hard/advanced` (number inputs).
  - Live inventory hint per row: as the user changes section scope, fetch `GET /api/questions/inventory-counts?course_id=&exam_type=&subject=&chapter_ids=&topic_ids=` (debounce 300ms) and show "12 hard available" next to each slider. If the requested count exceeds available, show a red warning.
  - "Generate test" button → `POST /api/tests/generate` with the assembled payload. On success, navigate to `/tests/<id>/edit` so the user can still reorder/tweak.
- [ ] **Manual mode** continues to use the existing picker + sortable list.
- [ ] Both modes share the same TestPreviewModal + download buttons.

### Track 3 — Paper template redesign

- [ ] `lib/export/PaperTemplate.tsx` and `lib/export/docx.ts` — match the redesigned layout. Both must produce visually equivalent output (one renders to HTML/PDF, one to DOCX).
- [ ] **Header block:**
  - If `branding.logo_url` exists, render logo at left (24mm tall). Else render a placeholder bordered box "LOGO" so the layout shape stays.
  - Centered: `inst_name` (bold, 18pt, brand color). Below it, `tagline` (italic, 11pt).
  - Right side: a small "Roll No." / "Name" stub box so it looks like a real paper. (PDF-only; skip on DOCX if too fiddly.)
  - Solid 2pt divider in brand color under the header.
- [ ] **Meta block** (under header, before title):
  - 3-column row: left "Course: …", center "Subject: …  ·  Exam: …", right "Duration: … min  ·  Max Marks: …".
  - Title centered, bold, uppercase, 14pt, with a thin underline.
  - Instructions in a soft-tinted box, brand-color left border, smaller font, label "General Instructions".
- [ ] **Section dividers:**
  - Each section starts with a centered uppercase label inside a brand-color filled bar (white text), with a half-line above/below.
  - Section blueprint summary under the label: "(Q1–Q5 · 5 × 2 = 10 marks)" — compute from the rows in the section.
- [ ] **Question row:**
  - Q-number left-aligned (bold, monospaced feel), question body indented to align after the number.
  - `[marks]` right-aligned in muted color.
  - Inline images get `max-height: 4cm` cap, centered on their own line, with `margin: 4mm 0`. Two side-by-side images are OK if they fit; otherwise stack.
  - MCQ options in a 2-column grid, `(A)/(B)/(C)/(D)` bold-prefixed.
  - Subjective questions get N answer lines depending on marks (cap 6 lines; honor the existing logic but tighten the visual rhythm).
- [ ] **Footer:** brand-color top border, centered: `footer_text · inst_name · Page X of Y`.
- [ ] Both PDF + DOCX use the brand color from `InstituteBranding.brand_color_hex` everywhere a color appears. Greys: text `#1a1a1a`, muted `#666`, line `#bbb`.

### Scope

- `app/(dashboard)/**`, `components/**`, `tailwind.config.ts`, `lib/ui/**`, `lib/export/PaperTemplate.tsx`, `lib/export/docx.ts`, `lib/export/TestPaperDocument.tsx`.
- Out of scope: `app/api/**`, `lib/api/**`, `lib/db/**`, `prisma/**`, `middleware.ts`, `lib/integrations/**`.
- If the BE response shape changes mid-sprint, watch `.agents/status-backend.md` for a `## Contract change` block.

### Mocks while BE in flight

- For Track 1 & 2: define a `lib/ui/mocks/m2m.ts` with a couple of sample TaxonomyTag arrays and a fake `inventory-counts` response. Wire UI against these initially; swap to real fetches once BE branch is open.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git checkout main && git pull && git checkout -b frontend/multitax-blueprint-paper`
3. Implement in this order: Paper template (no BE dependency) → Multi-tax UI (against mocks) → Blueprint UI (against mocks). Wire real fetches after BE PR opens.
4. Run `npm run dev`. Manually click through every new surface. Fix any console error.
5. Commit by track with `[FE]` prefix:
   - `[FE] Paper template redesign — branded header, section bars, image caps`
   - `[FE] TaxonomyTagPicker + question form/detail/card multi-tag UI`
   - `[FE] Bulk retag modal on question bank`
   - `[FE] Test creator blueprint mode + inventory hints`
   **No `Co-Authored-By: Claude` footer.**
6. Push. Record `pull/new` URL.
7. Append entry to `.agents/status-frontend.md` with branch, commit list, PR URL, and any unresolved contract questions for BE.
8. Run `~/report.sh frontend "<short summary>"`.
9. **Stop.**

### Hard rules

- One branch for all three tracks. Multiple commits.
- Do not edit `app/api/**` or `prisma/**`. If you need a missing API, write a `## Needs BE` block in status.
- Do not weaken existing manual-pick test creator — Blueprint is an additive mode, not a replacement.
