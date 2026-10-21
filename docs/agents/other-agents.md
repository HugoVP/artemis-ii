# Other agents

How to run a stage with an agent other than Claude Code. The verification status of each environment is recorded in `README.md`; a successful CLI test does not certify every model or vendor environment.

## What any agent needs

- Read access to `AGENTS.md` (most agents read it natively; otherwise tell the agent to read it first).
- A sandbox with git, Node.js 22, npm and headless Chromium, and network access to the domains in `docs/SETUP.md`.
- Permission to push branches and open PRs on the repository.
- Only the environment variables listed in `AGENTS.md`.
- For design work: an MCP client connected to the Figma MCP server, with access to the file in `FIGMA_FILE_URL`.

## Starting a stage

1. Make sure no stage PR is open and the previous one is merged. The merge opens the work-order issue `Run Stage NN: <name>` (label `agent-task`); it carries the kickoff prompt below.
2. Start a task on this repository with the kickoff prompt (copy it from the issue):

   > Read AGENTS.md and follow docs/agents/next-stage.md.

3. The agent opens a PR titled `Stage NN: <name>`, with the agent named in the PR body and `Closes #<work-order issue>`.

Automatic chaining (start the next stage on merge) is set up per runner. For Claude Code it is the routine in `claude-code.md`. For other runners, the work-order issue is the trigger: Hugo hands it to the agent he chooses (for example by mentioning the agent in the issue if it has a GitHub integration, to verify, or by pasting the prompt into its own interface).

## OpenAI Codex

The CLI pipeline completed the Stage 04 builder run and opened PR #31 on 2026-10-19; the stage remains under review. The vendor-cloud setup below is a separate environment and remains unverified. Unless stated otherwise, "Confirmed" below means found in documentation or guides on 2026-10-12.

**Confirmed**

