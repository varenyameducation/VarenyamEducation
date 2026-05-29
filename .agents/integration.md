# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Schema migration for solution + explanation image uploads

We're starting a 3-PR sprint that adds per-question image upload for **solution** and **explanation** fields (the current question-body uploader pattern, but extended to those fields, with an additional "Extract LaTeX from image" action). You own the schema + validation foundation that BE + FE will build on.

This brief is INT-only — BE and FE briefs will follow after you push.

### What to change

**1. Prisma migration** — add two new array columns to the `Question` model.

Edit `prisma/schema.prisma`. The `Question` model has these existing image-adjacent fields:
- `image_urls    String[]`   (question-body images — already wired throughout)
- `solution      String?`    (text-only solution)
- `explanation   String?`    (text-only explanation)

Add two new fields **immediately after `image_urls`** to keep the file diff clean:

```prisma
solution_image_urls     String[]
explanation_image_urls  String[]
```

Don't add defaults — Postgres arrays default to `{}` (empty array) which is what we want, and Prisma maps `String[]` to `text[] NOT NULL DEFAULT '{}'`. Existing rows get empty arrays automatically.

**2. Generate the migration SQL.**

```
npx prisma migrate dev --name add_solution_and_explanation_image_urls --create-only
```

The `--create-only` flag writes the migration file without applying it (so it goes through the standard `migrate deploy` path on Vercel — same pattern as the rest of the repo). Review the generated SQL — it should be roughly:

```sql
ALTER TABLE "questions"
  ADD COLUMN "solution_image_urls" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "explanation_image_urls" TEXT[] NOT NULL DEFAULT '{}';
```

If Prisma generates anything beyond that (`DROP DEFAULT`, additional ALTERs, schema-drift cleanup), **stop and write a status entry** — orchestrator needs to see it before it lands.

**3. Update Zod schemas** in `lib/validation/question.ts`.

Find the schemas that already validate `image_urls` (search for `image_urls:`). Add matching definitions for both new fields wherever `image_urls` is defined:

```ts
image_urls: z.array(z.string()).optional(),
solution_image_urls: z.array(z.string()).optional(),
explanation_image_urls: z.array(z.string()).optional(),
```

This applies to:
- The **form-level** schema (what the FE submits)
- The **server-create** schema (what the BE API validates on POST)
- The **server-update** schema (what the BE API validates on PATCH)
- The **defaults** object if there's one (set both new fields to `[]`)

Match the existing optional/required pattern for `image_urls` exactly. If `image_urls` is `.default([])` somewhere, the new fields should be too. If it's `.optional()`, match that.

**4. Update wire types** — if `types/domain.ts` or `lib/ui/api.ts` re-export a `Question` type that lists fields, add both new arrays there too. Search:

```bash
grep -rn "image_urls" types/ lib/ui/api.ts lib/api/ 2>/dev/null
```

Add the new field declarations beside each `image_urls` occurrence so BE + FE both see them through the shared types.

### Out of scope (don't touch — that's BE's lane next)

- `app/api/questions/route.ts` POST handler
- `app/api/questions/[id]/route.ts` PATCH handler
- Any new `POST /api/questions/upload-image` or `extract-latex-from-image` endpoints
- The image-upload component / question form / dashboard rendering

If something feels like it belongs in this PR but is in BE's lane, **don't do it** — write a status note flagging it for the next brief.

### Validation

- [ ] `npx prisma generate` clean.
- [ ] `npx prisma migrate dev --name ... --create-only` produces ONLY the two `ADD COLUMN` statements. No drift, no unexpected ALTERs.
- [ ] `npx tsc --noEmit` exits 0 (Prisma client regen should make the new fields type-available).
- [ ] Migration file committed to `prisma/migrations/`.
- [ ] Grep verify the new field names appear in: `prisma/schema.prisma`, the new migration SQL, `lib/validation/question.ts` (multiple places), and wherever `image_urls` appears in `types/` or `lib/ui/api.ts`.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/solution-and-explanation-image-urls`
3. Edit `prisma/schema.prisma` → add 2 fields. Run `npx prisma migrate dev --name add_solution_and_explanation_image_urls --create-only`. Inspect the generated SQL.
4. Edit `lib/validation/question.ts` → add both fields beside every `image_urls:` definition.
5. Edit any `types/`/`lib/ui/api.ts` shared types that list `image_urls`.
6. **Single commit.** Message: `[INT] Schema: add solution_image_urls + explanation_image_urls to Question (migration + zod + shared types)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-30T03:00:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-30T03:00:00+05:30'`.
7. Push: `git push -u origin integration/solution-and-explanation-image-urls`. If credentials block, write `BLOCKED ON: push needs orchestrator` and stop.
8. Append a short entry to `.agents/status-integration.md`. Run `~/report.sh integration "solution+explanation image_urls schema PR ready"`.
9. **Stop.**

### Hard rules

- One commit, one PR.
- `npx prisma migrate dev --create-only` — do NOT apply locally without `--create-only` (we don't want migrations applied to dev DB without orchestrator review).
- If the generated migration SQL contains anything beyond the two `ADD COLUMN`s, STOP and write a status entry showing the SQL. Don't ship surprise schema drift.
- Don't touch any route, component, page, or `lib/export/**`.
- No Claude attribution.
- Keep both new fields' nullability + defaults identical to the existing `image_urls` pattern — consistency matters for the BE/FE work that follows.
