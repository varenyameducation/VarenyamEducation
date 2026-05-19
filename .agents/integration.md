# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Rebase `integration/drop-answer-detection` onto current main and resolve conflicts

User confirmed they want this shipped:
> "I don't want Gemini tokens getting wasted on detecting the right option, neither I want auto classification of answers, I just want questions imported correctly in correct format."

The PR `integration/drop-answer-detection` (already on origin) tweaks both Gemini Vision prompts so they **always return `correct_option: []`** — never spending tokens on answer detection, even partially. But it conflicts with main because main now includes `integration/lenient-gemini-json-parse` which touched the same prompt blocks (for the JSON-escape fix).

**Your job**: rebase the existing branch onto current main, resolve the conflicts cleanly so BOTH the answer-detection-removal AND the lenient JSON parse changes are present, smoke-test, push.

**Branch:** `integration/drop-answer-detection` (existing — rebase + force-push, don't create a new one)

### Conflicts (per orchestrator's pre-check)

1. **`.agents/status-integration.md`** — append-only file. Take "both sides" trivially by keeping all entries from both ancestors. No semantic conflict.

2. **`lib/integrations/ai/parse-question-image.ts`** — both branches edited the prompt section. Resolution: the file should end up with:
   - The `lenientJsonParse(result.text)` call from main (the JSON-parse fix), NOT the old `JSON.parse(result.text)`
   - The prompt text from THIS branch's intent: `correct_option: ALWAYS return [] (an empty array). Do NOT try to detect or infer the correct answer from the image. Even if the image marks an answer with a tick, asterisk, or "Ans:" prefix, ignore it and return [].`
   - The import of `lenientJsonParse` from `./json-utils` (from main)
   - Same Zod schema (unchanged either way)

3. **`lib/integrations/ai/parse-questions-from-image.ts`** — likely the same pattern. Apply the equivalent of the above: keep `lenientJsonParse` from main, keep the strict prompt instruction from your branch.

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout integration/drop-answer-detection && git pull origin integration/drop-answer-detection`
3. `git rebase origin/main` — expect conflicts in the files above.
4. Resolve each conflict by hand:
   - For prompt files: keep the `lenientJsonParse` usage from main + the strict `correct_option` prompt text from your branch. Both edits are compatible; this is "take both."
   - For status file: keep all entries from both ancestors. Append a new entry below for this rebase action.
5. `git add` the resolved files; continue the rebase (`git rebase --continue`).
6. Run `npx tsc --noEmit` — must be clean. If broken, debug before pushing.
7. (Optional but recommended) Quick smoke: write a 5-line `scripts/test-no-answer-detection.mjs` that calls `parseQuestionFromImage` on the user's calculus image (`/mnt/c/Users/HP/OneDrive/图片/Screenshots/Screenshot 2026-05-26 235616.png`). Assert that the returned `parsed.correct_option` is `[]` (regardless of whether the image marks an answer). If the file already covers this, just re-run it.
8. **Force-push with lease**: `git push --force-with-lease origin integration/drop-answer-detection`
9. Append a 3-line entry to `.agents/status-integration.md` — branch rebased, conflicts resolved how, smoke result.
10. **Stop.**

### Hard rules

- Single rebase, single force-push. Don't create a new branch — the existing PR re-uses the same one and GitHub will pick up the new commits.
- `--force-with-lease`, NEVER `--force` (so you don't clobber unseen origin work).
- Don't change anything beyond resolving the conflicts. The diff vs main should be exactly two things: prompt text "always return []" + status entry. Nothing else.
- Don't add new deps.
