# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — HOTFIX: bulk import transaction timing out

**Severity: P0 — user-blocking.** User just tried to bulk-import a PDF (`65-S-1_Mathematics-15.pdf`, ~118 KB, Vision ON) on production (`varenyamedtech.in`) and got:

```
Bulk insert failed; no rows imported (
  Invalid `prisma.questionTaxonomy.create()` invocation:
  Transaction API error: Transaction not found. Transaction ID is invalid,
  refers to an old closed transaction Prisma doesn't have information about
  anymore, or was obtained before disconnecting.
)
```

This is the classic Prisma interactive-transaction timeout. The transaction at `app/api/questions/import/route.ts:506` uses Prisma's default **5-second** `timeout` and **2-second** `maxWait`. For a multi-question PDF the inner loop does N × 2 sequential writes (question + junction) against the Supabase pooler — and once the DB has accumulated more rows / more indexes, that loop crosses the 5s ceiling and Postgres kills the transaction. The next `tx.questionTaxonomy.create()` throws the message above.

Was working in the past; not "broken by the favicon merge" (those don't touch this route). The bug has been latent and is now reliably reproducing as the question bank grows.

### What to change — exactly

There are **four** `prisma.$transaction(async (tx) => { ... })` blocks in this file (lines around 506, 920, 1204, 1425 — one per import path: DOCX, XLSX, Image, PDF-Vision). All have the same shape: outer `for ... { tx.question.create + tx.questionTaxonomy.create }`. **Apply the same `{ timeout, maxWait }` options object to every one of them.**

**Pattern:**

```ts
await prisma.$transaction(
  async (tx) => {
    for (const p of pending) {
      const created = await tx.question.create({ data: p.data })
      await tx.questionTaxonomy.create({ data: { ... } })
      imported += 1
    }
  },
  { maxWait: 10_000, timeout: 60_000 },
)
```

Rationale for the numbers:
- `timeout: 60_000` (60s) — covers a bulk import of ~200 questions even on a sluggish pooler. The whole route already has `export const maxDuration = 60`, so Prisma can't outlive the function anyway; 60s is the natural ceiling.
- `maxWait: 10_000` (10s) — how long Prisma will wait to *acquire* a transaction slot from the pool. Default 2s is too tight on a cold pooler.

That is the only behavioural change. **Do NOT refactor the loops, do NOT switch to `createMany`, do NOT split the transaction.** Atomicity (no half-inserts) is the whole point of the transaction and we keep that.

### Why not `createMany`?

You might be tempted. Two reasons not to in this hotfix:
1. `questionTaxonomy` depends on `question.id`, so you'd need `createManyAndReturn` (Prisma 5.14+, supported here) on Question and then a separate `createMany` on QuestionTaxonomy. That's a real refactor, not a hotfix — fine for a follow-up PR but not this one.
2. The user is blocked NOW. Shipping a one-options-object change is minutes; refactoring is hours of test surface.

Open a follow-up note in your status entry recommending the `createManyAndReturn` migration as a perf improvement for the next sprint.

### Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run dev` (port 4000) boots clean.
- [ ] Grep verification: `grep -n "prisma.\$transaction" app/api/questions/import/route.ts` → all 4 hits, and the line immediately above the closing `)` of each transaction now reads `{ maxWait: 10_000, timeout: 60_000 },` (or equivalent). No accidental misses.
- [ ] If you can run an actual import locally (using a small DOCX or PDF and pointing at the live Supabase) — do so and confirm it succeeds. If you can't, that's fine; the user will smoke-test on production after deploy.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/import-transaction-timeout-hotfix`
3. Edit `app/api/questions/import/route.ts` — add `{ maxWait: 10_000, timeout: 60_000 }` as the second arg to all four `prisma.$transaction(async (tx) => { ... })` calls.
4. **Single commit.** Message: `[BE] Hotfix: bulk import — bump Prisma transaction timeout (5s → 60s) so PDF/DOCX imports complete on growing DBs`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T20:00:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T20:00:00+05:30'`.
5. Push: `git push -u origin backend/import-transaction-timeout-hotfix`. If credential helper blocks, write `BLOCKED ON: push needs orchestrator` and stop.
6. If `gh` is available, `gh pr create` against `main`. Otherwise leave PR creation to orchestrator and note in status (`BLOCKED ON: gh not installed, orchestrator to open PR`).
7. Append a short entry to `.agents/status-backend.md` (date `2026-05-29`). Run `~/report.sh backend "import transaction timeout hotfix PR ready"`.
8. **Stop.**

### Hard rules

- One commit, one PR, one file changed.
- Apply the timeout options object to **all 4** `$transaction` calls — not just the first one you find. Miss one and that import path still breaks.
- Don't change the loop body, don't refactor to `createMany`, don't touch the error handling.
- No Claude attribution.
- The user is blocked on production. Speed matters; correctness more.
