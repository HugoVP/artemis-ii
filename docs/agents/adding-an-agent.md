# Running an agent in the pipeline

How the `agent-run` workflow runs an agent on a stage, how Hugo sets it up, and how to add another agent. The design and its threat model are in [`docs/MULTI-AGENT-PHASES.md`](../MULTI-AGENT-PHASES.md) ("Phase 2"). The vendor environments keep working: the pipeline is one more way to start a stage.

## Files

| File | What it is |
| --- | --- |
| `agents/registry.yaml` | The agents the pipeline can run: id, model key secret (or `auth: federation`), how it starts, capabilities |
| `scripts/anthropic-oidc.ts`, `docs/agents/workflows/claude-wif-smoke.yml` | Keeps a fresh GitHub OIDC token in a file for Claude Code's workload identity federation; the manual smoke that tests it ([`claude-code-wif.md`](claude-code-wif.md)) |
| `docs/agents/workflows/agent-run.yml` | Proposed workflow. Hugo copies it to `.github/workflows/agent-run.yml` |
| `docs/agents/workflows/agent-runner-image.yml` | Proposed workflow that builds and publishes the runner image. Hugo copies it too |
| `Dockerfile`, target `agent-runner` | The CI toolchain plus pinned Codex, Claude Code and OpenCode CLIs, Claude Code's shell sandbox, and the root-owned OpenCode launcher |
| `scripts/opencode-runner.ts`, `scripts/opencode-smoke-fixture.ts` | OpenCode headless launch with private output handling, and the fixed manual smoke fixture |
| `scripts/figma-mcp-gateway.ts` | The run's Figma MCP gateway: holds the access token and forwards only the stage's tools, on the design file only ("Figma in the pipeline") |
| `scripts/figma-mcp-token.ts`, `scripts/figma-mcp-credentials.ts` | Exchange the refresh token for an access token and replace the run's token at the end; extract the one-time grant on Hugo's machine |
| `scripts/agent-checks.ts` | The checks of `prepare`, `work` and `publish`, with unit tests in `scripts/agent-checks.test.ts` and `scripts/agent-workflows.test.ts` |

For agent connections without workflow-write access, the proposed workflows live in `docs/agents/workflows/` and Hugo copies them. Copy them again whenever they change. The ChatGPT Codex Connector has accepted workflow writes; `docs/DELIVERY.md` records that capability and uses a separate approval App with a source-bound required status. The publisher App below is distinct from that status-only approval App and never receives its key.

## Setup (Hugo)

1. **GitHub App**, only for his account, installed only on this repository, no webhook. Permissions: Contents, Pull requests and Issues (read and write) and Metadata (read). Nothing else; in particular no Checks, which belongs to phase 3.
2. **Environment `agents`**, restricted to `main`, with the variable `AGENT_APP_ID` and the secrets `AGENT_APP_PRIVATE_KEY` and `AGENT_KEY_<ID>` (one per agent that uses a static key: `AGENT_KEY_CODEX` for Codex). Claude Code has no key: it signs in with workload identity federation, with four id secrets in the same environment ([`claude-code-wif.md`](claude-code-wif.md)). Each model key is a dedicated key with a spending limit set in the provider's console (OpenAI: a project with a budget; Anthropic: a workspace with a spend limit in the Claude Console). For stages that use Figma, the three `FIGMA_MCP_*` secrets ("Figma in the pipeline").
3. **Repository variable `AGENT_TRUSTED_LOGIN`** with Hugo's GitHub login. Only this login can start a run. For stages that use Figma, also the repository variable `FIGMA_FILE_URL`, with the same link as in the Claude Code environment: the Figma gateway takes the design file's key from it and refuses every other file.
4. **Labels** `agent-task` (already used by work orders), `agent-authored` and `needs-hugo`. Create one `agent:<id>` label per agent: `agent:codex` and `agent:claude`.
5. **Copy the workflows** from `docs/agents/workflows/` to `.github/workflows/` and merge that change. This includes `agent-sandbox-smoke.yml`, which tests the nested sandbox on pipeline changes without credentials. The Actions policy of the repository allows only GitHub-created actions pinned by SHA, which these files respect.
6. **Publish the runner image.** Run the workflow "Agent runner image" by hand (or merge a change to `Dockerfile`). Its job summary prints the image reference with its digest. Save it as the repository variable `AGENT_RUNNER_IMAGE`. Packages of a public repository are private by default: the run pulls the image with the workflow token, which can read it when the package is linked to this repository (**to verify** on the first run; otherwise make the package public in its settings).
7. **First test:** add the label `agent:codex` to the `Run Stage NN` issue of a small stage, or start "Agent run" by hand with the stage number. Compare the PR with one from a vendor environment.

