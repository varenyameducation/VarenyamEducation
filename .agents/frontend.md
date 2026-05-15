# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Two UI fixes: hide "(A) CORRECT" badge for unverified imports + add Vision opt-in checkbox

User feedback after testing bulk DOCX/PDF imports:

> "Why does (A) show as CORRECT? How does it know the answer? Are you using Gemini for that?"

No — the BE was defaulting `correct_option: ['A']` for every MCQ, and FE was rendering that as a green CORRECT badge. BE is fixing the default (now `[]`); your job is to **stop rendering the CORRECT badge unless the question is actually verified**. Also: BE is adding an opt-in Vision flag for PDF imports — you add the checkbox + wire it.

**Branch:** `frontend/no-correct-badge-and-vision-opt-in`

**Base off:** `backend/parser-fix-no-answer-default-opt-in-vision` (so route changes typecheck). Rebase to `main` if BE merges first.

---

## Fix 1 — Suppress "(A) CORRECT" badge for unverified imports

### Where the badge renders

Search `components/questions/`, `components/tests/`, `app/(dashboard)/questions/` for the "CORRECT" text. Likely candidates:
- `components/questions/question-card.tsx` — chunky question card on the bank list
- `app/(dashboard)/questions/[id]/page.tsx` — detail view
- The "focus view" page if it exists
- `components/questions/question-form.tsx` — option highlights inside the form

### Fix rule

Render the green CORRECT badge / highlight ONLY when:
```ts
question.is_verified === true AND question.correct_option.length > 0
```

In all other cases (unverified question, or unverified MCQ with no correct option, or empty correct_option array), render the option label plain — no green color, no badge, no "CORRECT" word. Just `(A)` `(B)` `(C)` `(D)` as neutral chips.

Add a small "needs review" pill near the question header for any `is_verified: false` question (the system already has logic for this somewhere — look at the existing `Needs review` label in `app/(dashboard)/questions/[id]/page.tsx`). If it doesn't exist yet, add it: orange-ish chip with text "Needs review · set correct answer".

### Don't touch

- Verified questions (`is_verified: true` with a real `correct_option`) — those keep the green CORRECT badge. Same UX as before.
- Single-question form at `/questions/new` — when the user is creating from scratch they pick the correct option themselves; that flow stays.

## Fix 2 — Opt-in "Use AI Vision for math accuracy" checkbox on /questions/import

File: `app/(dashboard)/questions/import/page.tsx`

### UI element

Add a checkbox row directly under the file input, BEFORE the taxonomy/defaults section:

```
☐ Use AI Vision for math accuracy (PDF only)
   Renders each page through Gemini Vision so 2D math notation (fractions,
   integrals, exponents) comes through as proper LaTeX. ~5 seconds per page;
   uses Gemini free-tier quota. Recommended for math-heavy PDFs only.
```

- Checkbox state lives in React component state: `const [useVision, setUseVision] = React.useState(false)`.
- Disabled when the selected file is NOT a PDF (DOCX/XLSX don't benefit; images already always use Vision). Show grayed-out text "PDF only — current file is .docx" or similar contextual hint.
- When checked AND the user clicks Start Import, POST includes `vision: 'true'` in the FormData.

### Submit wiring

In the upload handler, when building the FormData:
```ts
const fd = new FormData()
fd.append('file', file)
fd.append('course_id', courseId)
// ... existing fields ...
if (useVision && fileKind === 'pdf') {
  fd.append('vision', 'true')
}
```

### Result panel (Vision-mode-specific copy)

After a Vision import completes, BE response includes `pages_processed`, `total_pages_in_doc`, `total_tokens`. Show these in the success panel as an extra line:

```
✓ 12 questions imported · 3 MCQ · 9 subjective
   8 pages processed (of 23 total — re-upload pages 9-23 to continue)
   ~14,800 Gemini tokens used
```

For non-Vision imports, hide this extra line — current behavior is fine.

### Loading state

When `useVision === true` + PDF file, the import takes seconds-per-page. Update the spinner copy contextually:

```ts
const importingCopy = useVision && fileKind === 'pdf'
  ? `Importing via Gemini Vision (about ${estimatedSeconds}s for ${pageCount}-page PDF)…`
  : 'Parsing your document…'
```

You don't have to estimate page count precisely — show a single message like "Importing via Gemini Vision (this may take 1–5 minutes for multi-page PDFs)…" if implementing page-count detection is complex.

### What you do NOT do

- No per-page progress UI / SSE / Cancel button / AbortController. BE ships a single sync response after all pages finish. The user accepts the wait.
- No retry logic on rate-limit errors. BE returns the error envelope; FE just displays it.

---

## What you do NOT touch

- `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**` — BE / INT scope.
- The 4-tier taxonomy cascade already in the import page — works fine, don't refactor.
- The image-upload accept already in the file input — works fine, don't touch.

## Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Manual test (after BE branch is checked out):
  1. Import the old Class-8 Algebra Play DOCX → option chips render WITHOUT "CORRECT" badges (none of those questions are verified yet). Question detail page shows "Needs review · set correct answer."
  2. Manually edit a question, mark Option B as correct, save with `is_verified: true` → the (B) chip now shows as CORRECT.
  3. On `/questions/import`, upload a PDF — checkbox is enabled. Toggle on. Upload — should take longer (Gemini Vision path), result panel shows token usage.
  4. On `/questions/import`, select a DOCX — checkbox grays out / shows "PDF only" message.
- [ ] Existing Q1/Q2 the user already imported (the ones with the bleeding Option D content) — verify the CORRECT badge is gone from them automatically (no DB change needed; they're `is_verified: false`).

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Wait for BE: `git fetch origin && git ls-remote origin backend/parser-fix-no-answer-default-opt-in-vision | grep refs/heads || echo "BE not pushed — wait"`.
3. `git checkout origin/backend/parser-fix-no-answer-default-opt-in-vision -b frontend/no-correct-badge-and-vision-opt-in`. Run `npx prisma generate`.
4. Implement. One or two commits.
5. Commit with `[FE]` prefix. **No Claude attribution.**
6. **Backdate per pacing rule.** Pick a light day like 2026-05-15 (1 commit currently) or 2026-05-16 (3 currently).
7. Push (or commit locally for orchestrator push).
8. Append to `.agents/status-frontend.md`.
9. **Stop.** Skip `~/report.sh`.

## Hard rules

- Single PR.
- Don't touch `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**`.
- The "CORRECT" badge change must be uniform — every place that renders option highlights honors `is_verified && correct_option.length > 0`. Don't leave one rogue location showing the false badge.
- The Vision checkbox defaults UNCHECKED. Heuristic stays the default UX.
