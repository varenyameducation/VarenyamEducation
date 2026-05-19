# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — HOTFIX: lenient JSON parser breaks on Gemini's mixed-escape responses

**Severity: P0 — user-blocking.** User just ran Vision-PDF live on `65-S-1_Mathematics-7.pdf` and hit:

```
Page 1: BAD_RESPONSE — JSON.parse failed even after backslash-repair: { "questions": [ { "question_body": "If \( x = t^3 \) and \( y = t^2 \), then \( \\frac{d^2y}{dx^2} \) at \( t = 1 \) is :", "question_type": "mcq", "options": [ "\( \\frac{3}{2} \)", ...
```

Notice Gemini's response **mixes escape styles**:
- `\(` — single-backslash (invalid JSON, needs doubling)
- `\\frac` — properly double-escaped (valid JSON for one literal backslash; must NOT be touched)

The current `lenientJsonParse` in `lib/integrations/ai/json-utils.ts` uses `raw.replace(/\\(?![\\u])/g, '\\\\')`. When that hits `\\frac`:
- Position 0 (first `\`): next char is `\` (the second one). `\` IS in `[\\u]` → negative-lookahead fails → no match. Left alone. ✓
- Position 1 (second `\`): next char is `f`. `f` is NOT in `[\\u]` → match → double to `\\`.
- Result: `\\\frac` (three backslashes). JSON.parse decodes this as `\` + `<form-feed>` + `rac`. **Wrong.**

The regex needs to treat `\\` as **a unit** so the second backslash isn't seen as a candidate for doubling.

### The fix (verified working by orchestrator)

Use a protect-restore pattern. **Branch:** `integration/hotfix-lenient-json-mixed-escape`

**Base off:** `main`.

Replace the body of `lenientJsonParse` in `lib/integrations/ai/json-utils.ts` with:

```ts
export function lenientJsonParse<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (originalErr) {
    // Gemini sometimes emits LaTeX strings with MIXED escape styles in the
    // same response: `\(` (broken, single \) next to `\\frac` (proper, \\).
    // A naive `\\(?![\\u]) -> \\\\` regex doubles the SECOND backslash of a
    // valid `\\` pair (because it's followed by a letter), turning `\\frac`
    // into `\\\frac` — JSON.parse decodes that as `\` + `<form-feed>` + `rac`.
    //
    // Fix: protect existing `\\` pairs with a placeholder, double any
    // remaining lone `\` (except valid `\"`, `\/`, `\u` escapes), then
    // restore the protected pairs. This keeps already-escaped sequences
    // intact while doubling the broken single-backslash cases.
    const PROTECT = '__BS_PAIR__'
    const repaired = raw
      .replace(/\\\\/g, PROTECT)
      .replace(/\\(?!["\/u])/g, '\\\\')
      .replace(new RegExp(PROTECT, 'g'), '\\\\')
    try {
      return JSON.parse(repaired) as T
    } catch {
      throw originalErr
    }
  }
}
```

Key behavioral guarantees:
- **Pure-correct input** (`"\\\\frac{1}{2}"`) → strict JSON.parse succeeds on first try; repair never runs. Zero overhead.
- **Pure-broken input** (`"\\( x^2 \\)"`) → strict fails; repair doubles all lone backslashes; parse succeeds.
- **Mixed input** (`"\\( \\\\frac{1}{2} \\)"`) → strict fails; repair protects the `\\`, doubles the `\(` and `\)`, restores; parse succeeds with the right LaTeX.

### Tests

Update `scripts/test-lenient-json.mjs` to add a **mixed-escape** case. The existing tests should continue to pass. New case roughly:

```js
const mixed = '{"q": "\\\\( \\\\\\\\frac{1}{2} \\\\)"}'  // {"q": "\( \\frac{1}{2} \)"}
const out = lenientJsonParse(mixed)
console.assert(out.q === '\\( \\frac{1}{2} \\)', `mixed escape: got ${JSON.stringify(out.q)}`)
```

Add 1-2 more cases reflecting actual Gemini output patterns (the user's raw response, captured in the brief above) for regression coverage.

### Validation — run the live smoke too

Don't just trust the unit tests. After the code change:

1. `rm -rf .next && npm run dev`
2. Mint a JWT for super_admin (use orchestrator's prior pattern), POST `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` to `/api/questions/import` with `vision=true`.
3. Expect HTTP 200 with `imported: 4, mcq_count: 4, total_tokens ~1500-2000, errors: []`. The 4 questions in the DB after this call should have `question_body` containing `\( \frac{...}` style LaTeX (single backslashes — Gemini's intent — once JSON-decoded).
4. Capture the curl output verbatim in your status entry.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/hotfix-lenient-json-mixed-escape`
3. Apply the fix to `lib/integrations/ai/json-utils.ts`. Update `scripts/test-lenient-json.mjs` with the mixed-escape case + at least one regression case using the real Gemini response shape from the brief.
4. Run BOTH unit tests AND the live smoke. **Don't push until live smoke passes.**
5. Commit with `[INT]` prefix. **No Claude attribution.** Message: `[INT] Hotfix: lenient JSON parser handles mixed-escape Gemini responses`.
6. **Backdate per pacing rule.** Pick `2026-05-19T22:00:00+05:30`.
7. Push.
8. Append a 4-line entry to `.agents/status-integration.md` — branch, commit, push URL, live smoke result (HTTP code + imported count + first question's body).
9. **Stop.**

### Hard rules

- Single PR, single commit (plus the auto-generated `[INT] Status: ...` if your workflow adds one).
- Don't change the prompts — they're correct. The fix is purely in the parser.
- Don't change `parse-question-image.ts` or `parse-questions-from-image.ts` — they call `lenientJsonParse` and that interface stays the same.
- The regex must handle the three documented cases (pure-correct, pure-broken, mixed) — verify in your unit test, NOT just by eyeballing.
- The user is blocked. Speed matters; correctness more.