## What a run does

1. `prepare` checks that the label (or the manual start) comes from `AGENT_TRUSTED_LOGIN`, that the issue title is `Run Stage NN: …`, that no stage PR is open, that NN is the stage to run (the first one not approved; an earlier stage in review whose PR is not merged stops the run), and that the agent has the capabilities the stage needs.
2. `work` runs the agent in the runner image with its model key and a read-only token. The image runs as a `docker run` container started by the job, as the runner's user and with no added privileges, that sees only the workspace (with `.git` read-only), not the Docker socket or the runner's folders. The job's own steps run on the runner and never run project code: `npm ci` runs in the container too. The agent edits files on the branch `agent/stage-NN-<id>` and writes `.agent/pr-title.txt` and `.agent/pr-body.md`; a trusted step then makes one commit (the Codex sandbox keeps `.git` read-only). The job scans every new commit and blob (binary ones too) and uploads the result as an artifact kept 7 days.
3. `publish` checks the artifact again with scripts from `main` (destination ref, protected paths with no rename detection, secret scan of all new objects, PR text), pushes the branch with a short-lived App token, opens the PR with the label `agent-authored` (as a draft, with a warning, if it touches protected paths or the agent wrote `.agent/draft-reason.txt` because it was blocked), adds the PR link to `docs/PLAN.md` and comments on the work order.
4. A failure after `prepare` comments on the work order and adds the label `needs-hugo`.

A result that touches `.github/workflows/**` or contains secret-like text is rejected, not drafted.

## Adding an agent

1. Add an entry to `agents/registry.yaml`. `key_secret` must look like `AGENT_KEY_<ID>`: the checks refuse any other secret name. The only exception is `auth: federation` (no `key_secret`), which only the runner `claude-print` supports.
2. Add its CLI to the `agent-runner` target of the `Dockerfile`, with a pinned version.
3. Add a branch for its `runner` value to the script that "Run the agent" in `agent-run.yml` passes to the container. It must be headless, take its key from the variable that step passes, and write nothing to GitHub. For Figma, point its MCP client at the gateway (`http://figma-gateway:8787/mcp`) with no credentials.
4. Document in `docs/agents/other-agents.md` how the headless mode and its authentication were verified, and update the "Known agents" table in `README.md`.
5. Create the secret `AGENT_KEY_<ID>` in the environment `agents` and the label `agent:<id>`.

## Verified for Codex

The 2026-10-19 Stage 04 pipeline run completed work, Figma gateway startup, token replacement and publication of PR #31. The stage itself still requires code and visual review. OpenCode's setup and the remaining owner checks are in [`opencode.md`](opencode.md).

Checked on 2026-10-17 with `@openai/codex` 0.163.0 installed from npm (`codex exec --help`, `codex login --help` and the strings of the binary), not with a real run:

- `codex exec [PROMPT]` runs non-interactively. Options used: `--sandbox workspace-write`, `--ephemeral` (no session files) and `--color never`. `--output-last-message <file>` is not used: the CLI writes it as itself, outside the command sandbox, so an agent-chosen path could point at a trusted file. `--json` prints events as JSONL, which we do not upload.
- Authentication: `CODEX_API_KEY` (and `OPENAI_API_KEY`) are read from the environment; `codex login --with-api-key` reads a key from stdin and stores it on disk, which the workflow avoids. OpenAI's documentation says `CODEX_API_KEY` is supported by `codex exec` and warns against setting the key at job level in a job that runs repository code ([non-interactive mode](https://developers.openai.com/codex/noninteractive)); the workflow sets it on one step only.
- OpenAI also publishes a GitHub Action for Codex. It is not used: it is not a GitHub-created action, and the Actions policy of this repository does not allow it.

