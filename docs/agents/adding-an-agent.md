# Running an agent in the pipeline

How the `agent-run` workflow runs an agent on a stage, how Hugo sets it up, and how to add another agent. The design and its threat model are in [`docs/MULTI-AGENT-PHASES.md`](../MULTI-AGENT-PHASES.md) ("Phase 2"). The vendor environments keep working: the pipeline is one more way to start a stage.

## Files

| File | What it is |
| --- | --- |
| `agents/registry.yaml` | The agents the pipeline can run: id, model key secret, how it starts, capabilities |
| `docs/agents/workflows/agent-run.yml` | Proposed workflow. Hugo copies it to `.github/workflows/agent-run.yml` |
| `docs/agents/workflows/agent-runner-image.yml` | Proposed workflow that builds and publishes the runner image. Hugo copies it too |
| `Dockerfile`, target `agent-runner` | The CI toolchain plus the pinned agent CLIs (Codex and Claude Code) and Claude Code's shell sandbox |
| `scripts/figma-mcp-token.mjs`, `scripts/figma-mcp-credentials.mjs` | Issue and replace the run's Figma MCP access token; extract the one-time grant on Hugo's machine ("Figma in the pipeline") |
| `scripts/agent-checks.mjs` | The checks of `prepare`, `work` and `publish`, with unit tests in `scripts/agent-checks.test.mjs` and `scripts/agent-workflows.test.mjs` |

Agents cannot push to `.github/workflows/`, so the workflows live in `docs/agents/workflows/` and Hugo copies them. Copy them again whenever they change.

## Setup (Hugo)

1. **GitHub App**, only for his account, installed only on this repository, no webhook. Permissions: Contents, Pull requests and Issues (read and write) and Metadata (read). Nothing else; in particular no Checks, which belongs to phase 3.
2. **Environment `agents`**, restricted to `main`, with the variable `AGENT_APP_ID` and the secrets `AGENT_APP_PRIVATE_KEY` and `AGENT_KEY_<ID>` (one per agent: `AGENT_KEY_CODEX` for Codex, `AGENT_KEY_CLAUDE` for Claude Code). Each model key is a dedicated key with a spending limit set in the provider's console (OpenAI: a project with a budget; Anthropic: a workspace with a spend limit in the Claude Console). For stages that use Figma, the three `FIGMA_MCP_*` secrets ("Figma in the pipeline").
3. **Repository variable `AGENT_TRUSTED_LOGIN`** with Hugo's GitHub login. Only this login can start a run.
4. **Labels** `agent-task` (already used by work orders), `agent-authored` and `needs-hugo`. Create one `agent:<id>` label per agent: `agent:codex` and `agent:claude`.
5. **Copy the two workflows** from `docs/agents/workflows/` to `.github/workflows/` and merge that change. The Actions policy of the repository allows only GitHub-created actions pinned by SHA, which these files respect.
6. **Publish the runner image.** Run the workflow "Agent runner image" by hand (or merge a change to `Dockerfile`). Its job summary prints the image reference with its digest. Save it as the repository variable `AGENT_RUNNER_IMAGE`. Packages of a public repository are private by default: the run pulls the image with the workflow token, which can read it when the package is linked to this repository (**to verify** on the first run; otherwise make the package public in its settings).
7. **First test:** add the label `agent:codex` to the `Run Stage NN` issue of a small stage, or start "Agent run" by hand with the stage number. Compare the PR with one from a vendor environment.

## What a run does

1. `prepare` checks that the label (or the manual start) comes from `AGENT_TRUSTED_LOGIN`, that the issue title is `Run Stage NN: …`, that no stage PR is open, that NN is the stage to run (the first one not approved; an earlier stage in review whose PR is not merged stops the run), and that the agent has the capabilities the stage needs.
2. `work` runs the agent in the runner image with its model key and a read-only token. The agent edits files on the branch `agent/stage-NN-<id>` and writes `.agent/pr-title.txt` and `.agent/pr-body.md`; a trusted step then makes one commit (the Codex sandbox keeps `.git` read-only). The job scans every new commit and blob (binary ones too) and uploads the result as an artifact kept 7 days.
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

