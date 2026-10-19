# Phase 3a: agent recommendation and cross-family review

- **Status:** proposed; Hugo chose this scope on 2026-10-19: a script recommends, Hugo starts the run, and Hugo still merges every stage into `main`.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-07`.
- **Design:** `docs/MULTI-AGENT-PHASES.md`, "Phase 3", reduced to what needs no change to the rules of `AGENTS.md` or `docs/DELIVERY.md`.

## Why 3a before the full Phase 3

Phase 3 lets the pipeline merge stages into `iteration/N` and start the next stage by itself. That needs an amendment of `AGENTS.md` and `docs/DELIVERY.md`, a new ruleset and CI on `iteration/**`. Phase 3a gives the same choice of leader and reviewers without any of that: every current gate stays, and only Hugo starts runs and merges.

## Contract

1. `ORC-01`: `agents/registry.yaml` gains the orchestrator fields `status` (`active` or `pending`), `roles` (`lead`, `lead-small`, `review`), `family` (vendor of the model the agent runs), `cost` (`subscription` or `api`) and `avoid` (stage kinds: `build`, `content-review`, `design`). Unknown values are rejected. A missing `status` means `pending`.
2. `ORC-02`: `scripts/orchestrate.ts` recommends one leader for a stage, deterministically (the same `docs/PLAN.md`, registry and history give the same answer):
   - **Eligible:** `active`, role `lead`, every capability the stage needs (its "Needs" column, plus `git`, `node` and `browser` from Stage 02 on), the stage kind not in `avoid` (🔍 is `content-review`, 🎨 is `design`), a known model family, and not the leader of the previous stage.
   - **Score, 0 to 100:** past results 50 (neutral 25 for every agent until results are recorded), cost 20 (`subscription` 20, `api` 10), rotation 20, fit 10 (stage kind in the agent's optional `prefers` list).
   - **Ties:** the agent that led less recently, then registry order.
   - Agents with only `lead-small` are listed as alternatives and are never the recommended leader, because their limit is the size of the stage, which the plan does not record. Hugo decides whether a stage is small enough.
3. `ORC-03`: up to two reviewers, `active` with the `review` role, whose model family differs from the leader's and from each other's, ranked with the same score.
4. `ORC-04`: the previous leader comes from the merge commits of `main` (`Merge pull request #N from owner/agent/stage-NN-<agent>`). Branches not named after a registry agent are ignored. If the history cannot be read, the recommendation says so and applies no rotation.
5. `ORC-05`: `scripts/next-stage-issue.ts` appends the recommendation to every new work order, with each agent's score parts and the reason each excluded agent is not eligible. When nobody can lead, it adds the label `needs-hugo`. It never starts a run and never adds an `agent:<id>` label: Hugo does.
6. `ORC-06`: `node scripts/orchestrate.ts <stage>` prints the same recommendation locally, from `git log`, for a work order opened before this change.

## Out of scope

- Running the reviewers in the pipeline: a separate change (Phase 3a, part 2), with read-only reviewer jobs and a trusted publisher, as designed in `docs/MULTI-AGENT-PHASES.md`. Until then Hugo starts each recommended reviewer by hand, and GitHub Copilot code review keeps reviewing PRs as today.
- Recording past results (green CI on the first push, blocking findings) for the history score.
- Iteration branches, pipeline merges, automatic starts and any change to `AGENTS.md`, `docs/DELIVERY.md`, approvals or workflows.

## Verification

- Unit tests: `P3-1` (determinism), `P3-2` (no reviewer shares the leader's family, nor another reviewer's), rotation, avoided kinds, missing capabilities, `lead-small`, escalation, rejected registry values, history parsing, and the work-order integration against a mock GitHub API, including an unreadable history.
- A test runs the real registry and plan for every pending stage.
- No workflow changes: `next-stage.yml` already runs the script with `contents: read`, which can read the merge commits.
