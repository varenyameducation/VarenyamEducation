# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — `POST /api/questions/parse-image` route

**Why:** User wants to upload a single image of a question and have the form auto-fill with the extracted text, math (as LaTeX), and MCQ options. INT is building the Gemini Vision wrapper + `parseQuestionFromImage()` helper on branch `integration/gemini-image-to-latex`. **Your job is the HTTP route that consumes that helper.** FE will then call this route from the question form.

**Branch:** `backend/parse-image-route`

**Base off:** `integration/gemini-image-to-latex` so your code typechecks against INT's helper. Rebase to `main` if INT has merged.

### Route shape

- [ ] `app/api/questions/parse-image/route.ts` — single `POST` handler. Multipart form-data input.

  Request:
  - Auth: any logged-in user (call `requireAuth()` like other question routes).
  - Content-Type: `multipart/form-data`.
  - Single field `file`: PNG, JPEG, or WebP, ≤ 5 MB.

  Response (success — HTTP 200):
  ```json
  {
    "success": true,
    "data": {
      "question_body": "If \\( \\frac{d}{dx} f(x) = 3x^2 - \\frac{3}{x^4} \\) ... is :",
      "question_type": "mcq",
      "options": ["\\( 6x + ... \\)", "...", "...", "..."],
      "correct_option": [],
      "usage": { "total_tokens": 1177 }
    }
  }
  ```

  Response (error — HTTP 4xx/5xx with envelope from `lib/api/response.ts`):
  - `400 INVALID_CONTENT_TYPE` — not multipart/form-data
  - `400 FILE_REQUIRED` — no `file` field
  - `400 FILE_EMPTY` — zero bytes
  - `400 FILE_TOO_LARGE` — > 5 MB
  - `400 INVALID_FILE_TYPE` — mimetype not in {image/png, image/jpeg, image/webp}
  - `400 GEMINI_NOT_CONFIGURED` — `GeminiError` with code `NO_KEY`. Friendly message: "Image parsing requires GEMINI_API_KEY in environment. Ask admin to configure."
  - `429 RATE_LIMITED` — `GeminiError` with code `RATE_LIMIT`. Include the model's retry-after if available.
  - `502 GEMINI_FAILED` — any other `GeminiError` (auth_fail, timeout, bad_response, network). Include `details.code` and `details.status` for debugging.
  - `500 PARSE_FAILED` — Zod parse error from INT's helper (Gemini returned malformed JSON). Include `details.raw` (the raw Gemini text) for debugging.

### Implementation guidance

- Mirror the patterns in `app/api/questions/import/route.ts`:
  - `requireAuth()` from `@/lib/api/taxonomy`
  - `getClientIp` from `@/lib/api/questions`
  - `err` / `ok` envelope helpers from `@/lib/api/response`
  - Multipart parsing via `request.formData()` wrapped in try/catch (fail with `INVALID_FORM`).

- Import the parse helper from INT:
  ```ts
  import { parseQuestionFromImage } from '@/lib/integrations/ai/parse-question-image'
  import { GeminiError } from '@/lib/integrations/ai/gemini'
  ```

- Buffer construction: `Buffer.from(await file.arrayBuffer())`.
- MIME validation: read `file.type`; if blank, sniff via filename extension (jpg/jpeg → image/jpeg, png → image/png, webp → image/webp). Reject anything else.
- Wrap the helper call in try/catch that maps `GeminiError` codes to the 4xx/5xx codes listed above.
- On success, log audit event `question.parse_image` with meta `{ actor_role, model: 'gemini-2.5-flash', total_tokens, question_type }` via `logAudit`.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Test the route end-to-end against the dev server:
  ```bash
  curl -X POST http://localhost:4000/api/questions/parse-image \
    -b "__access_token=$(...)" \
    -F "file=@/some/question/image.png"
  ```
  Confirm the JSON envelope shape matches the spec above.

### What you do NOT touch

- `lib/integrations/ai/**` is INT's. Just import from it.
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE owns the upload UI).
- `prisma/**`. No schema changes.
- Do not create a new audit-log type — reuse `question.parse_image` as a new action string under the existing `audit_log` model.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. Check INT branch status:
   ```
   git fetch origin
   git log origin/main --oneline -5 | grep -i "gemini\|image-to-latex" || echo "INT not merged — base off integration/gemini-image-to-latex"
   ```
   - If INT merged: `git checkout main && git pull && git checkout -b backend/parse-image-route`
   - Else: `git checkout origin/integration/gemini-image-to-latex -b backend/parse-image-route`
3. Implement. One commit is fine.
4. Commit with `[BE]` prefix. **No Claude attribution.**
5. **Backdate per pacing rule:** today/yesterday over cap. Light days are 2026-05-13 to 2026-05-21. Pick something around 2026-05-21 evening IST.
6. Push. If credential-manager refuses, commit locally; orchestrator will push.
7. Append to `.agents/status-backend.md`: branch, commit SHA, push URL, and a one-paragraph contract summary for FE (which fields the route returns, which errors to display).
8. **Stop.** Skip `~/report.sh`.

### Hard rules

- One PR.
- No new env vars beyond `GEMINI_API_KEY` (INT owns that; you just read process.env).
- No npm dependencies.
- Treat Gemini calls as expensive on the rate-limit dimension — do NOT add retry loops in this route (free tier is 15 req/min; retries would burn the quota). On 429 just return 429 to the client.
