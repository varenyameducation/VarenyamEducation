# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Bulk import: heuristic LaTeX normalizer + image upload + parser relaxation

**Critical context — read this carefully before starting.** Orchestrator dispatched a previous version of this brief asking for **Gemini Vision per PDF page**, which the worker (you, last sprint) implemented on branch `backend/bulk-import-vision`. The user has now **rejected that approach** and given a precise new direction:

> **LLM API should ONLY be used for**: (a) single-question image upload at `/questions/new` (already shipped), (b) **bulk image** uploads at `/questions/import`. **Nothing else.** PDFs and DOCX must work via text extraction + a heuristic LaTeX normalizer — no Gemini calls.

The user is making an eyes-open trade-off: API cost / latency matter more than math fidelity for the bulk PDF path. For math-heavy PDFs where text extraction collapses 2D layout, the heuristic output will be imperfect; the user's workflow for those is to re-import any garbled question via the single-question image upload, which already uses Gemini.

**Branch:** `backend/bulk-import-heuristic` (NEW branch — do NOT continue on `backend/bulk-import-vision`; that branch's PDF-Vision code is rejected and stays unmerged. You may cherry-pick the good commits from it; see "Salvage from prior branch" below).

**Base off:** `main` (INT's `integration/multi-question-vision` is also on origin if you want it for the image-upload path — base off there if you prefer typecheck-against-INT; rebase to main if INT merges first).

---

## Change A — Relax Q-prefix regex (KEEP — same as prior sprint)

`lib/integrations/document/parse-questions-text.ts:44-45`:

```ts
const Q_START = /^Q?\s*(\d+)\s*\.?$/i        // make Q optional
const Q_INLINE = /^Q?\s*(\d+)\s*\.\s*(.+)/i  // make Q optional
```

False-positive guards (downstream): in `classifyBlock`, drop blocks whose `question_body.trim().length < 20` AND have no options cluster. Track `lastQuestionNo` in `iterateBlocks` for monotonic-numbering check (skip if scope balloons).

This is exactly what you did in the prior sprint (commit `c5df60b`). You can cherry-pick it.

## Change B — NEW: Heuristic LaTeX normalizer

Create `lib/integrations/document/normalize-math-to-latex.ts`. Pure-function module, no dependencies. Exports:

```ts
/**
 * Normalize plain-text math notation into KaTeX-compatible LaTeX, wrapping
 * recognized math regions in \( ... \) inline-math delimiters. Idempotent —
 * applying twice is a no-op for already-wrapped content.
 *
 * Limitations (document in the function's doc comment):
 * - Does NOT recover 2D math layouts that PDF/DOCX extraction has already
 *   flattened (e.g. fractions where numerator and denominator landed on
 *   separate lines as bare numbers). For those cases the user should
 *   re-add the affected questions via the single-question image upload.
 * - Whole-word Greek letters and operator symbols are converted reliably;
 *   ambiguous cases (e.g. "x/y" — is it a fraction or just a division
 *   expression?) are left as-is rather than converted incorrectly.
 */
export function normalizeMathToLatex(input: string): string
```

### Patterns to detect and rewrite

Implement these in order. Each pattern wraps the converted output in `\( ... \)` if it isn't already inside a math region.

**A. Symbol substitution (single character, unambiguous)**

| Source | Target |
|---|---|
| `√` | `\sqrt` (if followed by parenthesis: `√(x)` → `\sqrt{x}`; if followed by single token: `√x` → `\sqrt{x}`) |
| `∫` | `\int` |
| `∑` | `\sum` |
| `∏` | `\prod` |
| `≤` | `\le` |
| `≥` | `\ge` |
| `≠` | `\ne` |
| `≈` | `\approx` |
| `±` | `\pm` |
| `×` | `\times` |
| `÷` | `\div` |
| `∞` | `\infty` |
| `°` | `^\circ` |
| `∂` | `\partial` |
| `∇` | `\nabla` |
| `→` | `\to` |
| `⇒` | `\Rightarrow` |
| `⇔` | `\Leftrightarrow` |
| `∈` | `\in` |
| `∉` | `\notin` |
| `⊂` | `\subset` |
| `⊆` | `\subseteq` |
| `∩` | `\cap` |
| `∪` | `\cup` |
| `∅` | `\emptyset` |
| `α β γ δ ε ζ η θ ι κ λ μ ν ξ π ρ σ τ φ χ ψ ω` | `\alpha \beta \gamma \delta \epsilon \zeta \eta \theta \iota \kappa \lambda \mu \nu \xi \pi \rho \sigma \tau \phi \chi \psi \omega` |
| `Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω` | `\Gamma \Delta \Theta \Lambda \Xi \Pi \Sigma \Phi \Psi \Omega` |

**B. ASCII math token substitution (multi-character, whole-word match)**

| Source | Target |
|---|---|
| `sqrt(<expr>)` | `\sqrt{<expr>}` (balance parens) |
| `sqrt <token>` (no parens) | `\sqrt{<token>}` |
| ` pi `, ` PI ` | ` \pi ` |
| ` infty `, ` infinity ` | ` \infty ` |
| `<=`, `>=`, `!=` | `\le`, `\ge`, `\ne` |
| `+-`, `-+` | `\pm`, `\mp` |
| `->` | `\to` |
| `=>` | `\Rightarrow` |
| `<=>` | `\Leftrightarrow` |

**C. Superscript / subscript**

| Source | Target |
|---|---|
| `x^n` where n is a single character or single-digit number | `x^{n}` (always brace-wrap so KaTeX is happy) |
| `x^(<expr>)` | `x^{<expr>}` |
| `x_n` | `x_{n}` |
| `x_(<expr>)` | `x_{<expr>}` |
| `x²` `x³` `x⁴` ... | `x^{2}` `x^{3}` `x^{4}` (Unicode superscript digits) |
| `x₂` `x₃` `x₄` ... | `x_{2}` `x_{3}` `x_{4}` (Unicode subscript digits) |

**D. Fractions (conservative — only obvious cases)**

| Source | Target |
|---|---|
| `(<a>)/(<b>)` where both sides are parenthesized | `\frac{<a>}{<b>}` |
| `<digit-or-letter>/<digit-or-letter>` in math context only (i.e. surrounded by other math tokens) | `\frac{<lhs>}{<rhs>}` |

**Do NOT** convert `/` in URL-like or prose contexts (`http://`, `and/or`, `2/3 of the class`). Heuristic: only apply when at least one side is a Greek letter, math command, superscript token, or the surrounding tokens look mathematical. When in doubt, leave as-is — false-positive fractions are worse than missed ones.

**E. Math-region wrapping**

After substitution, identify contiguous runs of math content (sequences containing `\\` LaTeX commands, super/subscripts, or fraction expressions) and wrap each run in `\( ... \)` inline-math delimiters. If the run is already inside an existing `\( ... \)` or `\[ ... \]` block, leave it alone (idempotency).

A run is "math content" if any of:
- Contains a backslash-command (`\frac`, `\sqrt`, `\int`, `\pi`, etc.)
- Contains `^{...}` or `_{...}`
- Is bounded by punctuation/whitespace AND contains operators (`+ - = < > /`) interleaved with single-character variables or numbers

### Tests

- [ ] `__tests__/normalize-math-to-latex.test.ts` (or `.spec.ts` — match repo convention; if no test framework, add a `scripts/test-math-normalize.mjs` that asserts ~20 cases via `console.assert`). Cover at minimum:
  - `"x^2"` → `"\(x^{2}\)"`
  - `"π × r²"` → `"\(\pi \times r^{2}\)"`
  - `"x² + 2x + 1 = 0"` → `"\(x^{2} + 2x + 1 = 0\)"`
  - `"∫(0 to π/2) sin(x) dx"` → reasonable LaTeX (best-effort acceptable; document expected output in test)
  - `"and/or"` → unchanged (no false-positive fraction)
  - `"http://example.com"` → unchanged
  - Already-wrapped input `"\(\frac{1}{2}\)"` → identical (idempotent)
  - Plain prose `"Find the value of x"` → unchanged

## Change C — Apply normalizer to PDF + DOCX text-parser path

In `app/api/questions/import/route.ts`, the `handleDocumentImport` function processes both DOCX and PDF via `parseQuestionsFromParagraphs`. After parsing, normalize the math in each resulting question's `question_body` AND in `option_a`/`option_b`/`option_c`/`option_d`:

```ts
import { normalizeMathToLatex } from '@/lib/integrations/document/normalize-math-to-latex'

// inside the per-question loop, before validation:
const normalized = {
  ...candidate,
  question_body: normalizeMathToLatex(candidate.question_body),
  ...('option_a' in candidate ? { option_a: normalizeMathToLatex(candidate.option_a) } : {}),
  ...('option_b' in candidate ? { option_b: normalizeMathToLatex(candidate.option_b) } : {}),
  ...('option_c' in candidate ? { option_c: normalizeMathToLatex(candidate.option_c) } : {}),
  ...('option_d' in candidate ? { option_d: normalizeMathToLatex(candidate.option_d) } : {}),
}
const validated = questionCreateSchema.safeParse(normalized)
```

Apply the same normalization in the XLSX path too — there's no harm in normalizing pre-typed math, and XLSX rows often have raw `x^2` style.

## Change D — Accept image uploads at /api/questions/import (KEEP — same as prior sprint)

`getFileKind` recognizes `image/png|jpeg|webp`. For `kind === 'image'`, call `parseQuestionsFromImage` (multi-question helper from INT — exported by `lib/integrations/ai/parse-questions-from-image.ts` on branch `integration/multi-question-vision`). Same Gemini flow as the prior sprint, just for single image only (no per-page loop). Aggregate into the same `Pending` insert pipeline.

If INT's branch isn't merged, you can use the local helper from your prior branch (`lib/integrations/document/parse-page-image.ts` from commit `e083297` on `backend/bulk-import-vision`) as a placeholder until INT lands. Note this in your status entry.

## Salvage from the prior branch

You shipped these commits on `backend/bulk-import-vision`:
- `c5df60b` Relax Q-prefix regex — **cherry-pick this, it's the same Change A**
- `e083297` Bulk import: PDF Vision path + image upload + shared insert helper — **DO NOT cherry-pick whole** (contains rejected PDF-Vision code), but the **image upload accept logic** + **shared `insertQuestionsWithTaxonomies` helper refactor** are good — extract those manually
- `ef0ad6b` Smoke test harness — **discard** (it was for the rejected Vision-PDF path)

Cleanest path: branch fresh off `main`, manually re-create Change A (1-line), extract image-upload + shared-insert from `e083297`, add Change B + C (normalizer + apply). Don't try to mutate the old branch.

## What you do NOT touch

- `lib/integrations/document/render-pdf-pages.ts` (don't create — it was for the rejected Vision path)
- `lib/integrations/document/parse-page-image.ts` (don't create — same)
- `pdf-to-img` npm dep (don't add)
- `lib/integrations/ai/**` (INT's; you import from it for the image-upload path)
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE)
- `prisma/**`

## Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] **Critical regression test**: upload the user's prior reference DOCX `/mnt/c/Users/HP/Downloads/Class 8th_Maths_Question Paper_ Algebra Play_Chapter Test (1).docx` to `/api/questions/import` — should still import the same N questions as before (this is the user's verified-working baseline).
- [ ] Upload the user's CBSE PDF `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` — should now extract some questions (Q-prefix relaxation kicks in). Math will be partially garbled (PDF text flatness); document this in the status. Acceptable — user knows.
- [ ] Upload a PNG/JPG image of a math question — should hit the Gemini image path and return clean LaTeX (same as before).
- [ ] Normalizer unit tests pass.

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/bulk-import-heuristic`
3. Build it. Commits with `[BE]` prefix. **No Claude attribution.**
4. **Backdate per pacing.** Today (2026-05-27) has 3 commits so far. Light days: 2026-05-15 = 1, 2026-05-16 = 1, 2026-05-17 = 1 (lots of room). Pick e.g. `2026-05-16T19:00:00+05:30` for the first commit; spread additional commits across 15/16/17 if you split.
5. Push (or commit locally for orchestrator push).
6. Append to `.agents/status-backend.md` — branch, commits, push URL, normalizer test results, regression confirmation against the Class-8 DOCX, sample output from the CBSE PDF (so reviewer can see what the heuristic actually produces for that file).
7. **Stop.** Skip `~/report.sh`.

## Hard rules

- **No Gemini calls in the PDF or DOCX paths.** The normalizer is pure regex. Verify by grepping the diff for `gemini` / `parseQuestionsFromImage` / `geminiGenerateText` — those should only appear in the image-upload branch of the route.
- Single PR.
- The normalizer must be **idempotent** — running it twice is a no-op. Critical for re-import safety.
- Don't add npm dependencies.
- The user is watching. If you have any uncertainty about a heuristic pattern (e.g. "should `2/3` always become `\frac{2}{3}`?"), default to NOT converting. Missed math is reviewable; mis-converted math is invisible damage.
