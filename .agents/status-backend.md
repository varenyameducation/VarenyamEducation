# Backend status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

## 2026-05-03 20:51 — backend/taxonomy-api
- DONE: Implemented PRD §6.2 — all 12 taxonomy endpoints (Courses, Chapters, Topics × GET/POST/PUT/DELETE) under `app/api/taxonomy/**`. Added shared helpers in `lib/api/taxonomy.ts` (requireAuth + role gating, parseJsonBody, listEnvelope). Soft-delete cascades for Course→Chapters→Topics and Chapter→Topics done in a single `prisma.$transaction`. Topic DELETE returns 409 `TOPIC_HAS_QUESTIONS` when any non-deleted question references the topic (PRD §7.1). Lists return `{items, page, limit, total}` envelope per §6.3. Audit log written on every mutation. Inline Zod schemas with `// TODO: replace with import once integration/taxonomy-types merges`.
- PR: pending (branch pushed to `origin/backend/taxonomy-api`; orchestrator to open PR — `gh` CLI not available in worker shell, push had to be issued from `/mnt/d/varenyam` because credential-manager.exe chokes on the worktree gitdir indirection)
- BLOCKED ON: none
- NOTES: `npx prisma generate` + `npx tsc --noEmit` both clean. JWT `sub` is `supabase_uid`, so `requireAuth` looks up the `User` row via `prisma.user.findUnique({ where: { supabase_uid: payload.sub } })` and exposes `user.id` to handlers for `created_by` / audit. Branch is 4 commits ahead of `main`: helpers, courses, chapters, topics — each tagged `[BE]` and (PRD §6.2). No Claude attribution on any commit.