- `codex exec [PROMPT]` runs non-interactively. Options used: `--sandbox workspace-write`, `--ephemeral` (no session files) and `--color never`. `--output-last-message <file>` is not used: the CLI writes it as itself, outside the command sandbox, so an agent-chosen path could point at a trusted file. `--json` prints events as JSONL, which we do not upload.
- Authentication: `CODEX_API_KEY` (and `OPENAI_API_KEY`) are read from the environment; `codex login --with-api-key` reads a key from stdin and stores it on disk, which the workflow avoids. OpenAI's documentation says `CODEX_API_KEY` is supported by `codex exec` and warns against setting the key at job level in a job that runs repository code ([non-interactive mode](https://developers.openai.com/codex/noninteractive)); the workflow sets it on one step only.
- OpenAI also publishes a GitHub Action for Codex. It is not used: it is not a GitHub-created action, and the Actions policy of this repository does not allow it.

**To verify on the first real run:** that `-c sandbox_workspace_write.network_access=true` is accepted and lets `npm` reach the registry inside the sandbox; that Codex's own sandbox starts inside a Docker container, and which directories it leaves writable (the trusted copy of the scripts must not be among them). The sandbox is required: if it cannot start, the run fails and is escalated. Do not switch to `--dangerously-bypass-approvals-and-sandbox`: Docker isolates the host, not the trusted steps from the agent inside the same job, and the scan before the upload would no longer be trustworthy. A setup without the sandbox needs the checking and the upload moved to a place the agent cannot write, which is a separate design; that `codex exec` honors `AGENTS.md` and the kickoff prompt; that the GitHub App token option names of `actions/create-github-app-token` match (`app-id`, `private-key`, `owner`, `repositories`); that a `container.image` can come from the `vars` context; and the cost and duration of a real stage.

## Verified for Claude Code

Checked on 2026-10-17 against Claude Code's documentation (code.claude.com: headless mode, MCP, permissions, permission modes, sandboxing) and the CLI help of version 2.1.302, not with a real run:

- `claude -p "<prompt>"` runs one prompt non-interactively and reads `ANTHROPIC_API_KEY` from the environment ("In non-interactive mode (`-p`), the key is always used when present"). It loads `CLAUDE.md`, which imports `AGENTS.md`.
- `--permission-mode dontAsk`: "anything that would prompt is denied", so only the tools in `--allowedTools` run. The workflow allows reading and editing files, `npm`, `npx`, `node`, read-only `git` and the Figma tools of the stage. `--dangerously-skip-permissions` is not used (it also refuses to run as root).
- `--mcp-config <file> --strict-mcp-config`: only the Figma server of the run is loaded, from a file the workflow writes with the `Authorization` header and deletes afterwards.
- Shell commands run in Claude Code's sandbox (bubblewrap and socat, installed in the image), with `failIfUnavailable` so the run stops instead of running unsandboxed. In an unprivileged container the docs say bubblewrap needs `enableWeakerNestedSandbox`; the container is the outer boundary. The sandbox covers shell commands only, so the file tools are denied writes to the runner's temporary folder, where the trusted copies live.
- `--no-session-persistence`: no transcript is saved to disk.

**To verify on the first real run:** that the sandbox starts in the container with the weaker nested mode; that the permission rules with an absolute path (`Edit(//<temp>/**)`) deny writes there; that the allowed `Bash(...)` patterns are enough for `npm run check`, `npm run build` and `npm run test`; and cost and duration.

## Figma in the pipeline

Agents in the pipeline use Figma's own MCP server (`https://mcp.figma.com/mcp`), as Claude Code and Codex do on a desktop.