**First live run (2026-10-18):** Codex reached OpenAI and connected to the Figma gateway, but its first shell command failed because Docker's default seccomp profile denied the namespace creation used by `bwrap`. The agent made no changes. The work job uses Ubuntu 22.04 because the current `ubuntu-latest` runner refused to write the nested user namespace's UID map even with an otherwise permissive container profile. The agent container uses two bounded profiles: `agents/agent-seccomp.json` starts from [Moby's default seccomp profile at `4b8214f`](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/seccomp/default.json) and permits `clone` only with `CLONE_NEWUSER`, plus `unshare`, `mount`, `umount2` and `pivot_root`; `agents/agent-apparmor.profile` starts from [Moby's default AppArmor profile at the same commit](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/apparmor/testdata/default.golden) and permits `mount` and `pivot_root`. The work job copies both profiles from the trusted default-branch checkout before `npm ci`; it loads AppArmor from that copy and never mounts either file into the agent container. The container remains non-root, with all capabilities dropped, no new privileges, no Docker socket and `.git` read-only. `Agent sandbox smoke` builds the image on Ubuntu 22.04 and verified both `bwrap` and `codex sandbox` without model or Figma credentials. The Codex sandbox remains required; do not switch to `--dangerously-bypass-approvals-and-sandbox`. Revisit the runner pin before Ubuntu 22.04 reaches end of support.

**Remaining owner checks:** Stage 04's visual acceptance against Figma, review of PR #31, and whether duration and usage are acceptable for future stages. The successful run demonstrates project command execution and PR publication; it does not establish compliance for every future task.

## Verified for Claude Code

Authentication in the pipeline is workload identity federation, not an API key: see [`claude-code-wif.md`](claude-code-wif.md). The `ANTHROPIC_API_KEY` bullet below describes the static-key mode that the registry can still select.

Checked on 2026-10-17 against Claude Code's documentation (code.claude.com: headless mode, MCP, permissions, permission modes, sandboxing) and the CLI help of version 2.1.302, not with a real run:

- `claude -p "<prompt>"` runs one prompt non-interactively and reads `ANTHROPIC_API_KEY` from the environment ("In non-interactive mode (`-p`), the key is always used when present"). It loads `CLAUDE.md`, which imports `AGENTS.md`.
- `--permission-mode dontAsk`: "anything that would prompt is denied", so only the tools in `--allowedTools` run. The workflow allows reading and editing files, `npm`, `npx`, `node`, read-only `git` and the Figma tools of the stage. `--dangerously-skip-permissions` is not used (it also refuses to run as root).
- `--mcp-config <file> --strict-mcp-config`: only the run's Figma gateway is loaded, from a file the workflow writes with the gateway's address and no credentials.
- Shell commands run in Claude Code's sandbox (bubblewrap and socat, installed in the image), with `failIfUnavailable` so the run stops instead of running unsandboxed, and `allowUnsandboxedCommands: false` so a command cannot ask to leave the sandbox. The sandbox's network is limited to the npm registry and the NASA domains of `docs/SETUP.md`; web pages for curation and text stages go through Claude Code's `WebFetch` and `WebSearch` tools. In an unprivileged container the docs say bubblewrap needs `enableWeakerNestedSandbox`; the container is the outer boundary. The sandbox covers shell commands only, so the file tools may edit and write only inside the workspace (`Edit(//work/**)`, `Write(//work/**)`), and never in `.git`, which is also mounted read-only.
- `--no-session-persistence`: no transcript is saved to disk.

**To verify on the first real run:** that the sandbox starts in the container with the weaker nested mode; that the permission rules with an absolute path (`Edit(//work/**)`) allow edits in the workspace and nowhere else; that the allowed `Bash(...)` patterns are enough for `npm run check`, `npm run build` and `npm run test`; that a sandboxed shell download from a NASA domain works and one from another domain is refused; and cost and duration.

