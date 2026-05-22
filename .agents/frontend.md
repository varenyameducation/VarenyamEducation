# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Paper polish: icon-only logo, smaller diagrams, no handwriting lines

User feedback after smoke-testing the merged paper redesign:

> "the pdf still is not nicely formatted the diagrams are really big and do not match the size if the ones in original PDF, the concept is to decrease the size of the images so it looks nicely formatted also no need to leave lines for any thing any answer, that is not required. logo should only be [the icon-only mark] not the entire name. tagline 'leading the way' is just for orchestrator's color-palette reference, otherwise on question paper only the logo has to be there on the side right now on the side it has both logo and name image. name has to be in centre only"

Three targeted fixes on the existing paper templates. **No schema, no API, no taxonomy work.**

**Branch:** `frontend/paper-polish-icon-and-cap-and-no-lines`

**Base off:** `main`.

### Fix 1 — Use icon-only logo mark (not the wordmark)

The header currently embeds `public/brand/varenyam-logo-full.png` (the full "VARENYAM" wordmark with text + tagline). Replace with `public/brand/varenyam-logo-mark.png` (icon-only heart-shape mark, 250×230 RGBA — already replaced on this orchestrator branch with the correct icon-only file the user just sent).

- `lib/export/PaperTemplate.tsx` — change `DEFAULT_LOGO_SRC` from `/brand/varenyam-logo-full.png` to `/brand/varenyam-logo-mark.png`.
- `lib/export/docx.ts` — the ImageRun that reads `path.join(process.cwd(), 'public', 'brand', 'varenyam-logo-full.png')` (around line 62) — change to `varenyam-logo-mark.png`.
- `lib/export/pdf.ts` — same path swap (around line 61).

Size constraints on the rendered logo:
- Cap rendered height at ~40-50px on the page (the mark is roughly square, so width ends up similar).
- In docx.ts ImageRun `transformation`, target ~50×46 px (preserves the 250:230 aspect).
- In PaperTemplate.tsx, the `logoImg` style needs `width: auto; height: 44px;` or similar.

### Fix 2 — Institute name centered as TEXT (already is — confirm + clean)

The current PaperTemplate / DOCX / PDF already place the institute name (`branding.inst_name`) as a centered text element in the header strip. **Confirm** this still works after the logo swap. The header should read:

```
[ icon ]                 Varenyam Coaching Institute                 [ blank/spacer ]
─────────────────────────── brand-red 1px rule ───────────────────────────
```

Drop the tagline if the template currently renders one — the user does not want "Leading the way" or any tagline on the paper. Only `inst_name`.

### Fix 3 — Shrink diagram caps to match reference paper

User says diagrams "are really big and do not match the size of the ones in original PDF." The reference DOCX renders inline figures around 150-180px wide (visually ~4cm on the printed page).

Current caps:
- `lib/export/docx.ts`: `DOC_IMAGE_MAX_W = 420`, `DOC_IMAGE_MAX_H = 150` — **width is way too big**.
- `lib/export/PaperTemplate.tsx`: `max-width: 280px; max-height: 180px` per the prior brief — also too big.

New caps:
- `lib/export/docx.ts`: `DOC_IMAGE_MAX_W = 200`, `DOC_IMAGE_MAX_H = 140`.
- `lib/export/PaperTemplate.tsx`: `max-width: 200px; max-height: 140px; object-fit: contain;` on every inline image and on the `[[IMG:url]]` placeholder render.
- `lib/export/pdf.ts`: inherits from PaperTemplate via Puppeteer; no separate cap needed.

Apply to both standalone images (the dedicated diagram paragraph under a question body) and inline placeholders inside the question body text.

### Fix 4 — Remove all handwriting / answer lines

The user explicitly does NOT want:
- "Student Name: ______________" line in the header meta block — **delete**.
- "Roll No.: ______________" line — **delete**.
- Per-question dotted answer lines (the lines that scale by marks, "cap 6 lines") that the current PaperTemplate / DOCX renders below each question for handwritten answers — **delete entirely** in both PaperTemplate.tsx and docx.ts.

The paper becomes a pure question-set output. Marks chip `[ N ]` stays. Options stay. Diagrams stay. Everything between questions that was for handwritten answers goes away. Adjust spacing so consecutive questions still have ~12pt breathing room.

### What stays (do not touch)

- Marking Scheme table on page 1 — keeps section / marks-per-Q / # of Q / total / Marks Obtained columns. The "Marks Obtained" column is for the GRADER, not the student, so it stays (it's a single empty grid cell, not a handwriting line).
- Section banners (teal-filled, white bold uppercase). Keep.
- General Instructions box. Keep.
- 2-column MCQ grid. Keep.
- Marks chip with brand-red pill border. Keep.
- Footer (teal top-rule + `<footer_text> · <inst_name> · Page X of Y`). Keep.

### Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-fe`.
- [ ] Generate a smoke test paper at `/api/tests/<id>/export/docx`, unzip and confirm:
  - `word/media/` contains the **mark** PNG (smaller, ~30KB file size), not the wordmark (~216KB)
  - No "Student Name" / "Roll No." / dotted-answer paragraphs in the document.xml
  - Width attribute on `<wp:extent>` for inline figures fits the 200×140 px cap (approximately `cx="1905000" cy="1333500"` in EMUs at 96 DPI)

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Work in `/mnt/d/varenyam-fe`. `git fetch origin && git checkout main && git pull && git checkout -b frontend/paper-polish-icon-and-cap-and-no-lines && npx prisma generate`.
3. Make the 4 fixes. Single commit OK, or split if you prefer. Use `[FE]` prefix; **no Claude attribution**.
4. Push. If credential-manager refuses from `/mnt/d/varenyam-fe`, commit locally and write a clear note in status — orchestrator will push from `/mnt/d/varenyam`.
5. Append a status entry to `.agents/status-frontend.md` listing the 4 fixes, commit SHA(s), push URL, and confirmation that the smoke checklist above passes.
6. **Stop.** Skip `~/report.sh`.

### Hard rules

- Single PR for the polish. Do not bundle unrelated cleanups.
- Do not touch `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**`.
- Do not touch the live-fetch picker or the Taxonomy Manager 4-tier UI. Those work; leave alone.
- The icon-only PNG at `public/brand/varenyam-logo-mark.png` is the right file (250×230 transparent RGBA). Use it as-is — do not regenerate or downscale at build time; resize via the template's render config.
