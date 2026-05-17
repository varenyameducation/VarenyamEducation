# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — HOTFIX #2: MCQ Zod schema rejects `correct_option: []`

**Severity: P1.** Bulk import via the Gemini Vision path (image OR `vision='true'` PDF) imports ZERO MCQ questions even when Gemini successfully extracts them. Live test against the user's calculus image:

```json
{
  "success": true,
  "data": {
    "imported": 0,
    "total_tokens": 1521,
    "errors": [{ "row": 1, "reason": "Question 1: correct_option — Invalid input" }]
  }
}
```

### Root cause

`lib/validation/question.ts:60` MCQ schema requires `correct_option: z.array(optionLetterSchema).length(1)` — **exactly 1 element**. The previous BE hotfix #3 (drop `correct_option: ['A']` default) made the image / Vision paths produce `correct_option: []`, which fails this schema. The DOCX text path at `app/api/questions/import/route.ts:448` was MISSED and still defaults to `['A' as const]`, which is why DOCX MCQs pass — but this is an inconsistency, not a feature.

### Fix (two tiny edits)

**Branch:** `backend/hotfix-mcq-empty-correct-option`

**Base off:** `backend/hotfix-lazy-pdf-import` (the in-flight lazy-import hotfix) so both fixes layer cleanly. If that's already merged, base off `main`.

1. **`lib/validation/question.ts`** line 60 (and line 110 if the `questionUpdateSchema` has the same constraint):
   ```ts
   // BEFORE:
   correct_option: z.array(optionLetterSchema).length(1),
   // AFTER:
   correct_option: z.array(optionLetterSchema).max(1).default([]),
   ```
   Allows `[]` (unverified imports) AND `['A']` / `['B']` etc. (user-set correct answer after review). The `multiSelectSchema` at line 70 must keep `.min(2)` — that's a different semantics.

   Comment to add above the line:
   ```ts
   // Allow [] for bulk-imported MCQs that ship unverified — user marks the
   // correct answer in the question bank after review. `.length(1)` would
   // reject those rows wholesale.
   ```

2. **`app/api/questions/import/route.ts`** line 448 — clean up the inconsistency from the previous hotfix:
   ```ts
   // BEFORE:
   correct_option: ['A' as const],
   // AFTER:
   correct_option: [] as const,
   ```
   Now every path uniformly produces `correct_option: []` for bulk MCQ imports.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Restart dev. Smoke-test bulk image upload at `/api/questions/import` with `/mnt/c/Users/HP/OneDrive/图片/Screenshots/Screenshot 2026-05-26 235616.png` — expect `imported: 1`, `mcq_count: 1` (previously 0). The single-question form at `/questions/new` should also still work — same schema covers it.
- [ ] DOCX path regression: re-import the Class-8 Algebra Play DOCX — same 14-question baseline (now all MCQs with `correct_option: []` instead of `['A']`).
- [ ] Run `scripts/test-parser-bleed-regression.mjs` if it covers MCQ validation — should still pass.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Check the lazy-import hotfix branch:
   ```
   git fetch origin
   git log origin/main --oneline -3 | grep -i "lazy-pdf-import\|hotfix" || echo "not merged yet"
   ```
   - If merged: `git checkout main && git pull && git checkout -b backend/hotfix-mcq-empty-correct-option`
   - Else: `git checkout origin/backend/hotfix-lazy-pdf-import -b backend/hotfix-mcq-empty-correct-option`
3. Two small edits. Single commit.
4. Commit with `[BE]` prefix. **No Claude attribution.** Message: `[BE] Hotfix: allow correct_option: [] on MCQ imports`.
5. **Backdate per pacing.** 2026-05-27 is busy; pick `2026-05-17T23:30:00+05:30` (one more on the 17th — should be at 6, still under cap).
6. Push.
7. Append a 3-line entry to `.agents/status-backend.md` — branch, commit, push URL, live smoke result.
8. **Stop.**

### Hard rules

- Two small surgical edits. Do NOT refactor anything else.
- The `multiSelectSchema` at line 70 keeps `.min(2)` — that's correct for multi-select questions.
- Schema change is additive: `.max(1).default([])` accepts everything the prior `.length(1)` accepted plus `[]`. No existing data breaks.
- The user's production is partially broken right now — speed matters but correctness more.
