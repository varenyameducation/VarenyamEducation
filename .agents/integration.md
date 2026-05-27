# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Make Gemini-Vision JSON parser tolerant to unescaped LaTeX backslashes

**Critical bug** caught by BE during smoke-testing the new Vision-PDF path: Gemini's `responseMimeType: 'application/json'` mode emits JSON with **unescaped backslashes inside string values**. For LaTeX content like `\frac` or `\(`, Gemini writes the string as `"\frac"` and `"\("` — which is **invalid JSON** because `\f` (form-feed) is consumed as a control-character escape and `\(` is not a recognized JSON escape at all → strict `JSON.parse()` throws.

BE verified the Gemini response BODY is correct (right LaTeX content, correct shape, options array, `correct_option: []`). Only the JSON parsing step on our side is brittle. BE flagged it as cross-scope: they can't patch `lib/integrations/ai/**`. That's you.

**This fixes the live `502 GEMINI_FAILED` you get when toggling the Vision opt-in on `/questions/import` with `65-S-1_Mathematics-7.pdf`.**

**Branch:** `integration/lenient-gemini-json-parse`

**Base off:** `main` (the prior INT branch `integration/drop-answer-detection` is on origin and will land via the parallel sprint PRs — your fix is a follow-up that can layer on top).

### What to change

Two files, both contain `JSON.parse(result.text)` calls that throw on the broken LaTeX strings:

1. `lib/integrations/ai/parse-question-image.ts`
2. `lib/integrations/ai/parse-questions-from-image.ts`

In each, replace the direct `JSON.parse(result.text)` with a call to a new shared helper.

### The shared helper

Add a tiny utility to `lib/integrations/ai/json-utils.ts` (new file):