- Reads `AGENTS.md` natively, and for GitHub reviews reads a `## Code Review Rules` section in the nearest `AGENTS.md` (we have one at the root).
- Cloud environments run a setup script with internet access; afterwards the agent has no internet unless a domain allowlist is configured. Environment variables are visible to the agent; secrets only to the setup script ([environments](https://developers.openai.com/codex/cloud/environments), [internet access](https://developers.openai.com/codex/cloud/agent-internet)).
- The Codex CLI and IDE extension support MCP servers (stdio and Streamable HTTP, with OAuth through `codex mcp login`) ([MCP](https://developers.openai.com/codex/mcp)). Figma's remote MCP server only accepts approved clients, and a user report lists Codex among them.
- The CLI has a `/review` command that reviews the changes against a base branch.
- Figma lists Codex among the clients of its MCP server, which signs in with OAuth in a browser and does not accept personal access tokens. The pipeline reuses one such sign-in through a gateway that holds the token and limits the agent to the design file and the stage's tools (see "Figma in the pipeline" in `docs/agents/adding-an-agent.md`).
- Headless use in the pipeline (`codex exec`, authentication with `CODEX_API_KEY`) was checked against the CLI's own help on 2026-10-17; the details and what is still to verify are in `docs/agents/adding-an-agent.md`.

**To verify**

- Whether Codex cloud tasks can use the Figma MCP server. Until verified, stages that need `figma-read` or `figma-write` stay with Claude Code, or run with the Codex CLI on Hugo's machine.
- Whether a PR can be reviewed from GitHub (for example with an `@codex review` comment) and which ChatGPT plan it needs.
- Which GitHub identity and permissions Codex uses to push branches and open PRs. If it acts as Hugo, the limited-token rules in `docs/DELIVERY.md` ("Agent identity") must be applied to it too.
- Whether a trigger exists to start a task when a PR is merged. Until then, start each stage by hand.

**Setup (when Hugo decides to try it)**

1. Review PR #1 first, read-only, with `/review` in the Codex CLI against `main`. Nothing is written to GitHub.
2. Create a cloud environment for the repository:
   - Setup script: `if [ -f package.json ]; then npm ci; fi`.
   - Internet access: allowlist the domains in `docs/SETUP.md`.
   - Variables: only `FIGMA_FILE_URL`, `MEDIA_BASE_URL=/media` and `CONTACT_URL`. No secrets, no Cloudflare or R2 credentials.
3. Run a small documentation-only task with the kickoff prompt (`Read AGENTS.md and follow docs/agents/next-stage.md.`) and check: which account opens the PR, which permissions it has, and that it follows `AGENTS.md`.
4. Record the results in the "Known agents" table in `README.md`, with the date.

Its branches usually start with `codex/`; `AGENTS.md` rule 2 asks for an `agent/…` branch instead (`agent/stage-NN-short-name` for a stage), so name the branch that way when you start the task.

## GitHub Copilot CLI

The pipeline integration pins `@github/copilot` 1.0.92 and runs `copilot -p` through the root-owned launcher `scripts/copilot-runner.ts`. Setup and exact owner commands are in [`copilot.md`](copilot.md); the contract is [`docs/specs/copilot-runner.md`](../specs/copilot-runner.md).

Checked on 2026-10-19 against `copilot --help` of 1.0.92, installed in an isolated home with no credential: `-p`, `--model`, `--no-ask-user`, `--no-auto-update`, `--no-remote-export`, `--disable-builtin-mcps`, `--allow-tool`, `--deny-tool` (denials win), `--allow-url`, `--secret-env-vars` and `--silent` exist; `COPILOT_GITHUB_TOKEN` takes precedence over `GH_TOKEN` and `GITHUB_TOKEN`; without a token the CLI exits with "No authentication information found" instead of waiting for input. GitHub's documentation ([run programmatically](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically), [automate with Actions](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions)) names a fine-grained token with the "Copilot Requests" permission for CI. The npm package is a loader that pins the native binary `@github/copilot-linux-x64` at the same version. Real authentication, the model and the allow-list behaviour in `-p` mode are verified by the manual smoke.

Copilot routes to models of several vendors. The registry needs an explicit model so the pipeline knows its model family when it picks reviewers; `auto` is refused.

## Google Antigravity CLI

The pipeline integration installs Antigravity CLI 1.4.3 from its exact build URL with the sha512 of Google's manifest, and runs `agy --print` through the root-owned launcher `scripts/antigravity-runner.ts`. Setup is in [`antigravity.md`](antigravity.md); the contract is [`docs/specs/antigravity-runner.md`](../specs/antigravity-runner.md).

Checked on 2026-10-20 with the pinned binary in an isolated home and no credential: `--help` lists `--print`, `--model`, `--mode` (`accept-edits`, `auto`, `plan`), `--output-format`, `--disable-slash-commands`, `--log-file`, `--print-timeout` and `--sandbox`; without a key, print mode starts a browser sign-in and waits. Its bundled changelog (`agy changelog`) documents the Gemini API key setup (`modelProvider: "gemini"` in `~/.gemini/antigravity-cli/settings.json` plus `GEMINI_API_KEY`), `--mode` and `settings.json` permissions (`permissions.allow`, `command(...)`) being honoured in print mode, and `AGY_ERROR` lines with exit code 3. Gemini CLI's own repository says it "was replaced by Antigravity CLI on June 18th, 2026" for unpaid and Google One users. Real authentication, the command allowlist and the background updater are verified by the manual smoke.

## Open-source agents and open-weight models

### OpenCode

The pipeline integration pins `opencode-ai` 1.19.3 and uses `opencode run --format json --model opencode-go/<model> --agent pipeline --pure`. Setup and exact owner commands are in [`opencode.md`](opencode.md).

Verified on 2026-10-19 with the installed 1.19.3 CLI and a local scripted OpenAI-compatible endpoint, using a dummy credential and a fresh temporary home: headless read/bash tools, environment-based authentication through a provider `apiKey` substitution, rejection of project configuration, fixture edits and `npm test`. The test also verifies that the dummy key is not persisted in the CLI home. This is not a real Go API or model-quality test.

The launcher sets `OPENCODE_DISABLE_PROJECT_CONFIG=true` and `OPENCODE_PURE=true`, writes a temporary `opencode.json` inside the container home and selects it through `OPENCODE_CONFIG`. It contains an environment placeholder, never a key, and is removed after execution. Sharing is disabled. The project-config flag is verified against the [pinned source](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/config/paths.ts); do not assume future versions preserve it. Raw JSON events and stderr are consumed without being saved or printed. The launcher fails on provider error events, a nonzero exit or no final completion.

The key reaches only the CLI process environment; the launcher does not call `auth login` or write the key to a file. The agent can run project commands with its capped model key, as allowed by the existing pipeline exception. Its permissions are not an OS sandbox: the unprivileged container, read-only `.git`, root-owned launcher in the digest-pinned image, and separate publisher are the security boundary. No Figma capability is registered, and no MCP connection is configured. The built-in `websearch` tool is not an MCP connection and works without one, sending queries to Exa or Parallel, so the launcher denies it explicitly; see [`opencode.md`](opencode.md).

References: [CLI](https://opencode.ai/docs/cli/), [configuration](https://opencode.ai/docs/config/), [permissions](https://opencode.ai/docs/permissions/), [Go](https://opencode.ai/docs/go/). The introductory docs distinguish OpenCode 1 and 2, which share the command name; this integration qualifies only the pinned 1.x CLI.

`opencode run --help` confirmed `--format json`, `--model`, `--agent` and `--pure` on 2026-10-19. `opencode models opencode-go`, run with an isolated home and a dummy credential, listed `opencode-go/glm-5.3`; the registry selects that model for both primary and auxiliary requests. Changing models requires a reviewed registry edit, not a workflow edit. No interactive `console login` or `auth login` is needed by this runner. Real Go authentication remains unverified.

#### Phase 0 observations

Hugo reported these local trials on 2026-10-18, using OpenCode 1.19.3 on Ubuntu 24.04 in WSL. Each result comes from one run per model, so it does not establish general capability. Test 1 summarized stage-PR rules; Test 2 reviewed the historical PR #19 diff containing a Docker-only `git ls-files` failure; Test 3 added exactly one documentation-table row.

| Go model | Test 1 | Test 2 | Test 3 | Approximate observed cost |
| --- | --- | --- | --- | --- |
| GLM-5.3 | Passed; omitted TypeScript-only | Partial: identified the relevant line, but rated it Low | Passed; checks passed | USD 0.73 |
| Kimi K3 | Passed; omitted TypeScript-only | Missed the target bug | Passed | USD 0.94 |
| MiniMax-M3 | Passed with two omissions | Missed the target bug; noisy permission prompts | Passed; empty Setup cell | USD 0.35 |
| GPT-6 Luna | Not run | Missed the target bug | Not run | USD 0.03 |
| DeepSeek V4 Pro | Not run; workspace privacy choice required | Not run | Not run | Not measured |

Start GLM-5.3 on small, clearly specified builder work with independent review. None of these trials qualifies OpenCode as a reviewer, for long specs or for Figma/design work. The registry enforces the absence of Figma capabilities; task size and quality remain Hugo's assignment decisions. The OpenCode kickoff repeats the TypeScript-only rule because every tested rules summary omitted it. `AGENTS.md` remains the source of truth.

Go availability, privacy regions and model-specific limits must be checked in Hugo's console. Do not enable Global regions or select contributor/training models automatically. Subscription access is not evidence of suitability, and optional balance usage can exceed included allowances.

### Other open-source agents

Agents such as OpenHands, Aider, Goose or Cline can run with hosted or local models (for example through Ollama). Requirements are the same as above. In practice:

- Smaller models may struggle with long specs: start them on stages that only need `git` and `node`, or on reviews.
- If the agent runs on Hugo's machine, the network allowlist and the "no credentials" rule are Hugo's responsibility: do not run it in a shell that has Cloudflare or R2 credentials loaded.
