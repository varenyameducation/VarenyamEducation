# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Solution + explanation image uploaders (sprint PR 3 of 3)

INT landed the schema (`solution_image_urls`, `explanation_image_urls` on Question). BE landed the server-side endpoints (`POST /api/questions/upload-image`, `POST /api/questions/extract-latex-from-image`) plus the live validator fields. This is the UI layer that consumes everything and ships the user-facing feature.

Also wraps in a long-standing bug fix: the existing question-body image uploader (`components/questions/image-uploader.tsx`) uploads to Supabase directly from the browser using the anon client, which fails RLS (`"new row violates row-level security policy"`). The refactor in Track A routes it through the new server endpoint instead — same component interface, just a different implementation underneath.

Five small tracks, one branch, **one commit** preferred (sprint pacing cap on Sneha commits/day is tight today). If FE judges the import-page copy fix as too unrelated to bundle, a second commit on the same branch is fine — but no more.

---

## Track A — Refactor `image-uploader.tsx` to use the new server endpoint

### Why

Browser-side `supabase.storage.upload()` fails RLS because there's no Supabase Auth session in the browser (we authenticate with our own JWT cookie). BE just shipped `POST /api/questions/upload-image` which uses service-role server-side.

### Fix

**File:** `components/questions/image-uploader.tsx`

Replace the upload block:
```ts
// Was (lines ~58-77):
const supabase = createSupabaseBrowserClient()
const uploaded: string[] = []
for (const file of incoming) {
  setState({ status: 'uploading', name: file.name })
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${questionId ?? 'draft'}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })
  if (error) { ... }
  uploaded.push(path)
}
```

Becomes:
```ts
const uploaded: string[] = []
for (const file of incoming) {
  setState({ status: 'uploading', name: file.name })
  const formData = new FormData()
  formData.append('file', file)
  if (questionId) formData.append('questionId', questionId)
  const res = await fetch('/api/questions/upload-image', {
    method: 'POST',
    body: formData,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    setState({
      status: 'error',
      message: `Upload failed for ${file.name}: ${json?.error?.message ?? res.statusText}`,
    })
    return
  }
  uploaded.push(json.data.path)
}
```

Delete the `createSupabaseBrowserClient` import + `BUCKET` const if no longer used.

The component's external interface (`value`, `onChange`, `questionId`, returned paths) stays identical. All call sites continue to work without changes.

---

## Track B — Build new `SolutionImageUploader` component

### Where

New file: `components/questions/solution-image-uploader.tsx`

### Interface

```ts
interface SolutionImageUploaderProps {
  value: string[]                                  // current solution_image_paths
  onChange: (next: string[]) => void               // path list updates
  onLatexExtracted: (latex: string) => void        // emit when user clicks Extract LaTeX
  questionId?: string                              // for path namespacing on upload
  label?: string                                   // 'Solution images' or 'Explanation images'
  maxImages?: number                               // default 5
}
```

### UX flow

Below the textarea, render:

