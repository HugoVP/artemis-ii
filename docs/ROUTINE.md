# Routine: "Artemis II — next stage"

This file documents the routine that moves the project forward. No agent reads it: it is for configuring the routine at claude.ai/code/routines.

## Configuration

- **Name:** Artemis II — next stage
- **Repository:** this project's repo
- **Environment:** `artemis-ii` (see `docs/SETUP.md`)
- **Result branch:** the general pattern `claude/*` (not a specific name such as `claude/clever-volta`). Agents choose their own branch names, so the routine must not be tied to one.
- **Connectors:** remove all of them; this routine needs none
- **Triggers:**
  1. **GitHub event:** Pull request → `closed`, with the filters:
     - Is merged = `true`
     - Base branch = `main`
     - Head branch starts with `claude/`
  2. **Run now**, to start Stage 00 the first time or to retry a stage.

## Routine prompt

Copy this as is into the instructions field (note: the routine currently stored in claude.ai still has the Spanish prompt; update it by hand to match):

```
You are the builder agent for the bilingual Artemis II site.

1. Read CLAUDE.md in full and follow it to the letter. Then read PROMPT.md and docs/PLAN.md.
2. Check on GitHub whether there is any open PR from a `claude/` branch. If there is, do nothing else: finish by explaining which PR is pending review.
3. If this run comes from the merge of a stage PR, mark that stage as "approved" in docs/PLAN.md, as part of your work on the new branch.
4. Take the next stage with status "pending" in docs/PLAN.md and complete it entirely, following the rules in CLAUDE.md.
5. Verify the build, update docs/PLAN.md and its log, and open the PR in the CLAUDE.md format.
6. If all stages are approved, do not change code: open a PR that only updates the log with a final project summary and suggested next steps.

If you get blocked, open the PR as a draft explaining exactly what you need.
```
