# Running the next stage

The procedure every agent follows, whatever started it (a Claude Code routine, a Codex task, a person typing the kickoff prompt). The kickoff prompt is always:

> Read AGENTS.md and follow docs/agents/next-stage.md.

## Procedure

1. **Read** `AGENTS.md` in full and the files it lists.
2. **Check for open stage PRs.** If any open PR (draft or not) has a title starting with `Stage `, stop: make no changes and finish by saying which PR is waiting for review.
3. **Check what started you.**
   - If you were started by a merged PR whose title does not start with `Stage ` (for example a dependency update), stop: this is not a stage merge.
   - Otherwise, find every stage marked `in review` in `docs/PLAN.md` whose PR is merged, and mark it `approved` as part of your work on the new branch.
4. **Pick the stage.** Take the first stage with status `pending` in `docs/PLAN.md`. If every stage is `approved`, open a PR that only adds a final summary and suggested next steps to the log, and stop.
5. **Check capabilities.** Compare the stage's "Needs" column with what your environment can do (`docs/agents/README.md`). If you lack one, do not do the stage's work: open a draft PR (title `Stage NN: <name>`) whose only change is a log line in `docs/PLAN.md`, and explain in its body which capability is missing and what Hugo needs to provide (rule 8).
6. **Read the stage spec** (`docs/specs/stage-NN-*.md`). If it does not exist, open a draft PR that only adds the spec from `_template.md` and asks Hugo to approve it (rule 8).
7. **Do the stage**, following `AGENTS.md`: build only what the spec says, run the local checks, write the next stage's spec, update `docs/PLAN.md`.
8. **Open the PR** with the format in `AGENTS.md` (title `Stage NN: <name>`), then push one follow-up commit to the same branch that adds the PR link to the stage's row and log line in `docs/PLAN.md` (rule 4).

If you get blocked at any point, open the PR as a draft explaining exactly what you need (rule 8).
