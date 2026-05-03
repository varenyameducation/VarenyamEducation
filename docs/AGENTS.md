# AGENTS — Scope, Interfaces, and Coordination

This document defines the four agents that build Varenyam Phase 1, the boundaries between them, and the contracts they share. It is the orchestrator's reference for who owns what and how cross-cutting work is split.

For workflow rules (handoff loop, branch naming, commit conventions, identity rule), see [`.agents/PROTOCOL.md`](../.agents/PROTOCOL.md).
For the canonical product requirements, see [`docs/PRD.md`](./PRD.md).

---

## Roles & ownership

### Orchestrator (tmux pane bottom-right)
- **Owns:** `docs/PRD.md`, `docs/AGENTS.md`, `.agents/<role>.md`, `.agents/status-<role>.md` (read-only on workers' status entries), branch policy, PR review.
- **Outputs:** task briefs, PR review comments, "merge this" calls to the user.
- **Never:** edits feature code, merges its own PRs.

### Frontend (tmux pane top-left)
- **Owns:** `app/**` (UI pages, layouts, route handlers that render UI only), `components/**`, `tailwind.config.ts`, `postcss.config.js`, `lib/ui/**`.
- **Builds:** UI screens, forms, modals, design system usage. Per PRD §7 module specs.
- **Never:** edits API routes, DB schema, server-side auth, middleware.

### Backend (tmux pane top-right)
- **Owns:** `app/api/**`, `lib/api/**`, `lib/db/**`, `lib/auth/**` (server-side), `prisma/**`.
- **Builds:** REST endpoints (PRD §6), DB schema (PRD §4), business logic, server-side validation, RBAC enforcement (PRD §3.3).
- **Never:** edits UI components, middleware, third-party integrations.

### Integration (tmux pane bottom-left)
- **Owns:** `middleware.ts`, `lib/integrations/**` (Supabase client, Google OAuth, KaTeX wrapper), `types/**` (shared FE/BE types), `.env.example`, contract tests.
- **Builds:** the glue. Shared TS types from PRD schema, API response envelope, Supabase client config, Zod schemas, JWT-Edge middleware (already done — PRD §3.4), email transport for OTP, Excel parser for bulk import (PRD §7.2 import).
- **Never:** edits UI internals, API business logic, DB schema.

---

## Interface contracts (FE ↔ INT ↔ BE)

These are the boundaries each PR must respect. Breaking changes need orchestrator coordination across all three workers.

### 1. API response envelope (PRD §6.1)
All API responses use a single envelope shape. Defined in `types/api.ts` (owned by **integration**).

```ts
type ApiSuccess<T> = { ok: true; data: T };
type ApiError      = { ok: false; error: { code: string; message: string; details?: unknown } };
type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

- **Backend** uses this envelope for every response from `app/api/**`.
- **Frontend** consumes via a typed fetch helper in `lib/ui/api.ts` (frontend-owned).
- **Integration** maintains the envelope type and its Zod runtime validator.

### 2. Domain types (PRD §4)
Canonical domain types live in `types/domain.ts` (integration-owned). Derived from the Postgres schema in PRD §4.

- `Course`, `Chapter`, `Topic`, `User`, `Question`, `Test`, `TestQuestion`, `InstituteBrand`.
- These are **the** shared types — backend re-exports from this file rather than redefining; frontend imports for component props.
- When schema changes (Prisma migration), integration updates these types in the same PR or in an immediate follow-up coordinated by orchestrator.

### 3. Zod schemas
Per-entity Zod schemas live in `lib/integrations/validation/<entity>.ts` (integration-owned).
- **Backend** uses them in route handlers for request validation.
- **Frontend** uses them in `react-hook-form` resolvers.
- They are the single source of truth for "what's a valid X."

### 4. Auth context
JWT verification lives in `middleware.ts` (integration-owned, already shipped — PRD §3.4).
- Authenticated user context is attached to request headers and consumed by both FE (via session API) and BE (via helper in `lib/auth/session.ts` — backend-owned).
- RBAC role checks (PRD §3.3) are backend-owned wrappers.

### 5. Supabase client
- Browser client: `lib/integrations/supabase/client.ts` — used by frontend for direct uploads (PRD §7.2 image upload).
- Server client: `lib/integrations/supabase/server.ts` — used by backend for storage signing URLs.
- Both owned by **integration**.

---

## Cross-agent dependency rules

- A worker may **read** any file in the repo. A worker may only **write** files in their scope.
- If a worker needs a type/util/contract that doesn't exist yet, it writes a **BLOCKED ON** entry in `.agents/status-<role>.md` naming the missing piece. Orchestrator picks it up and either dispatches the right agent or unblocks itself.
- **Frontend can develop UI against mocked data** if the backend endpoint isn't ready, but must use the canonical domain types from `types/domain.ts` so swapping mock → real fetch is mechanical.
- **Backend may add columns/tables** but must not break the shape of existing API endpoints without a coordinated multi-PR change.
- **Integration is the bottleneck** for shared types — its PRs must merge before FE/BE PRs that depend on new types.

---

## Phase 1 build order (orchestrator's sequencing)

1. **Foundation** ✓ done on `v1-foundation` branch (auth scaffold, JWT middleware §3.4, Prisma init, dashboard shell, login UI).
2. **Shared contracts** — integration ships `types/domain.ts`, `types/api.ts`, Zod skeletons, Supabase client setup.
3. **Taxonomy** — backend ships schema + APIs (PRD §4.1, §6.2); frontend ships Taxonomy Manager UI (PRD §7.1) against mocks first then real APIs.
4. **Question Bank** — backend ships schema + APIs (PRD §4.3, §6.3); frontend ships Question Form + List + Detail (PRD §7.2); integration ships Excel importer.
5. **Test Paper Generator** — backend ships schema + APIs (PRD §4.4, §6.4); frontend ships builder UI (PRD §7.3); integration ships PDF/DOCX export pipeline.
6. **Acceptance pass** — orchestrator drives each module against PRD §10 acceptance criteria before declaring Phase 1 done.

The first round of dispatched tasks (current `.agents/<role>.md` briefs) covers steps 2 and 3 — kicked off in parallel.