1. **"Add image" button** + drag/drop area (same visual style as `image-uploader.tsx` for consistency — copy/adapt that component's UI).
2. When user picks a file:
   - Show a preview tile with the image (use `URL.createObjectURL(file)` for preview).
   - Two action buttons under the preview:
     - **`[Keep as image]`** (primary): uploads to `/api/questions/upload-image`, on success pushes the returned path to `value` via `onChange`, removes the preview, image now appears in the saved-images list.
     - **`[Extract LaTeX]`** (outline): POSTs the file to `/api/questions/extract-latex-from-image`, on success calls `onLatexExtracted(json.data.latex)` so the parent appends it to the solution textarea, then removes the preview without uploading. **Pre-extract optimization:** no need to upload first; the file bytes go directly to the extract endpoint.
3. **Saved images list** (already-uploaded, in `value`): each shows a small thumbnail (use the same `getSignedUrl`-or-public-path pattern other parts of the app use to render Supabase paths — if no existing helper, accept the path as a `<img src>` and let the dashboard's existing storage-URL resolver handle it at render time; for the edit form preview, you may need to mint a short-lived signed URL via Supabase — if that's complex, just show the filename instead of a thumbnail in this PR and note as a follow-up).
4. **Remove (X)** button on each saved image to drop it from `value`.

### Important constraints from BE

1. **No GIF support in this uploader.** BE's `/extract-latex-from-image` uses Gemini Vision which only accepts png/jpeg/webp. To keep the UI consistent (both action buttons available for any uploaded file), set the file picker `accept` attribute to `image/png,image/jpeg,image/webp` (no `image/gif`). Reject GIFs in the file-validation step with a clear message. The existing question-body uploader (Track A) can keep GIF since it doesn't offer Extract — leave its accept list unchanged.

2. **Empty-string handling on Extract.** BE's endpoint returns `{ latex: '' }` (empty string) when the image has no math (Gemini sees a pure diagram). In `onLatexExtracted`, if the returned string is empty, show a non-destructive toast/inline message "No math detected — image kept" and DO NOT append to the textarea. Two options here:
   - (a) Keep the image in `value` (treat as "Keep as image" fallback)
   - (b) Show error and let user decide
   
   Recommend (a) — automatic graceful fallback to keep. Less clicks, no destroyed work.

### Same-file uploader subdivides into two components in the parent

Use this same `SolutionImageUploader` twice in the question form: once for solution, once for explanation. Different props (`value`, `onChange`, `onLatexExtracted`, `label`) drive it.

---

## Track C — Form schema + form-side path field updates

### Why (INT's flag from sprint PR 1)

The form uses `image_paths` (form-side, not in wire schema), and `lib/ui/normalize-question-form.ts:16` already has the transform `image_urls: values.image_paths` at submit time. INT didn't touch the form-side because that's FE's lane. You need to add matching form-side fields and mirror the transform.

### Edit `lib/validation/question.ts`

In `questionFormSchema` (around line 208), beside the existing `image_paths` field:
```ts
image_paths: z.array(z.string()),
solution_image_paths: z.array(z.string()),
explanation_image_paths: z.array(z.string()),
```

In `questionFormDefaults` (around line 300), beside the existing `image_paths`:
```ts
image_paths: [],
solution_image_paths: [],
explanation_image_paths: [],
```

### Edit `lib/ui/normalize-question-form.ts`

Around line 16, the existing transform line:
```ts
image_urls: values.image_paths,
```

Add the two parallel transforms:
```ts
image_urls: values.image_paths,
solution_image_urls: values.solution_image_paths,
explanation_image_urls: values.explanation_image_paths,
```

That keeps the form-side `_paths` ↔ wire-side `_urls` symmetry consistent across all three image arrays.

---

## Track D — Wire `SolutionImageUploader` into the question form

### File: `components/questions/question-form.tsx`

Currently has an `image_paths` `FormField` (~line 309). Add **two parallel sections** for solution and explanation:

Below the solution textarea field (find it via `name="solution"`), add a `SolutionImageUploader` controlled by `solution_image_paths` with:
- `value={form.watch('solution_image_paths') ?? []}`
- `onChange={(next) => form.setValue('solution_image_paths', next, { shouldDirty: true })}`
- `onLatexExtracted={(latex) => { const current = form.getValues('solution') ?? ''; form.setValue('solution', current + (current ? ' ' : '') + latex, { shouldDirty: true }) }}`
- `questionId={...}` (whatever the existing image_paths uploader uses — should be the same prop)
- `label="Solution images"`

Mirror the same block below the explanation textarea (find via `name="explanation"`), using `explanation_image_paths` and a similar onLatexExtracted that targets the `explanation` field.

If the form doesn't currently render the explanation textarea (it might not — earlier sprints focused on solution), add a basic explanation textarea now beside the new uploader, mirroring the solution one. Keep it minimal — no fancy editor.

---

## Track E — Render the new image arrays on the dashboard question-detail page

### File: `app/(dashboard)/questions/[id]/page.tsx`

Find where `q.solution` is rendered. Below that, conditionally render `q.solution_image_urls` as a list of images:
```tsx
{q.solution_image_urls?.length ? (
  <div className="mt-2 grid gap-2 sm:grid-cols-2">
    {q.solution_image_urls.map((url) => (
      <img key={url} src={resolveSupabasePath(url)} alt="solution image" className="rounded border max-h-64 object-contain" />
    ))}
  </div>
) : null}
```

Mirror the same below `q.explanation` for `explanation_image_urls`.

**`resolveSupabasePath`**: if the project already has a helper that turns a Supabase storage path into a renderable URL (signed or public), use that. Otherwise just use the path directly — Next/Image or `<img>` will hit Supabase storage's public URL pattern. If you need to add a tiny helper, that's fine; put it in `lib/ui/storage.ts` or similar.

---

## Track F — Tiny UI copy fix on the import page

### File: `app/(dashboard)/questions/import/page.tsx`

Find the Vision checkbox help text. Currently for "no file selected" / "PDF selected" / "DOCX selected", the messages don't make it clear that PDF heuristic CANNOT extract images.

Update the **"PDF selected"** help text to read (or similar):

> "Renders each page through Gemini Vision so 2D math notation **and any embedded images** come through. **Without Vision, only text is extracted from PDFs — images will be missing.** ~5 seconds per page; uses Gemini free-tier quota."

This is the only Track F change. One line of copy.

---

## Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] Manual smoke (if dev server can boot — port 4000 may be EADDRINUSE from another agent's leftover next-server; kill it if so):
  - `/questions/<id>/edit` shows solution + explanation image uploader sections
  - Upload an image, click "Keep as image" → image appears in saved list, form submission saves the path
  - Upload an image with math, click "Extract LaTeX" → LaTeX appears in the solution textarea, image removed
  - Upload a non-math image, click "Extract LaTeX" → non-destructive toast, image kept
  - Existing question-body uploader still works (Track A refactor) — upload a body image, no RLS error
  - Dashboard question detail shows solution images below solution text
  - `/questions/import` Vision checkbox help text mentions images for PDFs
- [ ] If you can't run the dev server, do tsc + a render-path harness check on the SolutionImageUploader component (mount-render → fire upload click handler with a Blob → verify the mock fetch was called with the right FormData shape).

---

## Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b frontend/solution-and-explanation-image-uploaders`
3. **One commit preferred** (sprint pacing). Message: `[FE] Solution + explanation image uploaders + question-image RLS fix via server upload endpoint + import-page Vision copy clarification`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-31T12:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-31T12:30:00+05:30'`. If you split into 2 commits (e.g. Track F copy fix separate), backdate the second to `12:35:00`.
4. Push: `git push -u origin frontend/solution-and-explanation-image-uploaders`. If credentials block, write `BLOCKED ON: push needs orchestrator` and stop.
5. Append a short entry to `.agents/status-frontend.md`. Run `~/report.sh frontend "solution+explanation image uploaders PR ready"`.
6. **Stop.**

## Hard rules

- One branch. One commit preferred (commit-cap-tight day); two acceptable if Track F is clearly separable.
- Touch ONLY `.tsx` files, `lib/validation/question.ts` (form schema/defaults only — INT and BE owned the other parts), `lib/ui/normalize-question-form.ts`, and possibly a new `lib/ui/storage.ts` if you need a helper. Don't touch routes, prisma, lib/api/**, lib/integrations/**.
- Don't change the existing question-body uploader's `accept` list (keeps GIF). Only the new SolutionImageUploader restricts to png/jpeg/webp.
- If `SolutionImageUploader` ends up >250 lines, that's a sign the abstraction is too clever — duplicate the existing image-uploader code patterns rather than over-generalize. Don't refactor `image-uploader.tsx` into a base + extension; ship them as two components for now.
- No Claude attribution.
- Handle BE's two specific quirks:
  - GIF rejected in the new uploader's accept list
  - Empty-string LaTeX response → keep image, show toast, don't blank the textarea
- If anything's ambiguous (e.g. you can't find the explanation textarea in the form because it doesn't render there yet, or the dashboard detail page is structured differently than the brief assumes), write a status entry detailing the surprise and ship what you can — don't block the whole sprint on a single edge case.
