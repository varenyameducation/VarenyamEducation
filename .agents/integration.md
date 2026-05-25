# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Add joined-name fields to TaxonomyTagRow

**Why:** The M2M sprint shipped `TaxonomyTagRow` as ID-only — `{ id, course_id, chapter_id?, topic_id?, exam_type, created_at }`. The FE PR (#frontend/multitax-blueprint-paper, currently in conflict) needs to render human-readable chip labels like *"Class 8 — CBSE / Algebra Play / Number Pyramids · jee"*, but the wire shape exposes no names. To unblock FE without forcing it to do an extra round-trip for the courses/chapters/topics tree, the API will start including denormalized name fields on each tag. **You own the type contract for those new fields.**

**Branch:** `integration/joined-names-on-tag-row`

**Base off:** `main` (after PRs #22/#23 merged — confirm `git log origin/main --oneline -3` shows the BE m2m merge before branching).

### Track 1 — Extend `TaxonomyTagRow`

- [ ] `types/taxonomy.ts` — add optional joined-name fields to `TaxonomyTagRow` (and **only** `TaxonomyTagRow`; `TaxonomyTag` stays input-only and unchanged):

  ```ts
  export interface TaxonomyTagRow extends TaxonomyTag {
    id: string
    created_at: string
    // Joined names — populated by GET / POST / PATCH /api/questions responses
    // so the FE can render chip labels without a separate fetch. All optional
    // because (a) the FE bulk-retag flow constructs Row-shaped objects locally
    // before the round-trip, and (b) chapter/topic are themselves optional.
    course_name?: string
    chapter_name?: string | null
    topic_name?: string | null
    subject?: 'Physics' | 'Chemistry' | 'Maths' | 'Biology'
  }
  ```

  `subject` here is the chapter's `subject` column (Chapters carry subject in the schema). It's added on `TaxonomyTagRow` so the FE can chip-label "Maths / Algebra Play" without crossing back to the Question. Keep it optional so callers that don't have a chapter (course-level-only tag) can omit it.

### Track 2 — Zod validator (input side)

- [ ] `lib/integrations/validation/taxonomy-tag.ts` — DO NOT add the new name fields to the input `TaxonomyTag` Zod schema. They are output-only (server populates, client reads). The existing `taxonomyTagSchema` should continue to reject unknown fields via `.strict()` so a confused FE doesn't try to POST `course_name` and have it silently ignored. If the existing schema is `.passthrough()` or default-open, switch it to `.strict()` in the same commit and add a 1-line comment explaining why.

### Track 3 — Sanity: no other type updates

- The `withTaxonomies()` helper that flattens `question_taxonomies` → `taxonomies` lives in BE (`app/api/questions/route.ts`). You do **not** touch it — BE will update it on its own follow-up branch (`backend/joined-names-on-tag-row`) to populate the new fields.
- Do not touch `lib/ui/**` — FE owns that. Your contract change is announced in the status entry so FE knows what to consume.
- The `InventoryCounts`, `BlueprintSection`, `TestGenerateInput` interfaces stay as-is. Only `TaxonomyTagRow` changes this sprint.

### Validation

- [ ] `npx tsc --noEmit` clean from your worktree (`/mnt/d/varenyam-int` if available, else from wherever you check out).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/joined-names-on-tag-row`
3. Make the type + Zod changes. Single commit is fine, or split if you prefer.
4. Commit with `[INT]` prefix (e.g. `[INT] Add joined-name fields to TaxonomyTagRow`). **No `Co-Authored-By: Claude`, no AI footer.**
5. Push. Print the `pull/new/` URL for orchestrator/admin to open via web (no `gh` CLI on this machine).
6. Append entry to `.agents/status-integration.md`: branch, commit list, PR URL, and a "Contract change" block listing the new fields so BE+FE know what's available.
7. Run `~/report.sh integration "<short summary>"` — note the pane mapping in this layout (integration is in pane 3, not pane 2). If the helper fails with `can't find pane: 3`, ignore — the status file is the source of truth and the orchestrator will read it.
8. **Stop.**

### Hard rules

- One PR for this task. Do not bundle unrelated cleanups.
- Do not touch `app/api/**` or `lib/ui/**` or `prisma/**`.
- Do not modify `TaxonomyTag` (the input type). It stays exactly as it shipped in #22.