## Figma in the pipeline

Agents in the pipeline use Figma's own MCP server (`https://mcp.figma.com/mcp`), as Claude Code and Codex do on a desktop, but through a gateway of the pipeline that holds the token and limits them to the design file and the tools of the stage.

**How the server authenticates (checked 2026-10-17).** It does not accept personal access tokens: Figma's support and staff have said so on its forum ([thread](https://forum.figma.com/suggest-a-feature-11/support-for-pat-personal-access-token-based-auth-in-figma-remote-mcp-47465)), and tests by users with `Authorization: Bearer <PAT>` and `X-Figma-Token` get `Unauthorized`. It accepts OAuth access tokens issued to clients on Figma's approved list, which includes Codex and Claude Code ([Figma's guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)); registering any other client is refused. An access token is an ordinary bearer token: once issued, any MCP client can send it in an `Authorization` header, with no browser. So a person signs in once with an approved client, and the pipeline keeps that grant.

**How the pipeline uses it: the gateway.** The agent never gets a Figma credential. It talks to a small MCP server of our own, `scripts/figma-mcp-gateway.ts`, which holds the token and forwards to Figma only what the stage may do.

1. Hugo obtains a complete grant using an approved client that preserves its registration secret (see the bootstrap blocker below). The grant's client id, client secret and refresh token become secrets of the environment `agents`.
2. For stages that need `figma-read` or `figma-write`, the step "Start the Figma MCP gateway" runs the gateway from the trusted copy of `main`'s scripts, on the runner itself, after the project's dependencies are installed (so their install scripts never find it running) and before the agent starts. It exchanges the refresh token for the run's access token, removes the secrets from its environment and keeps the token in memory. It listens on the address of Docker's bridge, so only containers on the runner reach it.
3. The agent runs in its own container, which reaches the gateway as `http://figma-gateway:8787/mcp`, with no `Authorization` header. The container has no Docker socket and does not see the runner's folders or processes, so the agent cannot read the gateway's token, its environment or its secrets.
4. The gateway checks every message:
   - **Tools of the stage only:** `get_metadata`, `get_screenshot`, `get_variable_defs` and `get_design_context`, plus `use_figma` for `figma-write` stages. Everything else is blocked, including `whoami` (it shows Hugo's teams and plans), `create_new_file` and any tool Figma adds later. `tools/list` is filtered, so the agent only sees the tools it may use. The agent's client gets the same list (`enabled_tools` for Codex, `--allowedTools` for Claude Code) as a second layer.
   - **The design file only:** each call's `fileKey` must be the key of `FIGMA_FILE_URL`, and no argument may name another file, plan, team or project, or link to another Figma file (branches included).
   - **Protocol:** only the methods an MCP client needs; Figma's skills can be read as `skill://` resources; prompts, sampling, roots and batches are refused; the server cannot ask the agent's client for anything.
   - **A limit of 150 tool calls per run**, so a looping agent cannot spend the account's daily quota.
   - **Its own name only:** requests must be addressed to `figma-gateway`, and requests from a browser (`Origin`) are refused.
   Blocked calls get an error that says why, so the agent can explain it in the PR.
5. The gateway logs each decision (method, tool, node id, allowed or blocked, status), never the arguments, the code or the token. The step "Stop the Figma MCP gateway" stops it right after the agent and prints that log in the job.
6. A separate job, `figma-revoke`, on a fresh runner with a clean checkout of `main`, runs `scripts/figma-mcp-token.ts revoke`: it refreshes once more and so replaces the token the gateway had. Figma keeps one access token per app and user, so the old one stops working (**to verify** for MCP grants; documented for Figma's OAuth apps). It runs even when the `work` job failed or was cancelled.

**What remains possible.** Inside the design file, a `figma-write` stage can change anything through `use_figma`: that is its job, and Figma's version history can undo it. The token itself still carries the permissions of the account that signed in, but only the gateway holds it, and it stops working at the end of the run. For a second layer, sign in with a Figma account that only has access to the design file (it needs a Dev or Full seat: View and Collab seats get 6 tool calls a month).

**Rate limits.** Figma's MCP server allows up to 200 tool calls a day, and around 10 a minute, for a Dev or Full seat on a Professional or Organization plan; Starter plans and View or Collab seats get 6 a month ([rate limits and access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/), checked 2026-10-17). A stage uses a few dozen calls.

**Bootstrap blocker observed on 2026-10-18.** A successful Codex browser login did not produce a renewable grant for this pipeline. Runs `39144193897` and `39146849604` failed before the agent started: Figma rejected refresh with HTTP 400 because the client secret was absent. Figma's [authorization-server metadata](https://api.figma.com/.well-known/oauth-authorization-server) advertises `client_secret_basic` and `client_secret_post`, not `none`. The original secret must belong to the same registration as the client id and refresh token; an unrelated app's secret cannot repair this grant.

Codex's inspected [credential snapshot](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/oauth.rs) stores the client id and tokens but has no field for the dynamically registered client secret; [Codex issue #43216](https://github.com/openai/codex/issues/43216) tracks that persistence gap. The missing secret cannot be reconstructed from a refresh token. Do not repeat `codex mcp login` on the same unverified client version and assume renewal is fixed. There is currently **no verified bootstrap from the stock Codex credential file used in these runs**. A supported client must preserve and export the complete registration, or its persistence implementation must first be fixed. Do not impersonate another catalog client, switch to a PAT, hand the agent a static access token, or disable the token-replacement job to bypass this blocker.

**Resolved with Claude Code, 2026-10-18.** Hugo obtained a complete grant with an isolated Claude Code profile (`CLAUDE_CONFIG_DIR` pointing at a folder of its own, the steps in "Setup" below), after the stock Codex CLI profile did not provide the client secret. He ran the local presence check and wrote the three secrets from that one file; the secrets of the environment `agents` were all created within three seconds of each other at 17:08 UTC (names and dates only; no values were read). The `Agent run` of 2026-10-19 17:55 UTC (Stage 04, `agent=codex`) then printed `Figma MCP gateway ready` and completed, including the `figma-revoke` job. So the remote builder can stay Codex while Claude Code obtains the grant. Versions installed on 2026-10-19: Claude Code 2.1.296 and Codex CLI 0.162.1; the versions at sign-in time were not recorded.

Not verified yet: that the stored grant still works on a second run after the first run's token replacement (only one successful run exists), and that later Claude Code versions keep the same credential file layout. Do not assume either; the local check below stays decisive.

**Setup (Hugo, once a complete grant is available)**

Requirements: Node 22.22 or later, `gh` signed in, and an approved Figma MCP client that preserves the complete OAuth registration. Account sign-in and GitHub secrets remain Hugo's work; never send the credential file to an agent.

1. Use an isolated client profile for the pipeline, separate from everyday Figma use. Confirm that its exporter retains the client id, original client secret and refresh token for `https://mcp.figma.com/mcp`. A REST OAuth app is not automatically an approved MCP client. If any field is absent, stop; a browser-login success alone is insufficient.
   **Bootstrap client on Hugo's Windows machine: Claude Code (worked on 2026-10-18, see "Resolved with Claude Code" above).** This changes only who obtains the Figma grant; the remote stage can still run with `agent=codex`. Figma documents [Claude Code's manual OAuth setup](https://help.figma.com/hc/en-us/articles/39888612464151-Claude-Code-and-Figma-Set-up-the-MCP-server). The official `@anthropic-ai/claude-code` 2.1.0 distribution's `saveClientInformation` implementation persists `clientId`, `clientSecret` and `serverUrl` in `mcpOAuth`, and the installed client produced a grant the pipeline accepted. Use the current official client already installed, and make the local check below decisive rather than downgrading or assuming the storage shape is unchanged.

   In Git Bash, create an isolated profile and add Figma without editing the repository:
   ```bash
   FIGMA_AUTH_DIR="$HOME/.claude-artemis-figma-pipeline"
   mkdir -p "$FIGMA_AUTH_DIR"
   CLAUDE_CONFIG_DIR="$FIGMA_AUTH_DIR" claude mcp add --scope user --transport http figma-pipeline https://mcp.figma.com/mcp
   (
     cd "$FIGMA_AUTH_DIR"
     CLAUDE_CONFIG_DIR="$FIGMA_AUTH_DIR" claude
   )
   ```
   In the interactive client, finish any account setup it requires, enter `/mcp`, select `figma-pipeline`, select **Authenticate**, and allow access in Figma's browser page. Exit the client after authentication; no model task is needed. On Windows the candidate credential file is `$FIGMA_AUTH_DIR/.credentials.json`. If it is absent or lacks the registration secret, stop and report only the client version and sanitized error. Do not copy an everyday profile or export the full account credential store.

2. From the updated repository clone in Git Bash, check the file locally, without printing any field:
   ```bash
   FIGMA_GRANT="$FIGMA_AUTH_DIR/.credentials.json"
   node scripts/figma-mcp-credentials.ts "$FIGMA_GRANT" check
   ```
   This checks field presence and Figma-server binding only. It does **not** prove Figma accepts the grant, that MCP works or that token replacement invalidates an old token. On failure, share only the sanitized error and client version, never the file.
3. Only after the check succeeds, store all three fields from that same file in `agents`. Run the whole subshell; it checks again before any secret is written and stops if a command fails:
   ```bash
   (
     set -euo pipefail
     node scripts/figma-mcp-credentials.ts "$FIGMA_GRANT" check
     for FIELD in client_id client_secret refresh_token; do
       node scripts/figma-mcp-credentials.ts "$FIGMA_GRANT" "$FIELD" |
         gh secret set "FIGMA_MCP_${FIELD^^}" --repo HugoVP/artemis-ii --env agents
     done
   )
   ```
   Never mix fields from different registrations. Do not omit `FIGMA_MCP_CLIENT_SECRET` or upload empty placeholder values.
4. Confirm repository variable `FIGMA_FILE_URL` matches `docs/specs/design.md`. When the next `pending` stage in `docs/PLAN.md` is one that needs `figma-read` or `figma-write` (with no stage PR open and its `Run Stage <NN>` work-order issue available, since `prepare` refuses any other stage or an open stage PR), start one run with `gh workflow run agent-run.yml --repo HugoVP/artemis-ii --ref main -f stage=<NN> -f agent=codex` (or add `agent:codex` to that work-order issue). The gateway must say `Figma MCP gateway ready`, the agent must make an allowed call with an upstream success, and the separate token-replacement job must succeed. If any fails, stop before another run and inspect the sanitized error.
5. Delete only the isolated local credential profile after successful setup. Removing the local file does not revoke the grant on Figma's side. Keep the installed workflow and `docs/agents/workflows/agent-run.yml` coherent when workflow changes are required.

To revoke the grant: Figma → **Settings** → **Security** → connected apps, remove the entry of the client that obtained the grant (the one used to sign in, whichever agent runs the stages), and delete the three secrets.

**To verify on the first run that needs Figma:** where Codex stores its MCP credentials with `mcp_oauth_credentials_store=file` (the helper searches the file by field name); that refresh tokens of MCP grants can be reused, as Figma documents for OAuth apps (if a run prints "Figma returned a new refresh token", the stored one must be updated after every run, which this setup cannot do); the lifetime of the access token; that the agent's container reaches the gateway through `host-gateway` (the run stops with "cannot reach the Figma MCP gateway" if not); that Figma's server accepts the gateway's requests and that its tool and argument names still match the gateway's lists (the gateway's log shows each decision); that Codex accepts the tool list in `enabled_tools`; and that both clients connect to the gateway over plain HTTP.

## Not in this phase

- **Follow-up runs on an existing PR** (continuation mode, with `.agent/review.md`): a separate change, because it runs project code next to the model key and needs its own review.
- Reviewer agents, the orchestrator and iteration branches (phase 3).
