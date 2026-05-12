# Varenyam — multi-agent project

This repo is worked on by 4 Claude agents in a tmux 2x2 grid: **frontend**, **backend**, **integration**, **orchestrator**. They coordinate via files in `.agents/`, not via direct chat.

**Read `.agents/PROTOCOL.md` before doing anything.** It defines roles, scope boundaries, branch naming, commit conventions, and the handoff loop.

## Identity rule (HARD)

Every commit and push from any agent MUST be authored by **`Sneha Chouksey <snehachoukseyobc@gmail.com>`**. The org admin account `Varenyameducation@gmail.com` is used **only** by the human user to merge PRs — agents never commit/push/open PRs as the admin.

Verify before your first commit in any session:
```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

## Commit message rule (HARD)

**No Claude attribution. Ever.** Commits must NOT include `Co-Authored-By: Claude`, `🤖 Generated with Claude`, or any other AI/Claude footer. Commit messages are plain — author is Sneha and that is the only credit. If your default commit template adds a Claude line, strip it.

## Autonomy rule (HARD)

- **Orchestrator** is the only agent that asks the human user for input/approval.
- **Frontend / Backend / Integration workers** run with `--dangerously-skip-permissions` — they do not prompt the user. They take instructions only from the orchestrator (via `.agents/<role>.md` briefs and dispatch nudges) and report back only to the orchestrator (via `.agents/status-<role>.md` and `~/report.sh`).
- Workers must never DM the user. If a worker is stuck, it writes a `BLOCKED ON:` entry to its status file and runs `~/report.sh <role> "blocked: <reason>"` to nudge the orchestrator.

## Repo

- Origin: https://github.com/varenyameducation/VarenyamEducation
- Default branch: `main`
- Feature branches: `<role>/<slug>` (e.g. `frontend/login-form`)

## Source of truth

- `docs/PRD.md` — canonical PRD (orchestrator owns)
- `docs/AGENTS.md` — agent scope + interfaces (orchestrator owns)
- `.agents/<role>.md` — current task brief (orchestrator writes, worker reads)
- `.agents/status-<role>.md` — worker status updates (worker writes, orchestrator reads)

If a fact lives only in chat, it does not exist.

## Stack

Next.js (App Router) + Prisma + Supabase + JWT-Edge auth + shadcn/ui + Tailwind.