```ts
/**
 * Lenient JSON parse for Gemini Vision responses. Gemini's
 * responseMimeType:'application/json' mode sometimes emits LaTeX strings
 * with unescaped backslashes (e.g. "\(x = t^3\)" instead of "\\(x = t^3\\)"),
 * which breaks strict JSON.parse — `\(` is not a valid JSON escape, and
 * `\frac` would otherwise decode `\f` as form-feed.
 *
 * Strategy:
 *   1. Try strict JSON.parse first. If Gemini happened to escape correctly,
 *      this succeeds with zero overhead.
 *   2. On failure, double any backslash that isn't already followed by a
 *      backslash or a `u` (the only escape we're sure Gemini wants to
 *      preserve verbatim — unicode escapes \uXXXX). This intentionally
 *      double-escapes `\n` / `\t` / `\f` / etc. as well, because in math
 *      output Gemini never intends those control chars — those bytes are
 *      always LaTeX command starts.
 *   3. Re-parse; if still failing, throw the original error (the second
 *      error message would be confusing).
 *
 * Tested against the actual JSON Gemini emitted for the CBSE PDF page that
 * BE captured — `\(\frac{d^2y}{dx^2}\)` style content round-trips correctly
 * after the repair.
 */
export function lenientJsonParse<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (originalErr) {
    const repaired = raw.replace(/\\(?![\\u])/g, '\\\\')
    try {
      return JSON.parse(repaired) as T
    } catch {
      throw originalErr
    }
  }
}
```

The regex `/\\(?![\\u])/g`:
- `\\` matches a single backslash character.
- `(?![\\u])` negative-lookahead — the backslash is NOT followed by another backslash or by `u`.
- So `\frac`, `\(`, `\[`, `\sqrt` etc. all match (the next char is a letter/paren/bracket) and get doubled.
- `\\` (already-escaped) → first `\` is followed by `\` → no match → preserved.
- `°` (unicode) → first `\` is followed by `u` → no match → preserved.

### Both call sites

In `lib/integrations/ai/parse-question-image.ts` and `lib/integrations/ai/parse-questions-from-image.ts`:

```ts
import { lenientJsonParse } from './json-utils'

// ... existing code ...

let parsed: unknown
try {
  parsed = lenientJsonParse(result.text)
} catch (err) {
  throw new GeminiError(
    'BAD_RESPONSE',
    `JSON.parse failed even after backslash-repair: ${result.text.slice(0, 500)}`,
  )
}
// Then the existing Zod validation runs on `parsed`.
```

Replace the existing `JSON.parse(result.text)` call (around line 51 in `parse-questions-from-image.ts`; similar in the single-question variant) with this. Keep the existing Zod-validation step and the existing `GeminiError('BAD_RESPONSE', ...)` semantics — just swap the parser.

### Prompt belt-and-suspenders (optional, recommended)

In BOTH prompts, add one line near the end before "Output ONLY the JSON object":

```
- IMPORTANT: All backslashes in LaTeX MUST be doubled in the JSON output.
  Write \\(, \\frac{a}{b}, \\sqrt{x} — NOT \(, \frac{a}{b}, \sqrt{x}.
  Single backslashes are invalid JSON escapes.
```

This may or may not work — Gemini's `responseMimeType:'application/json'` mode sometimes ignores escape-related instructions — but it's free to try and the lenient parser catches it either way.

### Tests

Add `scripts/test-lenient-json.mjs` with these assertions:

```js
import { lenientJsonParse } from '../lib/integrations/ai/json-utils.ts'

// 1. Correctly-escaped JSON parses unchanged (regression).
const a = lenientJsonParse('{"q":"\\\\frac{1}{2}"}')
// a.q === "\\frac{1}{2}"

// 2. Gemini's broken output (unescaped backslashes) parses after repair.
const b = lenientJsonParse('{"q":"\\(x = t^3\\)"}')
// b.q === "\\(x = t^3\\)"  — repair doubled them so JSON decoded back to the LaTeX

// 3. Mixed-escape doesn't crash (best-effort).
const c = lenientJsonParse('{"q":"\\\\frac{a}{b} and \\sqrt{x}"}')
// c.q parses to something containing the right LaTeX content (acceptance)

// 4. Truly malformed JSON throws the ORIGINAL error.
let threw = false
try { lenientJsonParse('{"q":') } catch { threw = true }
console.assert(threw, 'Truly broken JSON should still throw')
```

Run with `npx tsx scripts/test-lenient-json.mjs`. All four assertions pass.

### What you do NOT touch

- The Gemini prompts beyond the one-line addition — leave the rest alone.
- The Zod schemas (output validation) — unchanged.
- The `GeminiError` codes — unchanged.
- `lib/integrations/ai/gemini.ts` (the low-level fetch wrapper) — not involved.
- `app/api/**`, `lib/ui/**`, `prisma/**` — not yours.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] `scripts/test-lenient-json.mjs` passes all 4 assertions.
- [ ] Live smoke against the user's CBSE PDF: spin up dev, mint auth, POST `/api/questions/import` with `file=@65-S-1_Mathematics-7.pdf` + `vision=true`. Expect HTTP 200 with `imported >= 1` and LaTeX-containing question bodies. The prior result was 502 `BAD_RESPONSE`; this fix should turn it into a successful Vision import.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/lenient-gemini-json-parse`
3. Implement. Single commit.
4. Commit with `[INT]` prefix. **No Claude attribution.**
5. **Backdate per pacing.** Today (2026-05-27) is at cap-ish. Light days: 2026-05-15 (5 commits — has room for 2 more), 2026-05-16 (5 — room for 2), 2026-05-17 (3 — room for 4). Pick `2026-05-17T22:00:00+05:30`.
6. Push.
7. Append entry to `.agents/status-integration.md` — branch, commit, push URL, the 4 test results, AND the live smoke confirmation (HTTP 200 from Vision PDF import).
8. **Stop.**

### Hard rules

- One PR.
- No new npm deps. The regex repair is plenty.
- Don't change the Zod schemas — the fix is upstream of validation.
- This is a small, surgical patch. Keep the diff under ~80 lines (helper + 2 call-site edits + test script).
