# Frontend status log

_Append-only. Most recent entry on top. Format defined in `PROTOCOL.md`._

## 2026-05-03 21:00 — frontend/taxonomy-ui
- DONE: Taxonomy Manager UI shells (PRD §7.1) — Home (course card grid), Course Detail (chapter list w/ kebab), Chapter Detail (topic list w/ @dnd-kit drag-to-reorder). Add Course / Add Chapter / Add Topic modals via react-hook-form + zod (form values typed as primitive strings to keep RHF resolver happy; parsed and shaped before bubbling). Mock data in `lib/ui/mocks/taxonomy.ts` (3 courses, 8 chapters, 21 topics). Sidebar already had the Taxonomy link from the earlier dashboard PR — no edit needed.
- New UI primitives added: `components/ui/{dialog,select,textarea,badge}.tsx`. New deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- Type-check: `node node_modules/typescript/bin/tsc --noEmit` → exit 0 (no errors anywhere in the worktree).
- Lint: `next lint` blew up before reaching my code with `Configuring Next.js via 'next.config.ts' is not supported` — pre-existing config issue (Next 14 expects `.js`/`.mjs`; the parent repo already has a `.mjs` migration in flight per `git status` upstream). Not in frontend scope; flagging for integration.
- PR: branch pushed to `origin/frontend/taxonomy-ui` (3 commits: UI primitives + dnd-kit, mocks + modals, routes). PR not opened from worker — orchestrator to open via `gh pr create`.
- BLOCKED ON: none for this task.
- NOTES: Mock types live next to the mocks (`CourseUI / ChapterUI / TopicUI`) with a TODO to switch to `types/domain.ts` once `integration/taxonomy-types` lands. Topic reorder is local state only; we'll wire it to PATCH `/api/taxonomy/topics/reorder` once backend exposes it.
