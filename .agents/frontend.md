# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — "Upload image of question" → auto-fill the single-question form

**Why:** User reports that copy-pasting a math question from a PDF flattens the 2D math layout (numerator/denominator collapse into separate lines, exponents like `x²` become `x2`). The fix is to upload the image directly and have a vision LLM extract the structured question with LaTeX math. BE has shipped `POST /api/questions/parse-image` (on branch `backend/parse-image-route`) which returns:

```json
{
  "success": true,
  "data": {
    "question_body": "If \\( \\frac{d}{dx} f(x) = 3x^2 - \\frac{3}{x^4} \\) ... is :",
    "question_type": "mcq",
    "options": ["\\( 6x + ... \\)", "\\( x^4 - ... \\)", "\\( x^3 + ... \\)", "\\( x^3 + ... \\)"],
    "correct_option": [],
    "usage": { "total_tokens": 1177 }
  }
}
```

**Your job is the UI** on the single-question creation form that consumes this route and pre-fills the form fields. **No taxonomy work, no paper work, no API work.**

**Branch:** `frontend/parse-image-upload`

**Base off:** `backend/parse-image-route` so your typecheck sees the route. Rebase to `main` if BE has merged.

### UI placement

- Existing form: `app/(dashboard)/questions/new/page.tsx` + the shared `components/questions/question-form.tsx`.
- Add a new section **above the "Question body" textarea**:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  Paste / upload an image of a question to auto-fill          │
  │  the form. We'll OCR the math into LaTeX for you.            │
  │                                                              │
  │  [ Upload image (PNG/JPG/WebP, max 5MB) ]                    │
  │                                                              │
  │  Tip: works best when the question + options are all in      │
  │  view. Math notation is converted to LaTeX automatically.    │
  └─────────────────────────────────────────────────────────────┘
  ```
- Drag-and-drop is a nice-to-have but not required. A single `<input type="file" accept="image/png,image/jpeg,image/webp">` triggered by a button is enough.

### Component: `components/questions/parse-from-image.tsx` (new)

- Self-contained component. Props:
  ```ts
  interface ParseFromImageProps {
    onParsed: (data: {
      question_body: string
      question_type: 'mcq' | 'numerical' | 'subjective'
      options: string[]
      correct_option: ('A'|'B'|'C'|'D')[]
    }) => void
    disabled?: boolean   // disable while the parent form is submitting
  }
  ```
- States: `idle | uploading | success | error`.
- On file select:
  1. Client-side validation: type in {png, jpeg, webp}, size ≤ 5 MB. Show inline error if fail; no network call.
  2. POST `multipart/form-data` to `/api/questions/parse-image` with the single `file` field.
  3. On success (HTTP 200): call `onParsed(data)`. Show a "Parsed in ${ms}ms (~${tokens} tokens)" toast for 3s.
  4. On error: map to a human-readable line and show inline:
     - 400 `GEMINI_NOT_CONFIGURED` → "Image upload requires the GEMINI_API_KEY env var. Ask an admin to configure."
     - 429 `RATE_LIMITED` → "Rate limit hit (15 requests/min on free tier). Try again in a minute."
     - 502 `GEMINI_FAILED` → "The OCR service didn't respond cleanly. Try again, or paste the question manually."
     - 500 `PARSE_FAILED` → "We couldn't parse the response. Try a clearer image, or paste the question manually."
     - Other → show the error.message.
- Loading UI: spinner + "Reading your image…" — the call usually takes 3-8 seconds.

### Form integration

- In `components/questions/question-form.tsx`, mount `<ParseFromImage>` above the question-body textarea.
- The `onParsed` handler should:
  1. `setValue('question_body', data.question_body)` — overwrite whatever's there.
  2. `setValue('question_type', data.question_type)` — overwrite.
  3. If `question_type === 'mcq'` and `options.length >= 4`:
     - `setValue('option_a', data.options[0])`
     - `setValue('option_b', data.options[1])`
     - `setValue('option_c', data.options[2])`
     - `setValue('option_d', data.options[3])`
  4. If `correct_option` array is non-empty, `setValue('correct_option', data.correct_option)`.
- Use the existing `useForm` instance from react-hook-form. Don't introduce a new form lib.
- Confirm-before-overwrite: if any of the form fields are already non-empty when the user clicks "Upload image," show a small confirm dialog: "This will overwrite your current Question body / options. Continue?" — single button yes, cancel = abort the upload. This prevents accidental wipes.

### LaTeX preview (nice-to-have)

- The existing question-body textarea probably doesn't render LaTeX. If there's already a KaTeX/MathJax preview pane elsewhere in the form, **leave it alone**. If there isn't, **don't add one** in this PR — out of scope. The user will see plain LaTeX source `\( \frac{d}{dx} ... \)` in the textarea, and the rendered output will appear in the paper export. That's acceptable for v1.

### Validation

- [ ] `npx tsc --noEmit` clean from `/mnt/d/varenyam-fe`.
- [ ] Smoke check in dev: open `/questions/new`, click "Upload image," pick a screenshot of a math question, confirm:
  - "Reading your image…" spinner shows
  - On success, question_body fills with `\( ... \)` LaTeX
  - If MCQ image, all 4 options fill
  - `question_type` switches to the right radio
- [ ] Smoke check the confirm-before-overwrite path: type something in the textarea first, then try to upload.

### Push

- Standard. If credential-manager refuses from `/mnt/d/varenyam-fe`, commit locally and orchestrator will push.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. Wait for BE branch to exist:
   ```
   git fetch origin
   git ls-remote origin backend/parse-image-route | grep refs/heads || echo "BE not pushed yet — wait"
   ```
3. `git checkout origin/backend/parse-image-route -b frontend/parse-image-upload` (or off `main` if BE has merged).
4. Implement. Single commit OK.
5. Commit with `[FE]` prefix. **No Claude attribution.**
6. **Backdate per pacing rule:** today/yesterday over cap. Pick a light day 2026-05-13 to 2026-05-21 evening IST.
7. Push (or hand off to orchestrator for credential reasons).
8. Append to `.agents/status-frontend.md`: branch, commit, push URL, and a one-line smoke result.
9. **Stop.** Skip `~/report.sh`.

### Hard rules

- One PR.
- Don't touch `app/api/**`, `types/**`, `prisma/**`, `lib/integrations/**`.
- Don't add new npm deps. shadcn/Dialog already exists for the confirm prompt; `apiPost` already exists in `lib/ui/api.ts` for the fetch.
- The textarea stays plain text for v1 — LaTeX preview is a future enhancement.
