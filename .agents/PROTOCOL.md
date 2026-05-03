# Multi-Agent Coordination Protocol

This project runs 4 Claude agents in a tmux 2x2 grid. **Agents do not talk to each other directly** — they coordinate through files in this `.agents/` directory and through git branches/PRs. The user is the message bus that nudges each pane when its brief is ready.

## Roles

| Pane | Role | Owns |
|---|---|---|
| top-left | **frontend** | `app/`, `components/`, `tailwind.config.ts`, frontend-only `lib/ui/**` |
| top-right | **backend** | `app/api/**`, `lib/api/**`, `lib/db/**`, `prisma/**`, server-only `lib/auth/**` |
| bottom-left | **integration** | `middleware.ts`, `lib/integrations/**`, env wiring, glue between FE and BE, contract tests |
| bottom-right | **orchestrator** | `docs/PRD.md`, `docs/AGENTS.md`, this `.agents/` directory, branch policy, PR review, merge dispatch |

## Identity rule (HARD — applies to every agent)

**Every commit and every push from any agent MUST be authored by `Sneha Chouksey <snehachoukseyobc@gmail.com>`.** No exceptions. The org admin account `Varenyameducation@gmail.com` is used **only** by the human user to merge PRs — agents never commit, push, or open PRs as the admin.

Before your first commit in any session, verify:
```
git config user.name      # → must be "Sneha Chouksey" (or equivalent)
git config user.email     # → must be "snehachoukseyobc@gmail.com"
gh auth status            # → active account must be snehachoukseyobc
```
If either is wrong, fix it before committing. Do not proceed otherwise.

## Commit message rule (HARD)

**No Claude attribution.** Never add `Co-Authored-By: Claude`, `🤖 Generated with Claude Code`, or any other AI footer to commit messages. Author is Sneha; no other credit. If a default template adds a Claude line, remove it before committing.

## Autonomy rule (HARD)

- **Workers (frontend / backend / integration)** run with `claude --dangerously-skip-permissions`. They do not prompt the user. They never message the user. Their entire input/output channel is files in `.agents/` + scripts (`~/dispatch.sh`, `~/report.sh`).
- **Orchestrator** is the only agent that may ask the user. Its job is to translate user intent into briefs, dispatch workers, review PRs, and surface decisions back to the user.
- Workers take direction only from `.agents/<role>.md`. Workers report only to `.agents/status-<role>.md` + a `~/report.sh <role> "<msg>"` nudge to the orchestrator pane.

## Orchestrator dispatch (how the orchestrator delegates)

When orchestrator has finished writing/updating a brief and wants the worker to execute:

```bash
~/dispatch.sh frontend       # nudges pane 0
~/dispatch.sh backend        # nudges pane 1
~/dispatch.sh integration    # nudges pane 2
```

Orchestrator runs these directly via its Bash tool — does not ask the user to run them. Multiple dispatches in parallel are fine; workers operate independently within their scopes.

## Worker report-back

When a worker has pushed its PR and written its status entry, it nudges the orchestrator:

```bash
~/report.sh frontend "v1 login form done — PR #14 open"
~/report.sh backend "blocked: PRD §4.2 ambiguous on token refresh window"
```

That sends a one-line message to the orchestrator pane (bottom-right). The orchestrator then reads `.agents/status-<role>.md` and the PR diff and decides next steps.

## Source of truth

- **`docs/PRD.md`** — the canonical product requirements. Owned by orchestrator. Every brief references PRD section numbers.
- **`docs/AGENTS.md`** — high-level scope per agent + interfaces between them (e.g. API contracts).
- **`.agents/<role>.md`** — current task brief for each worker. Orchestrator writes; workers read and execute.
- **`.agents/status-<role>.md`** — most recent status update from each worker. Workers write; orchestrator reads.

If a fact lives only in chat context, it does not exist. Persist before acting.

## Branch + commit conventions

- One agent → one feature branch at a time. Naming: `<role>/<short-slug>` (e.g. `frontend/login-form`, `backend/auth-routes`, `integration/jwt-middleware`).
- Commit prefix tags scope: `[FE]`, `[BE]`, `[INT]`, `[DOC]` plus optional `(PRD §N.N)`.
- Branch off `main`. Never push to `main` directly.

## Handoff loop

1. **User** briefs orchestrator at a high level (goal, constraints, priorities).
2. **Orchestrator** writes/updates `.agents/<role>.md` with the next concrete task for one or more workers. Commits the brief change.
3. **Orchestrator** runs `~/dispatch.sh <role>` for each worker it wants to start.
4. **Worker** (running with `--dangerously-skip-permissions`) reads `CLAUDE.md` + `PROTOCOL.md` + `docs/PRD.md` + its own `.agents/<role>.md`, creates its branch, does the work, commits (no Claude footer), pushes as `snehachoukseyobc`, opens a PR via `gh pr create`, appends to `.agents/status-<role>.md`, runs `~/report.sh <role> "<one-line summary>"`, and stops.
5. **Orchestrator** receives the report nudge, reads `.agents/status-<role>.md` and the PR diff. If good → tells the user "PR #N ready to merge" (user merges via admin account in GitHub UI). If revisions needed → updates the brief and re-dispatches.

## Status file format

Append (don't overwrite). Keep entries short.

```
## YYYY-MM-DD HH:MM — <branch-name>
- DONE: <one-line summary>
- PR: <url or "pending push">
- BLOCKED ON: <none | what>
- NOTES: <anything orchestrator should see>
```

## Hard rules for workers

- Stay inside your scope (see Roles table). If you need a file outside it, write a status entry asking orchestrator to coordinate — do not edit it.
- Do not merge your own PR.
- Do not write to `docs/PRD.md` or `.agents/<other-role>.md`.
- Do not invent requirements. If PRD is silent, write a status entry flagging it.
- Stop after pushing + writing status. Do not pick up a new task on your own.

## Hard rules for orchestrator

- Never edit feature code directly. Your output is `docs/`, `.agents/`, and PR review comments.
- Before any code work begins, `docs/PRD.md` must exist on disk and be committed.
- One brief at a time per worker. Don't queue work in chat.
- Your own commits (to `docs/` and `.agents/`) also go via `snehachoukseyobc` — the admin account never commits.
