# INTEGRATION brief

> Owned by **orchestrator** (writes). **integration** worker reads and executes.

## Identity check before starting

```
git config user.email   # must be snehachoukseyobc@gmail.com
```

## Current task — Drop answer-detection from Gemini Vision prompts

User feedback: "no need to mark the answers as correct or not, only the questions has to be imported nothing else, so don't waste API quota there in finding out the answer."

Currently both single-question and multi-question Gemini Vision prompts ask the model to populate `correct_option` IF the image marks one (with a tick, "Ans:", etc.). The user doesn't want that — every imported question stays unverified with `correct_option: []`; users manually mark answers later in the question bank. This also saves a small number of tokens per call and removes a hallucination surface (Gemini sometimes guesses wrong on assertion-reasoning questions).

**Branch:** `integration/drop-answer-detection`

**Base off:** `main`.

### Changes

- [ ] `lib/integrations/ai/parse-question-image.ts` — prompt update. Find the line:
  ```
  - correct_option: array — leave empty unless the image marks the correct one.
  ```
  Replace with:
  ```
  - correct_option: ALWAYS return [] (an empty array). Do NOT try to detect or
    infer the correct answer from the image. Even if the image marks an answer
    with a tick, asterisk, or "Ans:" prefix, ignore it and return [].
  ```

- [ ] `lib/integrations/ai/parse-questions-from-image.ts` — same prompt update for the multi-question variant. Find the equivalent `correct_option:` line in the prompt and replace identically.

- [ ] **Zod schemas stay unchanged.** Keep `correct_option: z.array(z.enum(['A','B','C','D'])).default([])` so backwards compatibility holds if Gemini hallucinates and returns something — the route accepts it but downstream BE code will discard.

- [ ] No code logic changes — just prompt text. The helpers continue to return `{ parsed, usage }` exactly as before.

### Validation

- [ ] `npx tsc --noEmit` clean.
- [ ] Smoke: run `scripts/test-gemini-image.mjs` or write a tiny inline test. Verify against the user's calculus question image — `correct_option` should be `[]` in the response (it was already `[]` before because the image didn't mark an answer, but confirm).

### Workflow

1. Read `CLAUDE.md`, `.agents/PROTOCOL.md`, this brief.
2. `git fetch origin && git checkout main && git pull && git checkout -b integration/drop-answer-detection`
3. Tiny patch — 2 files, prompt text only. Single commit.
4. Commit with `[INT]` prefix. **No Claude attribution.**
5. **Backdate per pacing rule.** 2026-05-27 is filling up. Light days: 2026-05-15 (1 commit), 2026-05-16 (3 commits), 2026-05-17 (1 commit). Pick `2026-05-17T20:00:00+05:30`.
6. Push.
7. Append entry to `.agents/status-integration.md` — short, just confirm the prompt change shipped + token-count delta if measured.
8. **Stop.**

### Hard rules

- No npm dependencies.
- Prompt change only — no helper signature changes, no schema changes.
- Don't touch `lib/integrations/ai/gemini.ts` (the low-level wrapper).
