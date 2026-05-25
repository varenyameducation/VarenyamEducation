# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Resolve m2m PR conflict; consume joined-name fields

**Why:** The frontend M2M PR (`frontend/multitax-blueprint-paper`, 5 commits, already pushed) has a textual conflict with main in `lib/ui/api.ts` plus a deeper type mismatch:

- FE built against a local mock `TaxonomyTag` in `@/lib/ui/mocks/m2m` that carries `course_name`, `chapter_name`, `topic_name`, `subject` (denormalized names for chip rendering).
- INT + BE shipped a canonical `TaxonomyTagRow` in `@/types/taxonomy` that is ID-only.

INT has now landed `integration/joined-names-on-tag-row` (adds optional `course_name`/`chapter_name?`/`topic_name?`/`subject?` to `TaxonomyTagRow`). BE has landed `backend/joined-names-on-tag-row` (populates those fields on every `/api/questions` response). **Your job is to rebase, resolve the conflict, drop the mock TaxonomyTag type definition, and migrate all callsites to the canonical type.**

**Branch:** `frontend/multitax-blueprint-paper` (existing — don't create a new one; rebase the existing branch).

### Workflow at a glance

1. `git fetch origin && git checkout frontend/multitax-blueprint-paper && git pull`
2. `git rebase origin/main` — expect a conflict in `lib/ui/api.ts`. Resolve by taking main's side (the canonical interface) **and** dropping the legacy `course`/`chapter`/`topic` joined fields on `Question` (BE no longer returns them).
3. Cascade-fix the consumer files (listed below).
4. `npx tsc --noEmit` clean.
5. `npx next build` (optional but recommended) to catch any runtime-only issues.
6. Force-push the rebased branch: `git push --force-with-lease`.
7. Append status entry; stop.

### File-by-file changes

#### `lib/ui/api.ts`

- Take main's side for both conflict hunks.
- Final shape of the import:
  ```ts
  import type { TaxonomyTagRow } from '@/types/taxonomy'
  ```
- Final shape of `Question`:
  ```ts
  export interface Question {
    id: string
    subject: SubjectValue
    ...
    taxonomies: TaxonomyTagRow[]
    // No more course/chapter/topic joined fields.
  }
  ```

#### `lib/ui/mocks/m2m.ts`

- Delete the local `export type TaxonomyTag = { course_id; course_name; ... }` definition.
- Re-export from canonical:
  ```ts
  export type { TaxonomyTag, TaxonomyTagRow } from '@/types/taxonomy'
  ```
- `formatTagLabel(tag)` — change parameter type to `TaxonomyTagRow`. Read `tag.course_name`, `tag.chapter_name`, `tag.topic_name` (all now live on the canonical row when populated by BE). Fall back to the IDs (formatted as short strings) when names are missing — this keeps the function safe for locally-constructed rows that haven't round-tripped through the API yet.
- `deriveQuestionTags(q)` — this used to fabricate a `TaxonomyTag` from the legacy `Question.course/chapter/topic` joined fields. Those are GONE on `Question`. **Delete `deriveQuestionTags` and all its callsites** — consumers should read `q.taxonomies` directly. If a callsite needs a "first tag" fallback for legacy untagged questions, use `q.taxonomies[0]` and gate the render with `q.taxonomies.length > 0`.
- `MOCK_M2M_TAGS_BY_QUESTION` — update each mock row to be the canonical shape: `{ id, course_id, chapter_id?, topic_id?, exam_type, created_at, course_name, chapter_name?, topic_name?, subject? }`. Generate plausible `id`/`created_at` for the mocks (e.g. `crypto.randomUUID()` and `new Date().toISOString()` evaluated once at module load, or hard-coded fixtures).
- `LegacyTaggedQuestion` type can be deleted (its only consumer was `deriveQuestionTags`).

#### `components/questions/taxonomy-tag-picker.tsx`

- The component holds picker state. Internal `value: TaxonomyTag[]` from `@/types/taxonomy` should remain the input/output type (no names) — the picker BUILDS tags, doesn't render labels for tags-in-flight. For chip labels, take a parallel `taxonomyOptions: TaxonomyTagRow[]` prop that has names, or do a lookup against the in-context course/chapter/topic state that the parent already has.
- Cleanest interface change: keep `value: TaxonomyTag[]` (canonical input shape, name-less) and add a `formatLabel?: (tag: TaxonomyTag) => string` callback prop that the parent supplies. Parent has access to its course/chapter/topic state and can format. Default the formatter to a fallback that prints `chapter_id ?? course_id`.
- This is a real refactor — take care to keep the existing keyboard/blur behavior.

#### `components/questions/question-form.tsx`

- Update the `taxonomies` field state to be `TaxonomyTag[]` (without names — they get added by the server after POST). On form submit, you already POST `taxonomies` to `/api/questions`; the request body is unchanged. On form mount when editing an existing question, you read `q.taxonomies` which is now `TaxonomyTagRow[]` — strip the row's `id`/`created_at`/name fields before seeding the picker's state.
- The legacy `course_id`/`chapter_id`/`topic_id`/`exam_type` top-level fields you held back as v1-compat should now be REMOVED from the form schema and submit body — BE only accepts `taxonomies` now.

#### `components/questions/bulk-retag-modal.tsx`

- Same picker integration treatment as the form. Internal state `tags: TaxonomyTag[]`.

#### `components/questions/question-card.tsx`

- Currently calls `deriveQuestionTags(q)` to get tags. Replace with `q.taxonomies`. Use `formatTagLabel(tag)` directly (now name-aware).

#### `app/(dashboard)/questions/[id]/page.tsx`

- Same `deriveQuestionTags` → `q.taxonomies` swap. The header chip strip now reads server-provided names.
- If this page reads `q.exam_type` anywhere, replace with `q.taxonomies[0]?.exam_type ?? '—'` or a de-duped list of all `taxonomies[].exam_type` values.

#### `app/(dashboard)/questions/[id]/edit/page.tsx`

- Drops `import type { TaxonomyTag } from '@/lib/ui/mocks/m2m'` — switch to `@/types/taxonomy`.
- The `seedTag` derivation that reads `q.course_id` etc. won't compile (`Question` no longer has these fields). Replace with `const seedTags = q.taxonomies` (already an array; pass directly to the form).

#### `app/(dashboard)/questions/page.tsx`

- Filters and grouping currently read `q.course?.id`/`q.chapter?.id`/`q.topic?.id`. These joined fields are gone. Switch to reading the **first** taxonomy tag for backward-compatible grouping (or, if you want to honor multi-tagging, group by every `(q, tag)` cross-product — note this in the status entry).
- Filter sidebar still posts `course_id`/`chapter_id`/`topic_id`/`exam_type` as query params; that contract is unchanged.

#### `app/(dashboard)/tests/new/page.tsx`

- Imports `GenerateTestPayload` from `@/lib/ui/mocks/m2m` — this stays (mock module re-exports it). No change unless typecheck flags it.

### Validation

- [ ] `npx tsc --noEmit` exit 0.
- [ ] Smoke test by clicking through: question bank list → question detail → edit → bulk retag → test creator blueprint mode. (You can do this in dev — `npm run dev` — if you want, but typecheck-clean is the binding bar.)

### Push

- The branch is shared with origin (already pushed). After rebase you'll need a force push:
  ```
  git push --force-with-lease origin frontend/multitax-blueprint-paper
  ```
  Use `--force-with-lease`, NOT `--force` (so you don't clobber someone else's commits).

### Status + report

- Append to `.agents/status-frontend.md`: rebase note, files changed, commit list, force-push confirmation, PR URL (same one — `https://github.com/varenyameducation/VarenyamEducation/pull/<N>` if you know the number, otherwise the `pull/new/` URL the previous push printed).
- Run `~/report.sh frontend "<one-line summary>"`.
- **Stop.**

### Hard rules

- Single PR. The existing FE PR gets force-pushed; do not open a new one.
- Do not touch `types/taxonomy.ts` (INT's). Do not touch `app/api/**` (BE's).
- Do not run `--force` without `--with-lease`.
- No Claude attribution in commits.
- If the typecheck reveals an additional FE file that reads the removed `q.course_id`/`q.exam_type` etc. fields and it is not in the list above, FIX it in the same PR — do not leave breakage. Note any genuinely-out-of-FE-scope files in the status entry (none expected — BE has cleaned its own routes already).
