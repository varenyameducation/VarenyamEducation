# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Image upload + LaTeX extract endpoints (sprint PR 2 of 3)

INT just landed the schema: `Question` now has `solution_image_urls: String[]` and `explanation_image_urls: String[]` alongside existing `image_urls`. Your job is the server-side foundation FE will consume next.

Three pieces, all in one branch / one commit:

1. **Server-side upload endpoint** — fixes a long-standing RLS bug AND serves the new feature
2. **Validator updates** in `lib/api/questions.ts` so the new fields actually round-trip through POST/PATCH
3. **LaTeX-from-image endpoint** wrapping the existing Gemini Vision helper

---

## Track A — `POST /api/questions/upload-image` (replaces browser-direct Supabase upload)

### Why this exists (the long-standing bug it fixes)

`components/questions/image-uploader.tsx` currently calls `supabase.storage.from('question-images').upload(...)` from the **browser** using the anon Supabase client. The browser has no Supabase Auth session (we use our own JWT cookie, not Supabase Auth), so the upload is anonymous → fails RLS with `"new row violates row-level security policy"`. Users have been hitting this for weeks on the question edit form.

The bulk-import path doesn't hit this because it uses `createSupabaseServerClient()` (service-role) server-side. We're doing the same here.

### Build

**File:** new `app/api/questions/upload-image/route.ts`

**Method:** `POST`, accepts `multipart/form-data` with:
- `file` (required): the image to upload
- `questionId` (optional string): the Question UUID if known, used for path namespacing; defaults to `'draft'` for new questions being created

**Behavior:**
1. `requireAuth()` via the existing `lib/api/taxonomy.ts` helper. Reject 401 if no JWT.
2. Validate file:
   - Size ≤ 5 MB (use same limit as existing uploader for consistency)
   - MIME type in `['image/png', 'image/jpeg', 'image/webp', 'image/gif']`
   - Reject 400 with clear messages on either failure
3. Generate path: `${questionId ?? 'draft'}/${crypto.randomUUID()}.${ext}` — match the existing `components/questions/image-uploader.tsx:63` pattern so paths produced by both the old and new code are interchangeable.
4. Upload via `createSupabaseServerClient()` (service-role, bypasses RLS) to the `question-images` bucket.
5. On success: return `ok({ path })` — just the path, matching the existing FE expectation (it stores paths, not URLs; the path→signed-URL transform happens at render time elsewhere).
6. On Supabase error: return 500 with the error message surfaced.

