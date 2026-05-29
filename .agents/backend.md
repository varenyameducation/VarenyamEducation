# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — HOTFIX #2: chromium libnss3.so STILL missing after v121 bump

**Severity: P0 — user-blocking.** Previous hotfix (`backend/chromium-121-libnss-hotfix`, merged ~30 min ago) bumped `@sparticuz/chromium` from `^119.0.2` → `^121.0.0`. **It did not fix the error.** User confirmed via Vercel logs — `/api/tests/[id]/export/pdf` still returns 500 with the exact same `libnss3.so: cannot open shared object file` message.

I (orchestrator) misdiagnosed it as a minor extraction bug in v119 that v121 fixed. The actual cause: `@sparticuz/chromium` versions in the 119–123 range expect the Amazon Linux 2 shared libs (`libnss3.so`, `libxshmfence.so`, `libgbm.so`, etc.) to either be installed system-wide on AWS Lambda OR extracted from the bundled `al2.tar.br` tarball. Vercel's modern Lambda runtime ships neither, and the extraction-and-LD_LIBRARY_PATH wiring in those versions is unreliable.

Starting from **v131**, `@sparticuz/chromium` ships a Chromium build with the required `.so` libs **statically linked** into the binary itself — no extraction, no `LD_LIBRARY_PATH` games, just works on Vercel. That requires `puppeteer-core@^23`.

### Fix — version bump + minimal launch-options check

**`package.json`:**
```diff
- "@sparticuz/chromium": "^121.0.0",
- "puppeteer-core": "^21.11.0",
+ "@sparticuz/chromium": "^131.0.1",
+ "puppeteer-core": "^23.10.0",
```

Then `npm install` from `/mnt/d/varenyam` to regenerate `package-lock.json`.

### Code: verify (don't refactor) lib/export/pdf.ts

`lib/export/pdf.ts` currently calls:
```ts
const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: true,
})
```

In `puppeteer-core@23`, `headless: true` is still accepted (it maps to the "new" headless mode internally). The `args`, `defaultViewport`, `executablePath` API on `@sparticuz/chromium` v131 is identical to v119. **Do not change this code unless `npx tsc --noEmit` fails on it.** If it does fail, it'll be on the launch-options type — narrow fix to whatever the new type expects, do not refactor the whole file.

### Code: also fix the `setContent` waitUntil

While bumping, change one detail in `lib/export/pdf.ts` that may trip on the new chromium:
```diff
- await page.setContent(html, { waitUntil: 'networkidle0' })
+ await page.setContent(html, { waitUntil: 'domcontentloaded' })
```

Reason: our HTML is fully self-contained (KaTeX CSS gets injected via `addStyleTag` later, base64 logo, no external fetches). `networkidle0` waits 500ms for the *absence* of network requests, which is dead weight here and occasionally hangs on serverless. `domcontentloaded` fires the instant the HTML parser finishes — same effective render, faster, more predictable. This is unrelated to the libnss bug; doing it now while we're already in the file.

### Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm install` resolves cleanly. No peer-dep errors. Confirm:
  - `node -p "require('@sparticuz/chromium/package.json').version"` reports `131.x.y`
  - `node -p "require('puppeteer-core/package.json').version"` reports `23.x.y`
- [ ] `npm run dev` (port 4000) boots clean.
- [ ] `package-lock.json` committed.
- [ ] Grep verify both versions: `grep -E '"(@sparticuz/chromium|puppeteer-core)"' package.json` shows the new pins.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/chromium-131-puppeteer-23-hotfix`
3. Edit `package.json` — bump both deps as shown.
4. Run `npm install` from `/mnt/d/varenyam`.
5. Edit `lib/export/pdf.ts` — change the `setContent` waitUntil only. Do NOT touch anything else unless tsc complains.
6. **Single commit** (package.json + package-lock.json + pdf.ts). Message: `[BE] Hotfix #2: bump @sparticuz/chromium 121 -> 131 + puppeteer-core 21 -> 23 (statically-linked libs fix libnss3.so on Vercel) + switch setContent waitUntil to domcontentloaded`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T21:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T21:30:00+05:30'`.
7. Push: `git push -u origin backend/chromium-131-puppeteer-23-hotfix`. If credential helper blocks, write `BLOCKED ON: push needs orchestrator` and stop.
8. Append a short entry to `.agents/status-backend.md`. Run `~/report.sh backend "chromium 131 + puppeteer 23 hotfix PR ready"`.
9. **Stop.**

### Hard rules

- One commit, one PR, three files max (package.json, package-lock.json, lib/export/pdf.ts).
- Do NOT refactor lib/export/pdf.ts beyond the one-line setContent change.
- Do NOT touch next.config.mjs, the route, or any other file.
- Do NOT switch to `@sparticuz/chromium-min` (the runtime-download variant) — that's a much bigger architectural change and not needed here.
- No Claude attribution.
- If `npm install` fails with unresolvable peer-dep errors, write a status entry with the exact error output and stop. Orchestrator will rescope.
- The user's production PDF export has been dead for hours. Speed matters; correctness more.
