# Phase 3a, part 2: reviewer jobs and a trusted review publisher

- **Status:** proposed. Builds the part that `docs/specs/orchestration.md` left out of scope: running the recommended reviewers in the pipeline. Hugo still starts every review and merges every stage into `main`.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-04`, `SEC-07`.
- **Design:** `docs/MULTI-AGENT-PHASES.md`, "Phase 3" ("Iteration flow" step 4, "Reviewer verdict format" and "Security"), reduced to what needs no change to `AGENTS.md` or `docs/DELIVERY.md`: no gate, no iteration branch, no automatic start.

## How it works

```
Hugo adds the label review:<id> to a stage PR (or starts "Agent review" by hand with the PR and the reviewer)
        │
        ▼
agent-review.yml (defined on main)
  job "prepare"   no secrets: checks who started it, the PR, its head SHA and that the reviewer may review it
  job "review"    runs the reviewer CLI read-only, with its model key and NO GitHub write token,
                  on the exact head SHA; leaves .agent/review.md
  job "publish"   no project code: validates the review, binds the facts it knows, posts the comment
                  and records its id in a check run on the reviewed SHA
  job "report"    on any failure, a fixed comment on the PR; removes the review:<id> label
        │
        ▼
Hugo reads the reviews next to CI and Copilot code review, and merges or asks for changes
```

## Contract

1. `REV-01` **Who starts a review.** Two start paths, both only for the trusted login `vars.AGENT_TRUSTED_LOGIN`, checked twice like `agent-run.yml`: the actor of the event and the triggering actor (a re-run by someone else is refused), in the job conditions and again by `scripts/agent-checks.ts trusted` in `prepare`.
   - **Manual:** `workflow_dispatch` with the inputs `pr` (digits only) and `reviewer` (a registry id).
   - **Label:** `pull_request_target` of type `labeled`, when the label is `review:<id>`, the PR comes from this repository (not a fork) and its head branch starts with `agent/stage-`. `pull_request_target` runs the workflow file of the base branch, never the PR's.
   - Both paths run only from the default branch (`github.ref` is `refs/heads/<default branch>`), so a workflow file on another branch cannot reach the `agents` environment through them.
   - Concurrency: one run per PR and reviewer, never cancelling a run in progress; events that `prepare` would refuse get a group of their own and cannot displace a waiting run.
2. `REV-02` **Which PR.** The PR is open, from this repository, targets the default branch, has a head branch `agent/stage-NN-<leader>` and a title that starts with `Stage NN:` for the same `NN`. Its head SHA is read from the API in `prepare` and recorded; every later job uses that SHA.
3. `REV-03` **Which reviewer.** The reviewer is in `agents/registry.yaml` (read from `main`), has `status: active`, the role `review`, a known model family and, for OpenCode and Copilot, a valid explicit model. The leader is the `<leader>` suffix of the head branch and must be a registry agent with a known family. The reviewer's family differs from the leader's (the rule of `ORC-03`). A PR whose branch is not named after a registry agent is not reviewed by an agent: Hugo reviews it. The orchestrator's recommendation is not enforced: Hugo may pick any eligible reviewer.
4. `REV-04` **Agent tool configuration.** A PR that adds or changes files the reviewer CLIs could load as configuration from the checkout (`.agent`, `.claude/`, `.codex/`, `.opencode/`, `.copilot/`, `opencode.json`, `opencode.jsonc`, `.mcp.json`, `.github/hooks/`) is refused before the reviewer starts, because those files could grant tools, add hooks or start servers next to the model key. On `main` these files are trusted; a change in the PR is not.
5. `REV-05` **Review job isolation.** The `review` job runs in the environment `agents` with `contents: read` and `packages: read` only, and proves that a `git push` is refused. It checks out the recorded head SHA with `persist-credentials: false`, checks that `HEAD` is that SHA and writes the diff against the merge base with `main` to `.agent/pr.diff` and the changed paths to `.agent/pr-files.txt` from trusted code. The reviewer CLI runs in the digest-pinned runner image, in the same unprivileged `docker run` container as `agent-run.yml` (runner's user, `--cap-drop ALL`, `no-new-privileges`, the two bounded sandbox profiles, no Docker socket), with the whole workspace mounted read-only (`.git` included) and only `.agent/` writable. No `npm ci`, no project command and no Figma gateway run in this job. The model key reaches one step only.
6. `REV-06` **Read-only modes of the runners.**
   - Codex: `codex exec --sandbox read-only`; it cannot write files, so its final message is saved by the CLI to the path the workflow chooses, `.agent/review.md` (`--output-last-message`).
   - Claude Code: `claude -p` in `dontAsk` mode with only `Read`, `Glob`, `Grep`, read-only `git` (`status`, `diff`, `log`, `show`, `ls-files`) and `Write` of `/work/.agent/review.md`; settings come only from the run's own file (`--setting-sources user` with an empty home, `--settings`), no MCP server, shell sandbox on with no network.
   - OpenCode: `opencode-runner.ts review` writes a configuration whose edits are denied except `.agent/review.md`, whose shell is denied except read-only `git`, and which denies web fetch and search.
   - Copilot CLI: `copilot-runner.ts review` approves only `write(.agent/review.md)` and read-only `git`, with no URL and the same denials as a build run.
   - The CLI permissions are a second layer; the read-only mount is the boundary.
7. `REV-07` **Review format.** `.agent/review.md` is Markdown: findings with file and line, most severe first, following `REVIEW.md` and the stage spec, and its last line is exactly one block:
   `<!-- agent-review: {"verdict": "pass" | "blocking", "findings": N} -->`
   The JSON has exactly the keys `verdict` and `findings`; `findings` is an integer from 0 to 500; `blocking` needs at least one finding. There is text before the block, and the text contains no other `agent-review:` block.
8. `REV-08` **Before upload.** A trusted step, from the copy of `main`'s scripts made before the CLI ran, refuses a missing file, a symlink or an oversized file, scans the review with the patterns of `agent-checks.ts` (`findSecrets`) and only then uploads `review.md` alone as an artifact kept 7 days. Transcripts are never uploaded.
9. `REV-09` **Publisher.** The `publish` job has `contents: read`, `pull-requests: write` and `checks: write`, and nothing else. It runs only scripts from a checkout of `main` and no npm. It validates the artifact again (regular file, at most 256 KiB, UTF-8 without NUL bytes, no secret-like content, a valid verdict block) and builds the comment from facts it derives itself: the reviewer id, name, family, provider and model from the registry on `main`, the leader and its family from the head branch, and the reviewed SHA recorded by `prepare`. Nothing in the reviewer's text can change these facts: the model's own block is removed, other HTML comments are escaped, `@` mentions are neutralized and the text is cut to 60,000 characters. The comment ends with the publisher's block, `<!-- agent-review: {...} -->`, with the verdict, the findings and the bound facts. The job then creates a check run named `agent-review / <id>` on the reviewed SHA, completed with `success` for `pass` and `failure` for `blocking` or an invalid review, whose `external_id` is the comment id. If the PR head moved while the review ran, the comment says the verdict covers the reviewed SHA only.
10. `REV-10` **Failures.** An invalid review is not published: the publisher posts a fixed notice with the reason (never the reviewer's text), creates the failing check run and fails. Any other failure after `prepare` validated the PR number posts a fixed notice with the run link. The `review:<id>` label is removed at the end, so Hugo can add it again.
11. `REV-11` **Nothing merges.** No job approves, requests changes as a GitHub review, merges, pushes or labels with `needs-hugo`. The verdict is advice for Hugo; the check run is not a required check. The GitHub App of `agent-run.yml` is not used.

## Allowed protected changes

This change adds the proposed `docs/agents/workflows/agent-review.yml` and updates `docs/agents/adding-an-agent.md`. Hugo copies the proposal to `.github/workflows/agent-review.yml`. It also changes `scripts/opencode-runner.ts` and `scripts/copilot-runner.ts`, which are baked into the runner image: the image must be rebuilt and `AGENT_RUNNER_IMAGE` updated before an OpenCode or Copilot review runs. No repository setting, environment, secret or variable is changed by an agent.

## What Hugo does

1. Copy `docs/agents/workflows/agent-review.yml` to `.github/workflows/`.
2. Create one label per reviewer: `review:codex`, `review:claude`, `review:copilot` (`review:opencode` only if its registry entry gains the `review` role).
3. Rebuild the runner image ("Agent runner image") and update `AGENT_RUNNER_IMAGE`, so the OpenCode and Copilot review modes are in it.
4. To review a stage PR, add `review:<id>` with one of the reviewers the work order recommends, or run "Agent review" by hand.

## Verification

- Unit tests in `scripts/agent-review.test.ts`, named after the IDs above: verdict parsing (`REV-07`), PR and reviewer eligibility (`REV-02`, `REV-03`), agent configuration paths (`REV-04`), artifact validation and secret scanning (`REV-08`, `REV-09`), the publisher's binding of facts, neutralizing of the reviewer's text and the check run (`REV-09`), and failure notices (`REV-10`).
- Runner tests: the review configuration of OpenCode and the review arguments of Copilot (`REV-06`).
- Workflow tests in `scripts/agent-review-workflows.test.ts`: triggers, trusted-actor and default-branch guards (`REV-01`), the permissions of every job and the absence of any write token or App key in `review` (`REV-05`, `REV-09`), the container mounts, the inline read-only Codex and Claude Code invocations (`REV-06`), and the absence of merge, approval and push commands (`REV-11`).
- **To verify on the first real run:** that `pull_request_target` labelled by Hugo reaches the `agents` environment restricted to `main`; that each CLI starts with the workspace mounted read-only (state goes to the temporary home); that `codex exec --sandbox read-only --output-last-message` writes the final message; that `--setting-sources user` keeps project settings out while the prompt still points Claude Code at `AGENTS.md` and `REVIEW.md`; that Copilot honours `write(.agent/review.md)` as the only write; that `pull-requests: write` is enough to remove the label; duration and cost of one review.

## Out of scope

- The gate that merges on two fresh `pass` verdicts, iteration branches and automatic starts (full Phase 3, after the amendment of `AGENTS.md` and `docs/DELIVERY.md`).
- Reviewers that run the site or its tests, or check facts on the web: reviewers read the diff and the repository only.
- Recording verdicts as past results for the orchestrator's history score.
- Continuation runs where the leader addresses the findings.
