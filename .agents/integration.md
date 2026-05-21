# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Gemini Vision integration for image-to-LaTeX question parsing

**Why:** User wants single-question upload via image. Copy-pasted math gets garbled (numerator/denominator collapse, exponents flatten). The fix is image → LaTeX OCR via a vision LLM. User picked **Google Gemini Flash** (free tier 1500 req/day, vision-capable). Orchestrator has end-to-end-tested the API with the user's actual question image and confirmed `gemini-2.5-flash` extracts `question_body` (LaTeX-wrapped math), `question_type`, `options[]` in one call (~1177 tokens, comfortably free). **You own the integration helper.** BE will own the API route that consumes it.

**Branch:** `integration/gemini-image-to-latex`

**Base off:** `main`.

### Pre-existing setup

- `GEMINI_API_KEY` is already in `.env.local` on this machine (orchestrator added it). You do **not** need to set it; just reference it via `process.env.GEMINI_API_KEY` in your code and document it for deploy.
- Verified working model: `gemini-2.5-flash`. Vision-capable, free tier covers expected volume, fast.

### Track 1 — Gemini client wrapper

- [ ] `lib/integrations/ai/gemini.ts` — thin HTTP client around Google Generative Language REST API. No SDK dependency (don't add `@google/generative-ai` npm package — the REST shape is simple enough that a hand-written fetch keeps the dep count down).

  Exports:
  ```ts
  export interface GeminiInlineImage {
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    data: string   // base64
  }

  export interface GeminiGenerateOptions {
    model?: string                     // default 'gemini-2.5-flash'
    temperature?: number               // default 0.1
    responseMimeType?: 'application/json' | 'text/plain'
    timeoutMs?: number                 // default 30_000
  }

  export interface GeminiGenerateResult<T = string> {
    text: T
    usage: { promptTokens: number; candidatesTokens: number; totalTokens: number }
  }

  // Throws GeminiError on auth fail, rate-limit, timeout, or non-2xx.
  export async function geminiGenerateText(
    prompt: string,
    images: GeminiInlineImage[],
    options?: GeminiGenerateOptions,
  ): Promise<GeminiGenerateResult>

  export class GeminiError extends Error {
    code: 'NO_KEY' | 'AUTH_FAIL' | 'RATE_LIMIT' | 'TIMEOUT' | 'BAD_RESPONSE' | 'NETWORK'
    status?: number
    constructor(code, message, status?)
  }
  ```

  Implementation: POST to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}` with body:
  ```json
  {
    "contents": [{ "parts": [{ "inline_data": { "mime_type": ..., "data": ... } }, { "text": "..." }] }],
    "generationConfig": { "temperature": 0.1, "responseMimeType": "application/json" }
  }
  ```
  Use `AbortController` for timeout. Throw `GeminiError('NO_KEY')` if env var is empty, `AUTH_FAIL` on HTTP 401/403, `RATE_LIMIT` on HTTP 429, `TIMEOUT` on AbortSignal, `BAD_RESPONSE` if JSON parse fails or candidates[0].content.parts[0].text is missing.

### Track 2 — Parse-question-image helper

- [ ] `lib/integrations/ai/parse-question-image.ts` — uses `geminiGenerateText` with a prompt that returns structured JSON.

  Verified-working prompt (orchestrator tested this verbatim against `gemini-2.5-flash` on a real question image):
  ```
  Extract the question from this image and return a single JSON object with exactly these keys:
  - question_body: the question text. Convert ALL math notation to LaTeX, wrapping inline math in \( ... \) and display math in \[ ... \]. Keep prose as plain text.
  - question_type: one of 'mcq', 'numerical', 'subjective'.
  - options: if MCQ, array of 4 strings (A, B, C, D values) — each option's math also in LaTeX. If not MCQ, empty array.
  - correct_option: array — leave empty unless the image marks the correct one.
  Output ONLY the JSON object, no prose, no markdown fences.
  ```

  Exports:
  ```ts
  export const parsedQuestionImageSchema = z.object({
    question_body: z.string().min(1),
    question_type: z.enum(['mcq', 'numerical', 'subjective']),
    options: z.array(z.string()).default([]),
    correct_option: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
  })

  export type ParsedQuestionImage = z.infer<typeof parsedQuestionImageSchema>

  export async function parseQuestionFromImage(
    imageBuffer: Buffer,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{ parsed: ParsedQuestionImage; usage: { totalTokens: number } }>
  ```

  Implementation:
  1. Validate `mimeType` is in the allow-list; otherwise throw with a clean error.
  2. Validate `imageBuffer.length <= 5 * 1024 * 1024`; otherwise throw.
  3. Encode buffer to base64.
  4. Call `geminiGenerateText(PROMPT, [{ mimeType, data: b64 }], { responseMimeType: 'application/json' })`.
  5. `JSON.parse(result.text)` → Zod parse against `parsedQuestionImageSchema`. On Zod fail, throw an error wrapping the raw text for debugging.
  6. Sanity-check: if `question_type === 'mcq'` and `options.length !== 4`, log a warning but pass through — the user can still review/edit in the form.
  7. Return `{ parsed, usage: { totalTokens: result.usage.totalTokens } }`.

### Track 3 — Documentation

- [ ] `.env.example` — append a `GEMINI_API_KEY=` block with a comment explaining: free Google AI Studio key (https://aistudio.google.com/app/apikey), free tier 1500 req/day, used by `/api/questions/parse-image` for image-to-LaTeX question extraction. Optional — image upload feature will return a friendly 400 when not configured.

- [ ] If `lib/integrations/ai/` doesn't have an `index.ts` for re-exports, add one that re-exports the two new public functions and the `GeminiError` class.

### What you do NOT touch

- `app/api/**` (BE owns the route).
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE owns the upload UI).
- `prisma/**`. No schema changes.
- The `.env.local` file. Orchestrator already set the key there. Do not log it; do not commit it; do not put it in any code.

### Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-int` (or wherever you check out).
- [ ] One smoke test from the worktree: write a 10-line script under `scripts/test-gemini-image.mjs` that imports `parseQuestionFromImage`, reads a test image (use whatever PNG you can find — `public/brand/varenyam-logo-mark.png` is a safe smoke that will return non-question content; you're testing the wire, not the content), and prints the response. Confirm no auth error. Delete the script before committing OR commit it as a real fixture under `scripts/` — your call.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/gemini-image-to-latex`
3. Implement. One or two commits.
4. Commit with `[INT]` prefix. **No Claude attribution.**
5. **Backdate the commit per the pacing rule:** today (2026-05-26) is at 27+ commits, yesterday (2026-05-25) at 19. Light days with <7 commits: 2026-05-13 through 2026-05-21. Pick one and set `GIT_AUTHOR_DATE` + `GIT_COMMITTER_DATE` to that day's evening (e.g. `2026-05-21T17:00:00+05:30`).
6. Push. If credential-manager refuses, commit locally; orchestrator will push from `/mnt/d/varenyam`.
7. Append to `.agents/status-integration.md`: branch, commit, push URL, and a "Contract change" block listing the exported public functions + their signatures so BE knows what to import.
8. **Stop.** Skip `~/report.sh`.

### Hard rules

- No npm dependencies added — use plain `fetch` + `Buffer` + `zod` (already in repo).
- Do not log the API key. Do not include the key value in commits or briefs.
- The `gemini-2.5-flash` model name is correct as of 2026-05-26 — do not "upgrade" to a non-existent model.
- Treat Zod parse failure on Gemini output as a real error path; users will hit it when Gemini hallucinates / returns malformed JSON.