**Runtime declarations:**
```ts
export const runtime = 'nodejs'
export const maxDuration = 30
```
(30s is overkill for an image upload but matches the import route conservatism; if your test shows it doesn't need this, drop to default.)

### Track A validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] Local smoke (with `BROWSERLESS_TOKEN` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set): `curl -X POST -F file=@/tmp/test.png -F questionId=draft http://localhost:4000/api/questions/upload-image -b "<JWT cookie>"` → 200 with `{ path: "draft/<uuid>.png" }`. If port 4000 still EADDRINUSE in this shell, skip the local smoke and write so in status.
- [ ] No `createSupabaseBrowserClient` usage in the new route.

---

## Track B — Update `lib/api/questions.ts` validators (INT's flag)

INT flagged this in their handoff. The live POST/PATCH route validators are in `lib/api/questions.ts`, NOT `lib/validation/question.ts` (which is the import-parser path). Both schemas need the new fields or POST/PATCH will silently strip them.

**Edit `lib/api/questions.ts`:**

1. **`baseQuestionFields`** (around line 61) — has `image_urls: z.array(z.string().url()).max(10).optional()`. Add:
   ```ts
   solution_image_urls: z.array(z.string().url()).max(10).optional(),
   explanation_image_urls: z.array(z.string().url()).max(10).optional(),
   ```
   Same pattern, same cap. Place them immediately after `image_urls` to keep the file diff tight.

2. **`baseUpdateFields`** (around line 135) — same addition. Same field definitions.

That's it for this file. No handler changes — `createQuestionSchema` and `updateQuestionSchema` automatically pick up the new fields through their base spreads, and the route handlers (`POST /api/questions`, `PATCH /api/questions/[id]`) automatically write whatever the schema accepts through Prisma.

### Track B validation

- [ ] `grep -n "image_urls" lib/api/questions.ts` → shows the existing line PLUS both new field lines in both `baseQuestionFields` and `baseUpdateFields` (4 new lines total, 2 grouped pairs).
- [ ] `npx tsc --noEmit` exits 0 (Prisma client now has the new fields, so updates with the new fields should typecheck).

---

## Track C — `POST /api/questions/extract-latex-from-image` (Gemini Vision wrapper)

### Why

FE will let users click "Extract LaTeX" on an uploaded solution/explanation image. The endpoint takes the image bytes, runs them through Gemini Vision (extracting just the math content as LaTeX), returns the extracted LaTeX text. FE then appends to the solution/explanation textarea.

### Build

**File:** new `app/api/questions/extract-latex-from-image/route.ts`

**Method:** `POST`, accepts `multipart/form-data` with:
- `file` (required): the image to OCR

**Behavior:**
1. `requireAuth()` — reject 401 if no JWT.
2. Validate file: same size/MIME rules as upload-image.
3. Call the existing helper. Per BE's 5/28 status, this exists already: `lib/integrations/ai/extract-latex-from-image.ts` (built for DOCX vision import). Verify the export shape with `grep export lib/integrations/ai/extract-latex-from-image.ts`. If the existing function takes a Buffer + returns a string of LaTeX, use it directly. If its signature is different, adapt:
   - Convert the uploaded `File` to a `Buffer` via `Buffer.from(await file.arrayBuffer())`
   - Call the helper
   - Get back LaTeX
4. Return `ok({ latex })`.
5. On Gemini error: return 502 with the error message. Don't retry server-side — FE can retry the user click if they want.

**Runtime declarations:**
```ts
export const runtime = 'nodejs'
export const maxDuration = 30
```
(Gemini Vision typically returns in 2-5s, but cold-start can add a few.)

### Format expectation

Return LaTeX with delimiters that match what the splitter (`lib/ui/render-body-html.ts`) expects: `\( … \)` for inline, `\[ … \]` for display. The existing helper probably already does this — if it returns bare LaTeX, wrap it: default to inline (`\( … \)`), since FE can manually toggle to display if needed. Document the format choice in the route file's top-comment.

### Track C validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] Verify `lib/integrations/ai/extract-latex-from-image.ts` exists and document its signature in your status entry.
- [ ] Local smoke (if env allows): POST a small math screenshot, get LaTeX back in a string that starts with `\(` or `\[`.

---

## Out of scope (don't touch — FE owns)

- Any `.tsx` file in `components/` or `app/(dashboard)/`
- The image-uploader component itself
- The question form schema (`questionFormSchema` / `questionFormDefaults` in `lib/validation/question.ts` — INT flagged FE owns the form-side `image_paths` extension)

---

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/image-upload-and-extract-latex-endpoints`
3. **Single commit** covering all 3 tracks. Message: `[BE] Question image uploads: server-side /upload-image (fixes RLS bug) + extract-latex-from-image endpoint + validator fields for solution/explanation arrays`.
4. **Backdate:** same pacing issue as INT — yesterday (5/30) and earlier days are at the 7-commit/day cap. Use **today** at a reasonable past-time-of-day: `GIT_AUTHOR_DATE='2026-05-31T11:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-31T11:30:00+05:30'`.
5. Push: `git push -u origin backend/image-upload-and-extract-latex-endpoints`. If credentials block, write `BLOCKED ON: push needs orchestrator` and stop.
6. Append a short entry to `.agents/status-backend.md`. Run `~/report.sh backend "image-upload + extract-latex + validator update PR ready"`.
7. **Stop.**

## Hard rules

- One branch, one commit, one PR. All three tracks belong together because the FE PR will consume them as a set.
- Don't touch `prisma/schema.prisma`, the migration (INT just landed those), `lib/validation/question.ts` (INT covered the import-parser path, FE will handle form-side), or any `.tsx` file.
- Use service-role client for storage operations only (RLS bypass needed). Use `requireAuth` for JWT verification (don't roll your own).
- No Claude attribution.
- If `lib/integrations/ai/extract-latex-from-image.ts` doesn't exist or has a different shape than expected, STOP — write a status entry showing what's there. Orchestrator will rescope Track C to use a different existing helper or to build a thin wrapper.
- If `requireAuth` doesn't exist where the brief says (`lib/api/taxonomy.ts`), grep for it across `lib/` and use the canonical one; document where you found it.