**How the server authenticates (checked 2026-10-17).** It does not accept personal access tokens: Figma's support and staff have said so on its forum ([thread](https://forum.figma.com/suggest-a-feature-11/support-for-pat-personal-access-token-based-auth-in-figma-remote-mcp-47465)), and tests by users with `Authorization: Bearer <PAT>` and `X-Figma-Token` get `Unauthorized`. It accepts OAuth access tokens issued to clients on Figma's approved list, which includes Codex and Claude Code ([Figma's guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)); registering any other client is refused. An access token is an ordinary bearer token: once issued, any MCP client can send it in an `Authorization` header, with no browser. So a person signs in once with an approved client, and the pipeline keeps that grant.

**How the pipeline uses it**

1. Hugo signs in once with Codex on his machine (below). The grant's client id and refresh token become secrets of the environment `agents`.
2. For stages that need `figma-read` or `figma-write`, a trusted step runs `scripts/figma-mcp-token.mjs` before any project code: it exchanges the refresh token for a fresh access token. The refresh token never leaves that step.
3. The agent step gets the access token only. Codex reads it through `bearer_token_env_var`; Claude Code through an MCP config file with an `Authorization` header. Both see only the read tools (`get_metadata`, `get_screenshot`, `get_variable_defs`, `get_design_context`, `whoami`), plus `use_figma` in stages that need `figma-write`.
4. At the end, `revoke` refreshes once more, which replaces the token the agent had: Figma keeps one access token per app and user, so the old one stops working (**to verify** for MCP grants; documented for Figma's OAuth apps).

**What the agent can reach.** The access token carries Hugo's Figma permissions while the run lasts: every file his account can open, for reading, and for writing through `use_figma`. The tool lists limit what the agent's MCP client offers, not what the token allows. `AGENTS.md` restricts edits to the file in `FIGMA_FILE_URL`. To make it a hard limit, sign in with a separate Figma account that only has access to the design file (it needs a Dev or Full seat: View and Collab seats get 6 tool calls a month).

**Rate limits.** Figma's MCP server allows up to 200 tool calls a day, and around 10 a minute, for a Dev or Full seat on a Professional or Organization plan; Starter plans and View or Collab seats get 6 a month ([rate limits and access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/), checked 2026-10-17). A stage uses a few dozen calls.

**Setup (Hugo, once)**

Requirements: Codex CLI and Node 22 on your machine, the `gh` CLI signed in to GitHub, and a clone of this repository with this change merged.

1. Sign in with Codex in a folder of its own, so this grant is not shared with your everyday Codex (Git Bash):
   ```
   export CODEX_HOME="$HOME/.codex-figma-pipeline"
   mkdir -p "$CODEX_HOME"
   codex mcp add figma --url https://mcp.figma.com/mcp
   codex -c mcp_oauth_credentials_store=file mcp login figma
   ```
   A browser window opens: sign in with the Figma account the agents should use and allow access.
2. Store the grant as secrets of the environment `agents`, straight from the file, without showing them:
   ```
   F="$CODEX_HOME/.credentials.json"
   node scripts/figma-mcp-credentials.mjs "$F" client_id | gh secret set FIGMA_MCP_CLIENT_ID --env agents
   node scripts/figma-mcp-credentials.mjs "$F" refresh_token | gh secret set FIGMA_MCP_REFRESH_TOKEN --env agents
   node scripts/figma-mcp-credentials.mjs "$F" client_secret | gh secret set FIGMA_MCP_CLIENT_SECRET --env agents
   ```
   The last line may say there is no client secret: that is normal for Codex, skip it. If the first line says it cannot find the grant, the credentials file of your Codex version has another name or layout; send the error (not the file).
3. The first run of a stage that needs Figma checks it: its step "Get a Figma MCP access token" must say "Figma MCP token issued".
4. Delete the local folder: `rm -r "$HOME/.codex-figma-pipeline"`. The grant stays valid on Figma's side.
5. Copy the updated `agent-run.yml` from `docs/agents/workflows/` to `.github/workflows/`.

To revoke the grant: Figma → **Settings** → **Security** → connected apps, remove the Codex entry, and delete the three secrets.

**To verify on the first run that needs Figma:** where Codex stores its MCP credentials with `mcp_oauth_credentials_store=file` (the helper searches the file by field name); that refresh tokens of MCP grants can be reused, as Figma documents for OAuth apps (if a run prints "Figma returned a new refresh token", the stored one must be updated after every run, which this setup cannot do); the lifetime of the access token; that Codex accepts the tool list in `enabled_tools`; and that Claude Code's MCP config file with the `Authorization` header connects.

## Not in this phase

- **Follow-up runs on an existing PR** (continuation mode, with `.agent/review.md`): a separate change, because it runs project code next to the model key and needs its own review.
- Reviewer agents, the orchestrator and iteration branches (phase 3).
