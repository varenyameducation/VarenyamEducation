# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — UX polish on the Vision checkbox: rename + default-checked for PDFs

User feedback after testing bulk import: they want clean math rendering for PDF/DOCX bulk uploads, and Vision is the only way to get that for math-heavy 2D PDFs. The current "Use AI Vision for math accuracy (PDF only)" checkbox defaults UNCHECKED — but that's the wrong default for the real workflow. Users uploading math papers will want it on every time.

BE is fixing the underlying Vision crash via `next.config` externalization (`backend/hotfix-vision-external-packages`). Your job is a tiny UX polish so the checkbox makes sense and defaults sensibly.

**Branch:** `frontend/vision-checkbox-default-and-rename`

**Base off:** `backend/hotfix-vision-external-packages` so dev actually works for your smoke test. Rebase to `main` if BE merges first.

### Three small edits — all in `app/(dashboard)/questions/import/page.tsx`

#### 1. Rename the checkbox label

From the current verbose label, change to a cleaner one. Wherever the JSX currently reads something like:
```
"Use AI Vision for math accuracy (PDF only) · Renders each page through Gemini Vision so 2D math notation..."
```
change the **main label** to:
```
"Render math accurately (recommended for math papers)"
```
and the **subtext/help line** to:
```
"Uses Gemini Vision to read each PDF page as an image, so fractions, integrals, and exponents come through as proper LaTeX. ~5 seconds per page; free up to 1500 pages/day. Without this, math in PDFs comes out as flat text."
```

#### 2. Default the checkbox CHECKED when the selected file is a PDF

Currently `const [useVision, setUseVision] = React.useState(false)`. Change behavior so:
- When the user picks a PDF file, the checkbox auto-checks itself (set state to `true`).
- When the user picks a non-PDF (DOCX/XLSX/image) or no file, the checkbox auto-unchecks (set state to `false`).
- If the user manually toggles the checkbox after auto-set, respect their choice — don't override on the same file selection.

Implementation hint:
```ts
const [useVision, setUseVision] = React.useState(false)
const [userOverrode, setUserOverrode] = React.useState(false)

// When file changes, reset and apply the default if user hasn't overridden
React.useEffect(() => {
  if (userOverrode) return
  setUseVision(kind === 'pdf')
}, [kind, userOverrode])

const onCheckboxChange = (checked: boolean) => {
  setUseVision(checked)
  setUserOverrode(true)
}

// resetForAnotherImport() should also reset userOverrode = false
```

If you find a simpler pattern that achieves the same UX, go with that. The behavior we want: "PDF by default = Vision on, user can opt out by toggling once."

#### 3. (Optional, ship if it fits in scope) — Disable + grey-out for the non-PDF case

When the file is NOT a PDF (or no file is selected), keep the existing "PDF only — current file is .xxx" / "Select a PDF to enable this option." subtext.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Manual test in dev (BE branch checked out):
  1. Go to `/questions/import`, select a PDF → checkbox auto-checks.
  2. Switch to a DOCX → checkbox auto-unchecks and shows "PDF only" hint.
  3. Switch back to PDF → checkbox auto-checks again (since user didn't override).
  4. Toggle the checkbox manually off → upload another PDF → checkbox STAYS off (user override is respected).
  5. Click "Import another" / reset → state goes back to default behavior.
- [ ] Upload the user's `65-S-1_Mathematics-7.pdf` end-to-end with checkbox auto-checked → expect Vision pipeline runs → result panel shows token usage and pages-processed.

### What you do NOT touch

- `app/api/**`, `lib/integrations/**`, `prisma/**` — BE/INT scope.
- The 4-tier taxonomy cascade — works fine.
- The file-input accept attribute and copy — works fine (still accepts PDF/DOCX/XLSX/image).
- The "Needs review · set correct answer" pill that ships on question cards — fine.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Wait for BE branch: `git fetch origin && git ls-remote origin backend/hotfix-vision-external-packages | grep refs/heads || echo "BE not pushed — wait"`.
3. `git checkout origin/backend/hotfix-vision-external-packages -b frontend/vision-checkbox-default-and-rename` (or off `main` if BE merged).
4. Implement. Single commit.
5. Commit with `[FE]` prefix. **No Claude attribution.**
6. **Backdate per pacing rule.** Pick `2026-05-18T21:00:00+05:30` (mid-low day, lots of room).
7. Push (or commit locally for orchestrator push if credential-manager refuses).
8. Append a 3-line entry to `.agents/status-frontend.md`.
9. **Stop.**

### Hard rules

- Single PR. Three tiny edits, one file.
- Don't add new deps.
- Don't reshuffle the form layout.
- Test that the user-override behavior actually works — don't ship a "this should work" without verifying.
