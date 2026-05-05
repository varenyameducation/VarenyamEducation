# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Scope

- `middleware.ts`, `lib/integrations/**`, `types/**`, `.env.example`, contract tests.
- Out of scope: `app/**`, `components/**`, `lib/ui/**`, `app/api/**`, `lib/api/**`, `lib/db/**`, `prisma/**`, `docs/**`, `.agents/**`.

## Current task — Shared types, API envelope, Zod skeletons

**PRD references:** §4 (Database Schema), §6.1 (Response Envelope), §3.2 (JWT Token Specification), §3.3 (RBAC).

**Branch:** `integration/shared-types-and-api-envelope`

**Acceptance criteria:**
- [ ] `types/api.ts` exports `ApiResponse<T>`, `ApiSuccess<T>`, `ApiError` matching PRD §6.1 exactly. Plus an `ok(data)` and `fail(code, message, details?)` helper for backend convenience.
- [ ] `types/domain.ts` exports interfaces for `Course`, `Chapter`, `Topic`, `User`, `Question`, `Test`, `TestQuestion`, `InstituteBrand` derived from PRD §4 (one TS interface per table, every column typed). UUIDs as `string` (branded type `Uuid` optional). Timestamps as `string` (ISO).
- [ ] `types/auth.ts` exports `JwtPayload` (per PRD §3.2: `sub`, `email`, `role`, `name`, `iat`, `exp`, `iss`, `aud`) and `Role` union (`'super_admin' | 'admin' | 'teacher'` per PRD §3.3).
- [ ] `lib/integrations/validation/taxonomy.ts` — Zod schemas for create/update Course, Chapter, Topic. Field constraints from PRD §4.1 (e.g. `grade` is integer 5–12; `stream` enum; `subject` enum on Chapter).
- [ ] `lib/integrations/validation/common.ts` — reusable Zod helpers (`uuidSchema`, `paginationSchema` with `page`/`limit` per PRD §6.3).
- [ ] `lib/integrations/supabase/client.ts` and `lib/integrations/supabase/server.ts` — minimal client factories using env vars from `.env.example`. No business logic here, just client construction.
- [ ] No UI components. No API route handlers. No DB schema changes.

**Workflow:**
1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, `docs/PRD.md` (§3.2, §3.3, §4, §6.1, §6.3), `docs/AGENTS.md` (interface contracts section).
2. `git checkout main && git pull && git checkout -b integration/shared-types-and-api-envelope`
3. Implement. Type-check passes. No new runtime deps unless absolutely necessary; if added, update `package.json` and note it in status.
4. Commit with `[INT]` prefix (e.g. `[INT] Add shared API envelope + ok/fail helpers (PRD §6.1)`, `[INT] Add domain types (PRD §4)`, `[INT] Add Zod schemas for taxonomy (PRD §4.1)`). **No `Co-Authored-By: Claude` footer. No robot emoji line.**
5. Push. Note: `gh` CLI not installed — record the push output URL in status for orchestrator.
6. Append entry to `.agents/status-integration.md` with branch name, files added, push URL.
7. Run `~/report.sh integration "<short summary>"` to nudge orchestrator.
8. **Stop.**

**Note:** This PR is the unblocker for both backend and frontend. Backend's brief will reference imports from `types/api.ts` and `types/domain.ts`; frontend's brief will too. Get this in fast.
