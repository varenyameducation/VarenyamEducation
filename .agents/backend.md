# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Populate joined-name fields on taxonomy responses

**Why:** PRs #22 (INT shared types) and #23 (BE m2m API) shipped `taxonomies: TaxonomyTagRow[]` on `/api/questions` responses with ID-only rows. The FE PR (`frontend/multitax-blueprint-paper`, currently in conflict with main) needs human-readable chip labels and cannot afford an extra round-trip to fetch the course/chapter/topic tree on every question render. INT is extending `TaxonomyTagRow` with optional name fields on branch `integration/joined-names-on-tag-row`; **your job is to populate those fields from the Prisma `include`**.

**Branch:** `backend/joined-names-on-tag-row`

**Base off:** `integration/joined-names-on-tag-row` (so your code typechecks against the new interface). Rebase to `main` if INT has merged by the time you start.

### Schema check

- No Prisma changes. The `QuestionTaxonomy` model already has FK relations to `Course`, `Chapter?`, `Topic?`. You just need to `select` their names.

### Changes — `/api/questions/route.ts`

- [ ] Extend `taxonomySelect`:

  ```ts
  const taxonomySelect = {
    id: true,
    course_id: true,
    chapter_id: true,
    topic_id: true,
    exam_type: true,
    created_at: true,
    course:  { select: { id: true, name: true } },
    chapter: { select: { id: true, name: true, subject: true } },
    topic:   { select: { id: true, name: true } },
  } as const
  ```

- [ ] Update `TaxonomyRow` (the local type) to reflect the new shape so TS stays happy.

- [ ] Update `withTaxonomies()` to flatten the nested includes into the row:

  ```ts
  function withTaxonomies<T extends { question_taxonomies: TaxonomyRow[] }>(question: T) {
    const { question_taxonomies, ...rest } = question
    return {
      ...rest,
      taxonomies: question_taxonomies.map((t) => ({
        id: t.id,
        course_id: t.course_id,
        chapter_id: t.chapter_id,
        topic_id: t.topic_id,
        exam_type: t.exam_type,
        created_at: t.created_at,
        course_name: t.course?.name,
        chapter_name: t.chapter?.name ?? null,
        topic_name: t.topic?.name ?? null,
        subject: t.chapter?.subject as 'Physics' | 'Chemistry' | 'Maths' | 'Biology' | undefined,
      })),
    }
  }
  ```

  The shape returned now matches the extended `TaxonomyTagRow` from `@/types/taxonomy`. Keep the field names exactly aligned with INT's interface.

### Changes — `/api/questions/[id]/route.ts` (PATCH + GET if applicable)

- [ ] Apply the same `taxonomySelect` + `withTaxonomies()` updates. If `withTaxonomies` is duplicated, factor it into `lib/api/questions.ts` and re-import from both routes. If it's already imported, just update the one definition.

### Changes — `/api/questions/[id]/taxonomies/route.ts` (POST add tag)

- [ ] After insert, the route returns the new tag. Update its response to include the joined names by re-querying or by passing the include into the Prisma create.

### Changes — `/api/questions/bulk/retag/route.ts`

- [ ] If this route returns updated tags, include names. If it returns only counts (`{ added, removed }`), leave it alone.

### Changes — `/api/questions/[id]/taxonomies/[taxonomyId]/route.ts` (DELETE)

- [ ] Probably returns `{ ok: true }` — no shape change. Skim and confirm.

### What you do NOT change

- `types/taxonomy.ts` is INT's. Do not edit.
- The Zod input schema (`lib/integrations/validation/taxonomy-tag.ts`) is INT's; it must still reject the new name fields on input (server populates them on output only).
- FE files (`lib/ui/**`, `components/**`, `app/(dashboard)/**`).

### Validation

- [ ] `npx prisma generate` clean.
- [ ] `npx tsc --noEmit` clean (your worktree may not have INT's branch checked out yet — if you typecheck against current main and the new field references are flagged as unknown on `TaxonomyTagRow`, that's expected; rebase onto `integration/joined-names-on-tag-row` first or wait for it to merge).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. Check if INT's `integration/joined-names-on-tag-row` has merged to main:
   ```
   git fetch origin
   git log origin/main --oneline -5 | grep -i "joined-names" || echo "INT not merged yet — base off integration/joined-names-on-tag-row"
   ```
   - If merged: `git checkout main && git pull && git checkout -b backend/joined-names-on-tag-row`
   - If not: `git checkout origin/integration/joined-names-on-tag-row -b backend/joined-names-on-tag-row` (you will rebase to main once INT lands)
3. Make changes. One commit per route file or one combined commit — your call. Use `[BE]` prefix and no Claude footer.
4. Push. Print the `pull/new/` URL.
5. Append entry to `.agents/status-backend.md` with branch, commit list, PR URL.
6. Run `~/report.sh backend "<short summary>"`.
7. **Stop.**

### Hard rules

- Do not touch `prisma/schema.prisma`. No new migration.
- Do not edit `types/taxonomy.ts`. That is INT's.
- Do not touch FE files.
- The wire shape returned from `/api/questions` MUST be a superset of what shipped in #23 (additive only). No fields removed.
