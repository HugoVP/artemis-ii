# Running an agent in the pipeline

How the `agent-run` workflow runs an agent on a stage, how Hugo sets it up, and how to add another agent. The design and its threat model are in [`docs/MULTI-AGENT-PHASES.md`](../MULTI-AGENT-PHASES.md) ("Phase 2"). The vendor environments keep working: the pipeline is one more way to start a stage.

## Files

| File | What it is |
| --- | --- |
| `agents/registry.yaml` | The agents the pipeline can run: id, model key secret, how it starts, capabilities |
| `docs/agents/workflows/agent-run.yml` | Proposed workflow. Hugo copies it to `.github/workflows/agent-run.yml` |
| `docs/agents/workflows/agent-runner-image.yml` | Proposed workflow that builds and publishes the runner image. Hugo copies it too |
| `Dockerfile`, target `agent-runner` | The CI toolchain plus the pinned agent CLI |
| `scripts/agent-checks.mjs` | The checks of `prepare`, `work` and `publish`, with unit tests in `scripts/agent-checks.test.mjs` and `scripts/agent-workflows.test.mjs` |

Agents cannot push to `.github/workflows/`, so the workflows live in `docs/agents/workflows/` and Hugo copies them. Copy them again whenever they change.

## Setup (Hugo)

1. **GitHub App**, only for his account, installed only on this repository, no webhook. Permissions: Contents, Pull requests, Issues and Checks (read and write) and Metadata (read). Nothing else.
2. **Environment `agents`**, restricted to `main`, with the variable `AGENT_APP_ID` and the secrets `AGENT_APP_PRIVATE_KEY` and `AGENT_KEY_<ID>` (one per agent, for example `AGENT_KEY_CODEX`). Each model key is a dedicated key with a spending limit set in the provider's console.
3. **Repository variable `AGENT_TRUSTED_LOGIN`** with Hugo's GitHub login. Only this login can start a run.
4. **Labels** `agent-task` (already used by work orders), `agent-authored` and `needs-hugo`. Create one `agent:<id>` label per agent, for example `agent:codex`.
5. **Copy the two workflows** from `docs/agents/workflows/` to `.github/workflows/` and merge that change. The Actions policy of the repository allows only GitHub-created actions pinned by SHA, which these files respect.
6. **Publish the runner image.** Run the workflow "Agent runner image" by hand (or merge a change to `Dockerfile`). Its job summary prints the image reference with its digest. Save it as the repository variable `AGENT_RUNNER_IMAGE`. Packages of a public repository are private by default: the run pulls the image with the workflow token, which can read it when the package is linked to this repository (**to verify** on the first run; otherwise make the package public in its settings).
7. **First test:** add the label `agent:codex` to the `Run Stage NN` issue of a small stage, or start "Agent run" by hand with the stage number. Compare the PR with one from a vendor environment.

## What a run does

1. `prepare` checks that the label (or the manual start) comes from `AGENT_TRUSTED_LOGIN`, that the issue title is `Run Stage NN: …`, that no stage PR is open, that NN is the next pending stage, and that the agent has the capabilities the stage needs.
2. `work` runs the agent in the runner image with its model key and a read-only token. The agent commits on `agent/stage-NN-<id>` and writes `.agent/pr-title.txt` and `.agent/pr-body.md`. The job scans every new commit and blob (binary ones too) and uploads the result as an artifact kept 7 days.
3. `publish` checks the artifact again with scripts from `main` (destination ref, protected paths with no rename detection, secret scan of all new objects, PR text), pushes the branch with a short-lived App token, opens the PR with the label `agent-authored` (as a draft, with a warning, if it touches protected paths or the agent wrote `.agent/draft-reason.txt` because it was blocked), adds the PR link to `docs/PLAN.md` and comments on the work order.
4. A failure after `prepare` comments on the work order and adds the label `needs-hugo`.

A result that touches `.github/workflows/**` or contains secret-like text is rejected, not drafted.

## Adding an agent

1. Add an entry to `agents/registry.yaml`. `key_secret` must look like `AGENT_KEY_<ID>`: the checks refuse any other secret name.
2. Add its CLI to the `agent-runner` target of the `Dockerfile`, with a pinned version.
3. Add a start step to `agent-run.yml` for its `runner` value. The step must be headless, take its key from an environment variable of that step only, and write nothing to GitHub.
4. Document in `docs/agents/other-agents.md` how the headless mode and its authentication were verified, and update the "Known agents" table in `README.md`.
5. Create the secret `AGENT_KEY_<ID>` in the environment `agents` and the label `agent:<id>`.

## Verified for Codex

Checked on 2026-10-17 with `@openai/codex` 0.163.0 installed from npm (`codex exec --help`, `codex login --help` and the strings of the binary), not with a real run:

- `codex exec [PROMPT]` runs non-interactively. Options used: `--sandbox workspace-write`, `--ephemeral` (no session files), `--color never`, `--output-last-message <file>`. `--json` prints events as JSONL, which we do not upload.
- Authentication: `CODEX_API_KEY` (and `OPENAI_API_KEY`) are read from the environment; `codex login --with-api-key` reads a key from stdin and stores it on disk, which the workflow avoids. OpenAI's documentation says `CODEX_API_KEY` is supported by `codex exec` and warns against setting the key at job level in a job that runs repository code ([non-interactive mode](https://developers.openai.com/codex/noninteractive)); the workflow sets it on one step only.
- OpenAI also publishes a GitHub Action for Codex. It is not used: it is not a GitHub-created action, and the Actions policy of this repository does not allow it.

**To verify on the first real run:** that `-c sandbox_workspace_write.network_access=true` is accepted and lets `npm` reach the registry inside the sandbox; that Codex's own sandbox starts inside a Docker container (if not, the fallback is `--dangerously-bypass-approvals-and-sandbox`, whose help text says it is intended for externally sandboxed environments, which the throwaway container is); that `codex exec` honors `AGENTS.md` and the kickoff prompt; that the GitHub App token option names of `actions/create-github-app-token` match (`app-id`, `private-key`, `owner`, `repositories`); that a `container.image` can come from the `vars` context; and the cost and duration of a real stage.

## Not in this phase

- **Follow-up runs on an existing PR** (continuation mode, with `.agent/review.md`): a separate change, because it runs project code next to the model key and needs its own review.
- Reviewer agents, the orchestrator and iteration branches (phase 3).
- The Figma MCP server in CI. Stages that need `figma-read` or `figma-write` stay in vendor environments.
