# Other agents

How to run a stage with an agent other than Claude Code. None of these has been tried on this project yet; update `README.md` when one is.

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

Nothing here has been run on this project yet. "Confirmed" means found in OpenAI's documentation or third-party guides on 2026-10-12; "to verify" means it must be tested before relying on it.

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
   - Variables: only `FIGMA_FILE_URL`, `MEDIA_BASE_URL` (staging value) and `CONTACT_URL`. No secrets, no Cloudflare or R2 credentials.
3. Run a small documentation-only task with the kickoff prompt (`Read AGENTS.md and follow docs/agents/next-stage.md.`) and check: which account opens the PR, which permissions it has, and that it follows `AGENTS.md`.
4. Record the results in the "Known agents" table in `README.md`, with the date.

Its branches usually start with `codex/`; `AGENTS.md` rule 2 asks for an `agent/…` branch instead (`agent/stage-NN-short-name` for a stage), so name the branch that way when you start the task.

## Open-source agents and open-weight models

Agents such as OpenHands, Aider, Goose or Cline can run with hosted or local models (for example through Ollama). Requirements are the same as above. In practice:

- Smaller models may struggle with long specs: start them on stages that only need `git` and `node`, or on reviews.
- If the agent runs on Hugo's machine, the network allowlist and the "no credentials" rule are Hugo's responsibility: do not run it in a shell that has Cloudflare or R2 credentials loaded.
