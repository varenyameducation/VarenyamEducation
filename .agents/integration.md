# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Subject-tier types + chain Zod refinement

**Why:** The taxonomy is moving from a 3-tier model (Course → Chapter → Topic, with `subject` as a string column on Chapter) to a **strict 4-tier hierarchy**: **Course → Subject → Chapter → Topic**. Subject becomes a proper entity. You own the type contract and the Zod refinement that keeps the hierarchy consistent.

**Branch:** `integration/subject-tier`

**Base off:** `main`.

### Track 1 — Domain types

- [ ] `types/taxonomy.ts` — extend `TaxonomyTag` and `TaxonomyTagRow` with `subject_id`:

  ```ts
  export interface TaxonomyTag {
    course_id: string
    subject_id?: string | null   // NEW — optional, but enforced by chain refinement
    chapter_id?: string | null
    topic_id?: string | null
    exam_type: ExamType
  }

  export interface TaxonomyTagRow extends TaxonomyTag {
    id: string
    created_at: string
    course_name?: string
    subject_name?: string | null     // NEW
    chapter_name?: string | null
    topic_name?: string | null
    subject?: 'Physics' | 'Chemistry' | 'Maths' | 'Biology' | string
    // ^ existing `subject` field is a free-text echo of Subject.name; keep
    // the optional string union so BE-populated tags survive the migration.
  }
  ```

- [ ] `types/domain.ts` (or wherever Course/Chapter/Topic interfaces live) — add a `Subject` interface:

  ```ts
  export interface Subject {
    id: string
    course_id: string
    name: string                       // free-text (e.g. 'Maths', 'Computer Science')
    created_by: string | null
    created_at: string
    updated_at: string
    deleted_at: string | null
  }
  ```

  If `Chapter` is also typed here, update it: `subject_id: string` replaces `course_id: string` + `subject: string`. The relationship Chapter→Subject→Course is enforced downstream.

### Track 2 — Zod refinement (chain enforcement)

- [ ] `lib/integrations/validation/taxonomy-tag.ts` — `taxonomyTagSchema` gets a NEW refinement:
  - if `topic_id` is set, `chapter_id` MUST be set (existing rule)
  - if `chapter_id` is set, `subject_id` MUST be set (NEW)
  - if `subject_id` is set, `course_id` MUST be set (already true since `course_id` is required)

  Refinement message should be clear, e.g. `"chapter_id requires subject_id (Course → Subject → Chapter → Topic hierarchy)"`. Keep `.strict()` — names are output-only.

- [ ] Add a Zod schema for Subject create / update under `lib/integrations/validation/subject.ts` (or extend an existing taxonomy.ts):

  ```ts
  export const subjectCreateSchema = z.object({
    course_id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
  }).strict()

  export const subjectUpdateSchema = z.object({
    name: z.string().trim().min(1).max(80),
  }).strict()
  ```

### Track 3 — Seed script

- [ ] `scripts/seed-taxonomy.mjs` — update so the CBSE / ICSE Class-8 seeds now create a `Maths` Subject under each course before creating chapters. Each chapter row gets a `subject_id`. Topic creation is unchanged. Print all four ids per row (course / subject / chapter / topic) for orchestrator paste-into-UI.

### What you do NOT touch

- `prisma/schema.prisma`, `prisma/migrations/**` (BE's).
- `app/api/**` (BE's).
- `app/(dashboard)/**`, `components/**`, `lib/ui/**` (FE's).

### Validation

- [ ] `npx tsc --noEmit` clean in integration scope.
- [ ] Lint clean (existing zod patterns).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, and this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/subject-tier`
3. Make changes. One or two commits.
4. Commit with `[INT]` prefix. **No Claude attribution.**
5. Push. Print the `pull/new/` URL. If credential-manager refuses from `/mnt/d/varenyam-int`, commit locally and note in status — orchestrator will push from `/mnt/d/varenyam`.
6. Append entry to `.agents/status-integration.md` with branch, commit list, PR URL, and a "Contract change" block listing the new `subject_id` field + chain rules so BE and FE know.
7. **Stop.** (Skip `~/report.sh` — pane 3 ≠ orchestrator in this layout; the status file is the source of truth.)

### Hard rules

- One PR. Do not bundle.
- Do not touch `Question.subject` — it stays a free-floating string column on Question (different purpose from the per-tag hierarchy).
- The `TaxonomyTag` input schema is strict on unknown fields. Names are output-only.
