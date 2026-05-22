# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Fix KaTeX-with-delimiters rendering bug

User uploaded a math image to the new parse-image feature. Gemini returned correct LaTeX with `\( ... \)` inline-math delimiters. But the **live preview pane** in the question form throws:

> KaTeX parse error: Can't use function '\(' in math mode at position 4: 6. \\(...

**Root cause:** Both `components/ui/latex-editor.tsx` and `lib/ui/render-body.tsx` pass the *entire* input string (prose + `\(...\)` math + more prose) directly to `katex.renderToString`. KaTeX treats the whole thing as one math expression, then chokes on the literal `\(` delimiter inside that implicit math mode.

**Fix scope:** TWO files. Same bug, same fix. **Build a shared splitter** that segments the input into prose / inline-math / display-math, then renders each math segment with KaTeX at the right `displayMode` and leaves prose as escaped text.

**Branch:** `frontend/fix-latex-delimiter-split`

**Base off:** `main`.

### Fix 1 — Shared splitter in `lib/ui/render-body.tsx`

The file already has `splitBody()` for splitting on `[[IMG:url]]`. Extend the segment model to ALSO recognize math delimiters:

```ts
type Segment =
  | { kind: 'text';         text: string }
  | { kind: 'img';          url: string }
  | { kind: 'inline-math';  latex: string }
  | { kind: 'display-math'; latex: string }
```

Splitting rules (recognize ALL FOUR delimiter pairs; first match wins per position):
- `\( ... \)` → `inline-math` (Gemini's primary output format)
- `\[ ... \]` → `display-math` (Gemini's display math)
- `$$ ... $$` → `display-math` (legacy / common Markdown style)
- `$ ... $`  → `inline-math` (legacy / common Markdown style; tricky because `$` is also currency — accept it only when followed by a non-digit/non-space, OR just leave it out if it's ambiguous; consult: keep `$$ $$` block style, optionally support single-`$` if straightforward)
- `[[IMG:url]]` → `img` (existing)

Implementation hint — one combined regex run-through, alternation matches whichever delimiter shows up next:
```ts
const SEGMENT_RE = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\[\[IMG:([^\]]+)\]\]/g
```
Then for each match, branch on which capture group fired. Push text between matches as `{ kind: 'text' }` segments.

The exported `RenderedBody` component already maps segments to JSX; extend its `.map()` to handle `inline-math` (render via `katex.renderToString(latex, { displayMode: false, throwOnError: false, output: 'html', strict: 'ignore' })` and `dangerouslySetInnerHTML`) and `display-math` (same but `displayMode: true`, wrapped in a centered `<div>`).

Drop the old `LATEX_TOKEN` heuristic + `renderInlineHtml()` function — they were always a hack ("if the whole text looks like LaTeX, try KaTeX") and they're the root cause of the silent fallback. Pure-prose text segments now go through `escapeHtml()` only.

### Fix 2 — `components/ui/latex-editor.tsx`

The live preview pane has the same flawed pattern at lines 53-59 — calls `katex.renderToString(src, { displayMode: true, ... })` on the entire textarea content. Replace with:

```ts
import { RenderedBody } from '@/lib/ui/render-body'   // or whatever the new splitter exports
```

and render the preview as `<RenderedBody body={deferredValue} />` inside the right column. Drop the local `rendered = useMemo(...)` block that builds an HTML string + error state; the segment renderer handles bad math gracefully via `throwOnError: false` (returns escaped text rather than throwing).

**Error display:** the user no longer sees "KaTeX parse error" — instead, malformed math just renders as the literal source text. This is **the correct UX** for a live preview: typos shouldn't blow up the panel. If you want to keep an error indicator, surface it only when EVERY math segment fails to parse (rare). Otherwise just remove the error styling.

### Fix 3 — Check the other consumers of `lib/ui/render-body.tsx`

These already use `RenderedBody`:
- `components/questions/question-card.tsx`
- `components/tests/selected-questions-sorter.tsx`
- `components/tests/question-results-list.tsx`
- `components/tests/test-preview-modal.tsx`

After Fix 1, all of them inherit the correct rendering automatically. **Don't change them.** Just verify with a quick read-through that they import `RenderedBody` (not the private `renderInlineHtml`).

If any of them use `katex.renderToString` directly instead of going through `RenderedBody`, switch them to use the shared component.

### Fix 4 — Paper export consumers (skim only)

`lib/export/PaperTemplate.tsx`, `lib/export/docx.ts`, `lib/export/pdf.ts` have their own KaTeX rendering for the printed paper. **Audit them briefly:**
- If they pass raw `\(...\)` text to KaTeX, fix them with the same splitter approach (rendering math segments via `katex.renderToString` + image / DOCX runs appropriately).
- If they already split correctly (some already handle `[[IMG:url]]` via `IMG_PLACEHOLDER_RE`), good — just confirm.
- The DOCX export converts inline LaTeX to PNG via `inlineRuns(source)` in `docx.ts`; if that function checks `LATEX_HINT.test(source)` and renders the whole thing, it has the same bug. Fix it the same way (split, render each math segment to its own PNG, intersperse with TextRun for prose).

If the paper export needs more than a 10-line change, **note it in your status entry** and let orchestrator decide whether to bundle it into this PR or spin off a follow-up. Don't blow up the scope unilaterally.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Smoke test in dev:
  1. Start dev, log in, go to `/questions/new`
  2. Upload the user's calculus image (or paste `If \( \int_0^{\pi/2} \frac{\sin x}{1 + \cos x} dx \) is equal:` into the body textarea)
  3. Preview pane should show the math rendered as a fraction inside an integral — **no "KaTeX parse error"**
  4. Save the question
  5. Go to the question bank, find the question card — body should render with pretty math
  6. (Optional) Generate a paper that includes the question, export DOCX, open — math should be inline images in the paragraph

### Push

Standard. If credential-manager refuses from `/mnt/d/varenyam-fe`, commit locally and orchestrator pushes from `/mnt/d/varenyam`.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Work in `/mnt/d/varenyam-fe`. `git fetch origin && git checkout main && git pull && git checkout -b frontend/fix-latex-delimiter-split && npx prisma generate`.
3. Implement. Single commit OK.
4. Commit with `[FE]` prefix. **No Claude attribution.**
5. **Backdate per pacing rule:** today (2026-05-27) is at 1 commit (free). 2026-05-26 = 29 (over). 2026-05-25 = 19 (over). Recent light days: 2026-05-13 to 2026-05-18 (1-2 each), 2026-05-22 = 5, 2026-05-23 = 6, 2026-05-24 = 6. Pick **2026-05-22 evening IST** (had 5, so adding 1-2 keeps it at 6-7, still within cap).
6. Push (or hand off to orchestrator).
7. Append to `.agents/status-frontend.md`: branch, commit, push URL, files-changed list, before/after smoke result.
8. **Stop.**

### Hard rules

- Single PR.
- Do not touch `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**`.
- Don't add new npm deps — `katex` is already in the project.
- The shared splitter must be **exported** from `lib/ui/render-body.tsx` (or a sibling file) so other components can reuse it. No duplicate splitter logic.
- `throwOnError: false` in the KaTeX call for the user-facing renderer. We want graceful degradation, not red boxes.
