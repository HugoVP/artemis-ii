# Other agents

How to run a stage with an agent other than Claude Code. None of these has been tried on this project yet; update `README.md` when one is.

## What any agent needs

- Read access to `AGENTS.md` (most agents read it natively; otherwise tell the agent to read it first).
- A sandbox with git, Node.js 22, npm and headless Chromium, and network access to the domains in `docs/SETUP.md`.
- Permission to push branches and open PRs on the repository.
- Only the environment variables listed in `AGENTS.md`.
- For design work: an MCP client connected to the Figma MCP server, with access to the file in `FIGMA_FILE_URL`.

## Starting a stage

1. Make sure no stage PR is open and the previous one is merged.
2. Start a task on this repository with the kickoff prompt:

   > Read AGENTS.md and follow docs/agents/next-stage.md.

3. The agent opens a PR titled `Stage NN: <name>`, with the agent named in the PR body.

Automatic chaining (start the next stage on merge) is set up per runner. For Claude Code it is the routine in `claude-code.md`. For other runners, start each stage by hand until an equivalent trigger is configured.

## OpenAI Codex

- Reads `AGENTS.md` natively.
- Configure its cloud environment with the setup script `npm ci` (once `package.json` exists), the network domains from `docs/SETUP.md` and the variables from `AGENTS.md`.
- Check whether its runner supports the Figma MCP server before giving it a stage that needs `figma-read` or `figma-write`.
- Its branches usually start with `codex/`. Nothing depends on that.

## Open-source agents and open-weight models

Agents such as OpenHands, Aider, Goose or Cline can run with hosted or local models (for example through Ollama). Requirements are the same as above. In practice:

- Smaller models may struggle with long specs: start them on stages that only need `git` and `node`, or on reviews.
- If the agent runs on Hugo's machine, the network allowlist and the "no credentials" rule are Hugo's responsibility: do not run it in a shell that has Cloudflare or R2 credentials loaded.
