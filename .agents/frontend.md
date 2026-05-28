# FRONTEND brief

> Owned by **orchestrator** (writes). **frontend** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
gh auth status          # active account must be snehachoukseyobc
```

If either is wrong, fix before committing.

---

## Current Task — Varenyam favicon + light brand palette refresh

**Scope is tight on purpose.** The user wants something shipped today: a favicon using Varenyam's V mark, and a subtle palette nudge so the app stops looking like a generic shadcn slate template and starts feeling Varenyam-branded. Functionality is OUT of scope — do not touch any component logic, route, or behaviour.

### Brand colours (from the V mark)

The logo at `/public/brand/varenyam-logo-mark.png` is already in the repo (250×230 RGBA, V composed of teal + yellow + red rectangles on transparent ground). Use it as the source of truth.

Eyeballed hex values — refine to actual values by sampling the PNG in your tool of choice if you want more precision:

| Role | Hex | Notes |
|---|---|---|
| **Brand Teal** (primary) | `#1A7E96` | dominant V colour; left rectangle |
| **Brand Yellow** (accent) | `#F5B223` | small accent stripe on the teal block |
| **Brand Red** (destructive) | `#CC2027` | right V slab |
| Background | `#FFFFFF` | stays white |
| Text | unchanged | keep current near-black |

Convert each to HSL for the CSS variables (shadcn convention stores them as space-separated H S L without the `hsl()` wrapper).

### What to change — exactly

**1. Favicon.** Next.js App Router auto-discovers `app/icon.png` (or `app/icon.svg`, or `app/favicon.ico`) and wires the appropriate `<link rel="icon">` tags. Add `app/icon.png` — either:
- Copy the existing `public/brand/varenyam-logo-mark.png` to `app/icon.png` (simplest), OR
- Use `sharp` (already a project dependency) in a one-shot Node script you run locally to resize the mark to a square 512×512 or 256×256 with transparent padding, then save to `app/icon.png`. The mark is 250×230 right now — slight aspect mismatch but not critical for favicon use. Square + centered with a few px of breathing room reads cleaner at 16×16/32×32 tab sizes.

Verify by `curl -sI http://localhost:4000/icon.png` returns 200 after dev restart.

**Also add `app/apple-icon.png`** if trivial — same source, 180×180. Optional; skip if it doesn't fit in scope.

**2. Palette tokens.** Edit `app/globals.css` only — the `:root` block (light mode). Do NOT touch the `.dark` block; the app doesn't expose a dark-mode toggle yet and changing it now risks regressions you can't visually verify.

Specific token changes:

| Token | From | To | Reason |
|---|---|---|---|
| `--primary` | `222.2 47.4% 11.2%` (near-black) | Varenyam teal in HSL (~`191 70% 34%` ish — calibrate) | Primary buttons, links, active states pick this up |
| `--primary-foreground` | `210 40% 98%` (white) | keep white | Text on teal buttons stays readable |
| `--ring` | `222.2 84% 4.9%` (near-black) | same teal as `--primary` | Focus rings match the brand |
| `--accent` | `210 40% 96.1%` (very pale slate) | a *very* pale teal — e.g. `191 70% 96%` (so it stays close to white but with a teal tint) | Hover/highlight backgrounds get a subtle brand wash |
| `--accent-foreground` | `222.2 47.4% 11.2%` | keep | Text on accent stays dark |
| `--destructive` | `0 84.2% 60.2%` (generic red) | Varenyam red in HSL (~`357 73% 47%` ish — calibrate) | Destructive buttons match the V's right slab |

Do NOT change: `--background`, `--foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--border`, `--input`, `--radius`.

Yellow is deliberately NOT promoted to a token. Reason: shadcn's token surface doesn't have a clean home for a third brand colour, and overusing yellow on UI surfaces tends to look like a warning banner. If you find one or two spots where a yellow accent reads well (e.g. a small badge or the active sidebar item indicator), you may add `--brand-yellow: 41 92% 55%` as a custom variable and use it sparingly — but only if it's clearly an improvement, and document in the commit message which one or two spots you touched.

**3. Verify visually.** Start dev (`npm run dev` from `/mnt/d/varenyam` if your worktree has node_modules; otherwise from main worktree). Check at least:

- `/login` — Sign in button should now be teal, focus ring teal.
- `/` (dashboard home) — sidebar active state should pick up the accent wash.
- `/questions` — primary actions teal, destructive buttons (Delete) use the new red.
- Browser tab — favicon shows the V mark.

Take **2 screenshots**: login page + dashboard home with sidebar showing. Paste paths in the status entry.

### Out of scope

- ANY component file changes (`components/**`, `app/**/*.tsx`). Tokens only. If a component looks wrong AFTER the token change because it had a hardcoded colour (e.g. `bg-blue-600`), DO NOT fix it in this PR — note it in status and move on.
- Dark mode tokens.
- New components or visual restructuring.
- Header redesign, sidebar redesign, marketing pages.
- Any backend or middleware changes.
- Promoting yellow to a primary surface colour (see note above).

### Optional — Claude Code design plugin

The user mentioned `claude plugin install frontend-design@claude-plugins-official`. If that plugin is available in your environment and you find it useful for picking the exact HSL values from the logo PNG or for previewing the palette, use it. If not available or not helpful, skip it — the token changes above are concrete enough to ship without.

### Validation checklist

- [ ] `npx tsc --noEmit` exits 0 (token changes shouldn't touch types but verify).
- [ ] `npm run dev` boots without errors.
- [ ] Browser: favicon visible in tab on `/login`.
- [ ] Browser: Sign in button on `/login` is teal (not near-black).
- [ ] Browser: dashboard sidebar active row uses the new accent wash (not generic slate).
- [ ] Browser: visit `/questions` and verify a Delete button still looks red (with the new Varenyam-red shade).
- [ ] No hardcoded slate/black left in user-visible chrome that you've inadvertently broken.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b frontend/varenyam-favicon-palette`
3. **Single commit** (one focused change is fine — keep it tight): add `app/icon.png` (+ optional `app/apple-icon.png`) and update `:root` tokens in `app/globals.css`. Commit message: `[FE] Varenyam favicon + brand palette tokens (teal primary, brand red destructive)`.
4. **Backdate:** `GIT_AUTHOR_DATE='2026-05-28T23:55:00+05:30'` and `GIT_COMMITTER_DATE='2026-05-28T23:55:00+05:30'`.
5. Verify in browser, take screenshots.
6. Push: `git push -u origin frontend/varenyam-favicon-palette`. If credential helper blocks, write `BLOCKED ON: push needs orchestrator` and stop.
7. `gh pr create` against `main` with a short title + body listing the token changes table and "test plan: visit /login, dashboard, /questions and verify favicon + teal primary + brand red destructive".
8. Append a short entry to `.agents/status-frontend.md`. Run `~/report.sh frontend "favicon + palette done — PR #N"`.
9. **Stop.**

### Hard rules

- One commit, one PR. Don't bundle anything else.
- Don't touch ANY `.tsx` file in `app/` or `components/`. CSS + a PNG only. (Adding `app/icon.png` is fine — it's not a .tsx route.)
- Don't change behaviour. The user said "PLEASE DONT DISTURB ANYTHING ELSE" in caps — respect that.
- No Claude attribution.
- If anything in this brief feels ambiguous, write a status entry asking and stop. Don't guess.
