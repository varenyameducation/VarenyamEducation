# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Scope

- `app/**` (UI pages, layouts, NOT `app/api/**`), `components/**`, `tailwind.config.ts`, `postcss.config.js`, `lib/ui/**`.
- Out of scope: `app/api/**`, `lib/api/**`, `lib/db/**`, `lib/auth/**`, `prisma/**`, `middleware.ts`, `lib/integrations/**`, `types/**`, `docs/**`, `.agents/**`.

## Current task — Taxonomy Manager UI shells (against mocks)

**PRD references:** §7.1 (Module: Course / Chapter / Topic Taxonomy Manager), §10.2 (Acceptance criteria).

**Branch:** `frontend/taxonomy-manager-ui`

**Acceptance criteria:**
- [ ] Route `app/(dashboard)/taxonomy/page.tsx` — Taxonomy Home: card grid of all Courses, each card shows name, grade badge, stream badge, chapter count. Empty state: "No courses yet — add your first one."
- [ ] Route `app/(dashboard)/taxonomy/[courseId]/page.tsx` — Course Detail: list of Chapters with subject badge and topic count per chapter. Back link to Taxonomy Home.
- [ ] Route `app/(dashboard)/taxonomy/[courseId]/[chapterId]/page.tsx` — Chapter Detail: list of Topics. Drag-to-reorder UI (use `@dnd-kit/sortable` or `react-sortablejs` — your call, but document in commit). Reorder is local state only for this PR — no API call yet.
- [ ] Add/Edit modals for Course, Chapter, Topic — inline, no page navigation. Use shadcn `Dialog`. Forms use `react-hook-form`. Validation message per field.
- [ ] All data is **mock** for this PR — define a `lib/ui/mocks/taxonomy.ts` with realistic seed data (3 courses across PCM/PCB/JEE, 2–3 chapters each, 2–3 topics each). Type the mocks against the canonical domain types (`import type { Course, Chapter, Topic } from '@/types/domain'`). If `types/domain.ts` doesn't exist yet because integration's PR hasn't merged, define a minimal local stub `types/domain.local.ts` and add a `// TODO: replace with import from types/domain.ts` — the swap should be a one-line change.
- [ ] Add a "Taxonomy" link in the existing dashboard sidebar.
- [ ] No API calls in this PR. No fetch helpers yet. The wiring to real backend endpoints is a follow-up brief once both this and `backend/taxonomy-schema-and-api` merge.
- [ ] Type-check passes. Lint passes. The dev server (`npm run dev`) loads each route without console errors.

**Workflow:**
1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, `docs/PRD.md` (§7.1, §10.2), `docs/AGENTS.md`.
2. `git checkout main && git pull && git checkout -b frontend/taxonomy-manager-ui`
3. Implement. Run `npm run dev` and click through every route + modal at least once. Fix any console errors.
4. Commit with `[FE]` prefix (e.g. `[FE] Add Taxonomy Home page with course grid (PRD §7.1)`, `[FE] Add Course Detail + Chapter Detail pages`, `[FE] Add Course/Chapter/Topic modals`). **No `Co-Authored-By: Claude` footer. No robot emoji line.**
5. Push. Note: `gh` CLI not installed — record the push output URL in status.
6. Append entry to `.agents/status-frontend.md` with branch name, files added, push URL, and screenshots if you take any.
7. Run `~/report.sh frontend "<short summary>"` to nudge orchestrator.
8. **Stop.**
