# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Scope

- `app/api/**`, `lib/api/**`, `lib/db/**`, `lib/auth/**`, `prisma/**`.
- Out of scope: `app/**` outside `app/api`, `components/**`, `lib/ui/**`, `middleware.ts`, `lib/integrations/**`, `types/**`, `docs/**`, `.agents/**`.

## Current task — Taxonomy schema + CRUD APIs

**PRD references:** §4.1 (Core Taxonomy Tables), §6.2 (Taxonomy Endpoints), §7.1 (Module spec), §10.2 (Acceptance criteria), §3.3 (RBAC roles).

**Branch:** `backend/taxonomy-schema-and-api`

**Acceptance criteria:**
- [ ] Prisma schema models for `Course`, `Chapter`, `Topic` matching PRD §4.1 exactly (UUID PKs, soft-delete `deleted_at`, `created_by` FK to users, ordering columns `chapter_no` / `topic_no`, indexes on `course_id` / `chapter_id`).
- [ ] Migration generated and committed (do NOT run against a real DB — just `prisma migrate dev --create-only` so the migration file lands).
- [ ] All 12 endpoints from PRD §6.2 implemented under `app/api/taxonomy/courses`, `app/api/taxonomy/chapters`, `app/api/taxonomy/topics`. List endpoints (GET) accessible to any authenticated user; mutations gated to `admin` / `super_admin`; DELETE gated to `super_admin` only per PRD §6.2 auth column.
- [ ] All endpoints return the response envelope from `types/api.ts` (depend on `integration/shared-types-and-api-envelope` PR — if not yet merged, define a local `ApiResponse<T>` matching PRD §6.1 inline and add a `// TODO: replace with import from types/api.ts once #N merges` comment).
- [ ] Soft-delete cascades implemented per PRD §7.1 business rules: deleting a Course cascades to Chapters + Topics; deleting a Chapter cascades to Topics. Cascading is at the application level (set `deleted_at`) — do NOT use Prisma `onDelete: Cascade` since these are soft deletes.
- [ ] Topic deletion blocked when questions reference it (PRD §7.1: "If a Topic has questions attached, it cannot be deleted — must be archived instead"). Return `ApiError` with code `TOPIC_HAS_QUESTIONS`.
- [ ] Request bodies validated with Zod (use schemas from `lib/integrations/validation/taxonomy.ts` if available; otherwise define inline and flag as a follow-up).
- [ ] No UI work. No middleware edits.

**Workflow:**
1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, `docs/PRD.md` (§3.3, §4.1, §6.1, §6.2, §7.1, §10.2), `docs/AGENTS.md`.
2. `git checkout main && git pull && git checkout -b backend/taxonomy-schema-and-api`
3. Implement. Run `npx prisma generate` + typecheck.
4. Commit with `[BE]` prefix per file group (e.g. `[BE] Add taxonomy Prisma schema (PRD §4.1)`, `[BE] Add taxonomy CRUD endpoints (PRD §6.2)`). **No `Co-Authored-By: Claude` footer. No robot emoji line.**
5. Push. Since `gh` CLI is not installed, the push will print a GitHub URL with `pull/new`; copy it into the PR body via the printed link or note the branch URL.
6. Append entry to `.agents/status-backend.md` with branch name, commit SHAs, and PR URL (or "PR pending — gh not installed, push URL: ...").
7. Run `~/report.sh backend "<short summary>"` to nudge orchestrator.
8. **Stop.**
