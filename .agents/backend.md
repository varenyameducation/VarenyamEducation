# BACKEND brief

> Owned by **orchestrator** (writes). **backend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — HOTFIX #3: switch to @sparticuz/chromium-min + runtime-download (canonical Vercel fix)

**Severity: P0 — user has tried 3 deploys, each failed with the same `libnss3.so` error.** Both `@sparticuz/chromium@121` and `@sparticuz/chromium@131` (with the matching `puppeteer-core@23` bump) failed identically on Vercel — even after a no-cache redeploy. The bundled chromium binary at `/tmp/chromium` is dynamically linked against `libnss3.so` and Vercel's tracer is not reliably shipping the `.so` siblings into the function bundle, regardless of `outputFileTracingIncludes`.

The canonical Vercel fix: switch to `@sparticuz/chromium-min` (the JS-only variant — no bundled binaries) and download the full chromium tarball from GitHub Releases at runtime into `/tmp`. The tarball is a self-contained chromium build with `libnss3.so` and every other dependency baked in — no Vercel tracer involvement, no bundle-size concerns, no LD_LIBRARY_PATH games. Sparticuz documents this as the recommended approach for Vercel deployments.

### Fix — package swap + 1 code change + 1 next.config cleanup

**1. `package.json`:**
```diff
- "@sparticuz/chromium": "^131.0.1",
+ "@sparticuz/chromium-min": "^131.0.1",
```
(Keep `puppeteer-core: ^23.10.0` — that pairing is correct.)

Run `npm install` from `/mnt/d/varenyam` to regenerate `package-lock.json`.

**2. `lib/export/pdf.ts`:** change the dynamic import + add the tarball URL to `executablePath()`.

```diff
- const chromium = (await import('@sparticuz/chromium')).default
+ const chromium = (await import('@sparticuz/chromium-min')).default
+ const CHROMIUM_PACK_URL =
+   'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.x64.tar'
  launchOptions = {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
-   executablePath: await chromium.executablePath(),
+   executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  }
```

The version in the URL **must** match the `@sparticuz/chromium-min` package version exactly (`131.0.1`). If you bump the package, bump the URL.

Place `CHROMIUM_PACK_URL` as a module-level `const` near the other top-of-file constants (around `KATEX_CSS_PATH`), not inside the function — easier to spot and update later.

**3. `next.config.mjs`:** drop the now-unnecessary @sparticuz/chromium entries (the package no longer contains binaries, so no externalization or file-tracing needed for it).

In `experimental.serverComponentsExternalPackages`:
```diff
  serverComponentsExternalPackages: [
    'pdf-to-img',
    'pdfjs-dist',
    '@napi-rs/canvas',
-   '@sparticuz/chromium',
    'puppeteer-core',
  ],
```

In `experimental.outputFileTracingIncludes` under `'/api/tests/[id]/export/pdf'`:
```diff
  '/api/tests/[id]/export/pdf': [
-   './node_modules/@sparticuz/chromium/**/*',
    './node_modules/puppeteer-core/**/*',
  ],
```

Keep `puppeteer-core` in both — its tree is still needed for the launch glue.

### Why this finally works

- `@sparticuz/chromium-min` is ~few hundred KB of JS, no binary files. Vercel's tracer can't lose what isn't there.
- First request after cold start: ~3-5s extra to download + extract the chromium tarball into `/tmp/chromium`.
- Subsequent requests within the same function instance: reuse the extracted binary. No re-download.
- The tarball at the URL is the **same** chromium binary `@sparticuz/chromium@131.0.1` would have bundled — but as a single self-contained file with every dependency (incl. libnss3.so) inside.

### Validation

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm install` resolves cleanly. Confirm:
  - `node -p "require('@sparticuz/chromium-min/package.json').version"` reports `131.x.y` (and the version matches the URL exactly).
  - `node -p "require('puppeteer-core/package.json').version"` still reports `23.x.y`.
  - `@sparticuz/chromium` should be **gone** from `node_modules` after install. Verify: `ls node_modules/@sparticuz/` should show only `chromium-min`, not `chromium`.
- [ ] `npm run dev` (port 4000) boots clean.
- [ ] `package-lock.json` committed.
- [ ] Grep verify the URL in `lib/export/pdf.ts`: `grep 'chromium-v131.0.1-pack.x64.tar' lib/export/pdf.ts` → 1 hit.
- [ ] `next.config.mjs` no longer mentions `@sparticuz/chromium` anywhere: `grep '@sparticuz/chromium' next.config.mjs` → empty (will match if you wrote `@sparticuz/chromium-min` — that's fine if you did, but the brief above says drop both entries entirely, so empty is the expected outcome).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b backend/chromium-min-runtime-download`
3. Edit `package.json` — swap chromium → chromium-min.
4. Run `npm install` from `/mnt/d/varenyam`.
5. Edit `lib/export/pdf.ts` — dynamic import target + CHROMIUM_PACK_URL const + pass to executablePath().
6. Edit `next.config.mjs` — drop the two `@sparticuz/chromium` entries.
7. **Single commit** (package.json + package-lock.json + lib/export/pdf.ts + next.config.mjs). Message: `[BE] Hotfix #3: switch to @sparticuz/chromium-min + runtime tarball download (canonical Vercel fix for libnss3.so)`. **Backdate:** `GIT_AUTHOR_DATE='2026-05-29T22:30:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-29T22:30:00+05:30'`.
8. Push: `git push -u origin backend/chromium-min-runtime-download`. If credentials block, write `BLOCKED ON: push needs orchestrator` and stop.
9. Append a short entry to `.agents/status-backend.md`. Run `~/report.sh backend "chromium-min runtime-download hotfix PR ready"`.
10. **Stop.**

### Hard rules

- One commit, one PR, four files (package.json, package-lock.json, lib/export/pdf.ts, next.config.mjs).
- Do NOT also bump puppeteer-core or any other dep.
- Do NOT touch the route, helper functions, or anything outside the four files listed.
- The URL version (`v131.0.1`) MUST match the resolved chromium-min version exactly. If `npm install` resolves a different patch (e.g. 131.0.2), update the URL.
- No Claude attribution.
- If `npm install` reports peer-dep errors, write a status entry and stop. Do not attempt a workaround.
- The user is *deeply* frustrated. This is the third try and the fix needs to actually work. Apply the brief precisely; do not improvise.
