# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — HOTFIX: PDF test export fails on Vercel with `libnss3.so` missing

**Severity: P0 — user-blocking.** User clicked "Download PDF" on the test edit page and got:

```
Failed to launch the browser process! /tmp/chromium: error while loading shared libraries:
libnss3.so: cannot open shared object file: No such file or directory
TROUBLESHOOTING: https://pptr.dev/troubleshooting
```

### Root cause

This is a known issue with `@sparticuz/chromium@119.0.2` (the version we're pinned to). That release extracts the chromium binary to `/tmp/chromium` but doesn't reliably unpack the bundled `al2.tar.br` shared-library tarball that contains `libnss3.so`, `libxshmfence.so`, `libgbm.so`, etc., and/or doesn't set `LD_LIBRARY_PATH` so the dynamic linker finds them. Versions from `121.0.0` onward fixed both behaviours.

The unrelated PDF-Vision binary issues we've already fixed (`@napi-rs/canvas` version-mismatch, DOMMatrix polyfill, `outputFileTracingIncludes`) are a different code path (`/api/questions/import`). This is the test PDF *export* path (`/api/tests/[id]/export/pdf` → `lib/export/pdf.ts`).

### Fix

Bump `@sparticuz/chromium` to the latest in the `121.x` line (still compatible with `puppeteer-core@21.11.0` — no need to also bump puppeteer-core, which would be a much larger change).

**`package.json` change:**
```diff
- "@sparticuz/chromium": "^119.0.2",
+ "@sparticuz/chromium": "^121.0.0",
```

Then `npm install` to regenerate `package-lock.json` against the new resolution.

**Do NOT bump `puppeteer-core`** — it stays at `^21.11.0`. The Sparticuz compatibility matrix confirms `chromium@121` works with `puppeteer-core@^21.x`.

**Do NOT touch `lib/export/pdf.ts`** — the `chromium.executablePath()` + `chromium.args` API is stable across these versions. No code change needed in the route or the helper.

**Do NOT touch `next.config.mjs`** — the existing `outputFileTracingIncludes` entry for `/api/tests/[id]/export/pdf` already covers `./node_modules/@sparticuz/chromium/**/*`, which picks up whatever the new version ships.

### Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm install` completes without peer-dep warnings about puppeteer-core incompatibility.
- [ ] `package-lock.json` is committed alongside `package.json`.
- [ ] Local dev: `npm run dev` boots clean (the route itself won't run locally without `PUPPETEER_EXECUTABLE_PATH`, but the import resolution should not throw on boot).
- [ ] Grep verify: `grep '@sparticuz/chromium' package.json` shows `^121.0.0` (or newer 121.x) — not 119.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/chromium-121-libnss-hotfix`
3. Edit `package.json` — bump `@sparticuz/chromium` to `^121.0.0`.
4. Run `npm install` from `/mnt/d/varenyam` to regenerate `package-lock.json`.
5. **Single commit** (the package.json + lockfile together). Message: `[BE] Hotfix: bump @sparticuz/chromium 119 -> 121 to fix libnss3.so missing on Vercel PDF export`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T20:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T20:30:00+05:30'`.
6. Push: `git push -u origin backend/chromium-121-libnss-hotfix`. If credential helper blocks, write `BLOCKED ON: push needs orchestrator` and stop.
7. If `gh` is available, `gh pr create` against `main`. Otherwise leave PR creation to orchestrator (note in status entry).
8. Append a short entry to `.agents/status-backend.md`. Run `~/report.sh backend "chromium 121 libnss hotfix PR ready"`.
9. **Stop.**

### Hard rules

- One commit (package.json + package-lock.json together), one PR, two files.
- Do NOT bump `puppeteer-core` — it's not the issue, and bumping it is a multi-hour change (puppeteer 22+ has API changes around `launch` options).
- Do NOT change `lib/export/pdf.ts`, `app/api/tests/[id]/export/pdf/route.ts`, or `next.config.mjs`.
- Do NOT try alternative approaches (chromium-min with runtime download, switching PDF libs, etc.). Version bump is the highest-leverage minimal fix.
- No Claude attribution.
- If `npm install` fails with peer-dep errors against puppeteer-core@21, write a status entry and stop — do NOT attempt a workaround. Orchestrator will rescope.
- The user's production PDF export is dead. Speed matters; correctness more.
