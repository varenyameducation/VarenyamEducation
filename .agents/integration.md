# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Allow Next.js App Router icon routes through middleware

FE just shipped `app/icon.png` and `app/apple-icon.png` (Varenyam favicon, PR `frontend/varenyam-favicon-palette`). Next.js auto-routes those at `/icon.png` and `/apple-icon.png`, but our auth middleware matcher only excludes `favicon.ico` — so unauthenticated requests for the new icons get a 307 redirect to `/login`, which means the favicon doesn't render on the login tab itself (the most visible place a brand mark should appear).

### What to change — exactly

**File:** `middleware.ts` (line 32)

**Current matcher:**
```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)']
```

**New matcher:**
```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/health).*)']
```

Just adds `icon.png|apple-icon.png` to the existing negative lookahead so requests for those two paths skip the middleware entirely. No JWT check, no redirect, served by Next as static assets.

That is the only change in this PR. Do NOT touch `PUBLIC_ROUTES`, the JWT logic, or any other file.

### Why this is INT, not FE

`middleware.ts` is INT-owned per `PROTOCOL.md` (Roles table). FE flagged it in their status entry and deliberately did not edit it.

### Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run dev` (port 4000) boots clean.
- [ ] `curl -sI http://localhost:4000/icon.png` returns **200**, NOT 307. (Run before and after the change to confirm the fix actually flips it.)
- [ ] `curl -sI http://localhost:4000/apple-icon.png` returns 200.
- [ ] `curl -sI http://localhost:4000/` (no cookie) still returns 307 to `/login` — sanity check that auth gating still works for non-icon paths.
- [ ] `curl -sI http://localhost:4000/api/health` still returns 200 — confirming the existing exclusion still works (regression-check on the matcher).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/middleware-allow-app-icons`
3. Edit `middleware.ts` line 32 — add `icon.png|apple-icon.png` to the matcher's negative lookahead.
4. Verify with the four curl checks above.
5. **Single commit.** Message: `[INT] middleware: exclude /icon.png + /apple-icon.png from auth matcher`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T00:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T00:30:00+05:30'`.
6. Push: `git push -u origin integration/middleware-allow-app-icons`. If credentials block, write `BLOCKED ON: push needs orchestrator` and stop.
7. If `gh` is available, `gh pr create` against `main`. Title: `[INT] middleware: exclude /icon.png + /apple-icon.png from auth matcher`. Body: short — paste the matcher diff + the curl-200 evidence. If `gh` is not available, leave PR creation to orchestrator (write `BLOCKED ON: gh not installed, orchestrator to open PR` and continue with status entry).
8. Append a short entry to `.agents/status-integration.md`. Run `~/report.sh integration "middleware icon matcher PR ready"`.
9. **Stop.**

### Hard rules

- One commit, one PR. One file changed.
- Do not change `PUBLIC_ROUTES`, the JWT verification, header injection, or anything else in `middleware.ts`.
- Do not touch `.tsx`, components, or styles. This is purely the middleware matcher regex.
- No Claude attribution.
- If the curl-200 check fails after your change, do NOT push. Investigate (cache? wrong syntax in the lookahead? matcher needs the path to start with `/`?). Write a status entry and stop.
