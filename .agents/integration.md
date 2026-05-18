# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Multi-question Gemini Vision helper

**Why:** The single-question `parseQuestionFromImage` shipped last sprint works great for one image / one question. The next sprint extends bulk PDF/DOCX import to use Gemini Vision per page (because text extraction from PDFs butchers math layout — user verified this is a hard blocker for math papers). One page can contain 0, 1, or many questions. You build the multi-question variant of the helper.

**Branch:** `integration/multi-question-vision`

**Base off:** `main`.

### What ships in `lib/integrations/ai/parse-questions-from-image.ts` (new file)

```ts
import { z } from 'zod'
import { geminiGenerateText, GeminiError } from './gemini'

// Reuse the per-question schema from parse-question-image.ts. Multi-question
// response is a JSON object with a `questions` array of zero or more such
// items. Empty array is valid (page might be all header / instructions /
// blank).
const parsedQuestionSchema = z.object({
  question_body: z.string().min(1),
  question_type: z.enum(['mcq', 'numerical', 'subjective']),
  options: z.array(z.string()).default([]),
  correct_option: z.array(z.enum(['A', 'B', 'C', 'D'])).default([]),
})
export type ParsedQuestion = z.infer<typeof parsedQuestionSchema>

const responseSchema = z.object({
  questions: z.array(parsedQuestionSchema).default([]),
})

export async function parseQuestionsFromImage(
  imageBuffer: Buffer,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
): Promise<{ parsed: ParsedQuestion[]; usage: { totalTokens: number } }>
```

### Prompt (verified locally before shipping)

```
Extract ALL exam questions visible in this image and return a single JSON
object with exactly this shape:

{
  "questions": [
    {
      "question_body": "<question text with math in LaTeX>",
      "question_type": "mcq" | "numerical" | "subjective",
      "options": ["<option A LaTeX>", "<option B LaTeX>", "<option C LaTeX>", "<option D LaTeX>"],
      "correct_option": []
    },
    ...
  ]
}

Rules:
- Convert ALL math notation to LaTeX. Wrap inline math in \( ... \) and
  display math in \[ ... \]. Keep prose as plain text.
- Detect MCQs by the (A) (B) (C) (D) option pattern. If MCQ, populate
  options with exactly 4 strings (preserve A/B/C/D order). If not MCQ, set
  options to [].
- question_type: 'mcq' if 4-option choice; 'numerical' if the answer is a
  numeric value (e.g. "find the value of x"); 'subjective' for everything
  else (descriptive answer).
- correct_option: leave [] unless the image explicitly marks the correct
  one with a tick, asterisk, or "Ans:" prefix.
- SKIP non-question content: page headers, page numbers ("Page 7 of 23"),
  paper codes ("65/S/1"), instructions blocks ("All questions are
  compulsory"), section labels by themselves ("Section A"), running
  watermarks. Only extract things that are actual answerable questions.
- If the page contains zero questions, return {"questions": []}.
- Output ONLY the JSON object. No markdown fences, no commentary.
```

### Implementation guidance

- Use `geminiGenerateText` from the existing `./gemini` wrapper. Pass `responseMimeType: 'application/json'` in the options.
- Default model: same `gemini-2.5-flash` as the single-question helper.
- Validate same image constraints as single helper: mime allow-list `image/png|jpeg|webp`, size ≤ 5 MiB. Throw a typed error if violated.
- After `JSON.parse(result.text)`, Zod-validate against `responseSchema`. On Zod failure, throw `GeminiError('BAD_RESPONSE', '...', undefined)` with the first 500 chars of the raw text included in the message — actionable when Gemini hallucinates malformed JSON.
- Log a `console.warn` (not throw) when a question's `question_type === 'mcq'` but `options.length !== 4` — partial parse is still usable, BE can decide whether to keep or skip.
- Return `{ parsed: validated.data.questions, usage: { totalTokens: result.usage.totalTokens } }`.

### Updates to barrel

- `lib/integrations/ai/index.ts` — add re-export of `parseQuestionsFromImage` and the `ParsedQuestion` type. Keep `parseQuestionFromImage` (singular) exported alongside — they coexist.

### Smoke test

- [ ] Run `scripts/test-gemini-image.mjs` (or write a sibling `scripts/test-gemini-multi.mjs`) against ANY image — even the Varenyam logo. The mark PNG isn't a question page → Gemini should return `{ "questions": [] }` after Zod parses. That's the success signal for plumbing.
- [ ] If you have time, also test against the user's PDF question image — render page 7 of `/mnt/c/Users/HP/Downloads/65-S-1_Mathematics-7.pdf` to PNG (you can borrow `pdf-to-img` from BE's branch if it lands first, or use any other quick method) and verify Gemini extracts ~3 questions from it.

### What you do NOT touch

- `app/api/**` (BE owns the route).
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE owns UI).
- `prisma/**`.
- The single-question helper `parse-question-image.ts` (it stays as-is and remains used by `/questions/new`).
- `.env.local`. `GEMINI_API_KEY` is already there.

### Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-int` (or wherever you check out).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/multi-question-vision`
3. Implement. One commit OK.
4. Commit with `[INT]` prefix. **No Claude attribution.**
5. **Backdate per pacing rule**: today (2026-05-27) has 1 commit so far (free), yesterday and the day before are well over cap. Light days: 2026-05-13 to 2026-05-21 (counts already in the recent log; 2026-05-19 = 7 / 2026-05-21 = 7 are at cap; pick something earlier like 2026-05-18 evening IST — that day has 2 commits, so 6 slots free).
6. Push. If credential-manager refuses from `/mnt/d/varenyam-int`, commit locally and orchestrator will push from `/mnt/d/varenyam`.
7. Append to `.agents/status-integration.md` with branch, commit SHA, push URL, the public function signatures, and the BE error-mapping reminder (NO_KEY → 400, RATE_LIMIT → 429, etc. — same as single helper).
8. **Stop.** Skip `~/report.sh`.

### Hard rules

- Single PR.
- No new npm dependencies.
- Don't log the API key. Don't include it in any commit.
- The single-question helper stays untouched and exported — both helpers coexist.
- Gemini-2.5-flash is the right model. Don't switch to a different one.
