# Agents

This project is built by AI agents, but it does not depend on any one of them. Any agent that can follow `AGENTS.md`, use git and open PRs on GitHub can run a stage. This folder explains how to plug one in.

## How it works for any agent

- **Instructions:** `AGENTS.md` at the repo root. It is read natively by many agents (for example OpenAI Codex); others need a pointer, like `CLAUDE.md` does for Claude Code.
- **Kickoff prompt:** the same for every agent:

  > Read AGENTS.md and follow docs/agents/next-stage.md.

- **Work order:** the next `pending` stage in `docs/PLAN.md` and its spec in `docs/specs/`. When a stage PR is merged, `next-stage.yml` also opens a GitHub issue `Run Stage NN: <name>` (label `agent-task`) with the kickoff prompt, the spec link and the capabilities the stage needs. Everything an agent needs is in the repo; nothing lives in a vendor's settings except credentials and connectors.
- **Handoff:** the PR. Any agent can pick up a stage PR on its branch to address Hugo's comments (rule 7).
- **Traceability:** every stage PR states which agent did the work.

## Capabilities

Each stage lists the capabilities it needs in the "Needs" column of `docs/PLAN.md`. An agent that lacks one must not do that stage's work; it opens a draft PR saying which capability is missing (rule 8, see `next-stage.md`).

| ID | Capability | Needed for |
| --- | --- | --- |
| `git` | Clone, branch, commit, push, open and update PRs on GitHub | Every stage |
| `node` | Node.js 22 and npm, able to run project scripts | Stage 02 on |
| `browser` | Headless Chromium for Playwright tests | Stage 02 on |
| `web` | HTTP access to NASA and news domains | Curation, ingestion, texts |
| `figma-read` | Figma MCP server, read tools (`get_metadata`, `get_screenshot`, `get_variable_defs`); in the agent pipeline, through the pipeline's Figma gateway, limited to the design file | Stages with visible changes |
| `figma-write` | Figma MCP server, `use_figma` | Design stage and design changes |

## Known agents

| Agent | Instructions | Capabilities | Status in this project | Setup |
| --- | --- | --- | --- | --- |
| Claude Code (cloud, routine) | `CLAUDE.md` → `AGENTS.md` | All, Figma through the claude.ai Figma connector | Verified 2026-10-12 (Stage 00, Figma write access) | [`claude-code.md`](claude-code.md) |
| OpenAI Codex (cloud, CLI) | `AGENTS.md` (including `## Code Review Rules`) | In the pipeline: `git`, `node`, `browser`, `web`, `figma-read`, `figma-write`; vendor environments depend on their setup | Pipeline verified 2026-10-19: Stage 04 run opened PR #31; stage acceptance remains under review | [`other-agents.md`](other-agents.md); in the pipeline: [`adding-an-agent.md`](adding-an-agent.md) |
| OpenCode 1.19.3 | Native `AGENTS.md`, trusted pipeline prompt | `git`, `node`, `browser`, `web`; no Figma in this integration | Local builder trials reported 2026-10-18; GLM-5.3 selected. Headless CLI verified 2026-10-19 with a scripted local endpoint; real Go authentication and remote smoke pending | [`opencode.md`](opencode.md); trial observations in [`other-agents.md`](other-agents.md#phase-0-observations) |
| GitHub Copilot CLI 1.0.92 (pipeline) | Native `AGENTS.md`, trusted pipeline prompt | `git`, `node`, `browser`, `web`; no Figma in this integration | Headless flags checked against the CLI help 2026-10-19; not yet run with a real token, and its model is not chosen yet | [`copilot.md`](copilot.md) |
| Google Antigravity CLI 1.4.3 (pipeline) | `AGENTS.md` natively (also `GEMINI.md`), trusted pipeline prompt | `git`, `node`, `browser`, `web`; Gemini models through a Gemini API key; no Figma in this integration | Binary, help and bundled changelog checked 2026-10-20 with no credential; not yet run with a key, model not chosen | [`antigravity.md`](antigravity.md) |
| GitHub Copilot coding agent (cloud) | `AGENTS.md` | `git`, `node`, `browser`; no Figma (Figma's remote MCP only accepts approved OAuth clients) | Evaluated 2026-10-12 and again 2026-10-19, not used: its `copilot/…` branches and own identity skip the pipeline's checks (see "Agent identity" in `docs/DELIVERY.md`) | — | — |
| Open-source agents (for example OpenHands, Aider, Goose, Cline) with any model, including open-weight models | `AGENTS.md` (configure if not automatic) | Depends on the runner; Figma only if it is an MCP client | Not yet tried | [`other-agents.md`](other-agents.md) |

When an agent is tried for the first time, update its row with what was verified and the date.

## Universal flow

Every layer below is plain files, GitHub or a pipeline workflow, so any agent and model can take part. Only the last row depends on the agent.

| Layer | Where it lives | Depends on an agent? |
| --- | --- | --- |
| Rules | `AGENTS.md` (plus a one-line pointer file for agents that do not read it, like `CLAUDE.md`) | No |
| Work order | The `Run Stage NN` issue, opened by `next-stage.yml` after each stage merge | No |
| Work | Any agent that reads the repo, commits and opens a PR titled `Stage NN: <name>` that says `Closes #<issue>` | No |
| Review | Hugo in the PR; optionally a second agent (see "Reviewer agents") | No |
| Integrations | Pipeline workflows: Notion (`notion-sync.yml`) and Linear statuses (`linear-sync.yml`, plus the GitHub integration with `Closes HUG-N`). Agents never hold those credentials | No |
| Design (Figma) | The Figma MCP server, which only accepts clients in Figma's catalog | **Yes**: use a listed client for stages that need `figma-read` or `figma-write` |

**Starting a stage with an agent.** Open the work-order issue, copy its prompt and give it to the agent you choose. The stage's "Needs" column says which capabilities it requires; pick an agent that has them.

**Use what each agent does well.** Every stage needs `git`, and from Stage 02 on also `node` and `browser`, plus whatever its "Needs" column adds (for example `web` for curation and text stages, `figma-read` or `figma-write` for design). An agent that has all of them can take the stage, including free or open-weight ones; small models may struggle with long specs, so start them on reviews and small stages. Stages that need Figma go to a client Figma accepts. The routine in `claude-code.md` chains the next stage with Claude Code after any stage merge (its trigger is the `agent/stage-` branch prefix that every agent uses); to give a stage to another agent, turn the routine off and use the work-order issue.

**Figma clients.** [Figma's guide to its MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server) (checked 2026-10-16) lists among its supported clients Claude Code, Codex, Gemini CLI, OpenCode, OpenHands, Copilot CLI, Cursor and VS Code, and compares each client's remote-server and write-to-canvas support in a table. Check that table before assigning a design stage (`figma-write`) to an agent other than Claude Code.

**Agent options seen on 2026-10-16.** Taken from the pages linked in each row; third-party pages sometimes disagree with each other and with vendors, and prices and free limits change, so every row is "to verify" until tried on this project. Check the vendor page before paying or relying on a free tier.

| Agent | How it fits | Notes |
| --- | --- | --- |
| Claude Code | Routine and manual sessions; `CLAUDE.md` points to `AGENTS.md` | Hugo's paid plan. Figma with write access verified 2026-10-12 |
| OpenAI Codex | Reads `AGENTS.md`; cloud tasks and CLI (see "OpenAI Codex" in `other-agents.md`) | Hugo's paid plan. Users report failures when starting cloud tasks from `@codex` comments on GitHub ([openai/codex issue 42098](https://github.com/openai/codex/issues/42098)); try a small task first |
| Google Jules | Cloud VM that opens PRs on GitHub; listed as supporting `AGENTS.md` on [agents.md](https://agents.md/) | Reported to have a free tier ([TechRadar](https://www.techradar.com/pro/google-has-a-new-ai-coding-agent-and-its-now-free-for-everyone-to-use)); Figma support not confirmed |
| Gemini CLI | Replaced by Antigravity CLI on 2026-06-18 for unpaid and Google One users, per its own repository; not optimized for Gemini 4 Argon | Not used: the pipeline uses Antigravity CLI ([`antigravity.md`](antigravity.md)) |
| Google Antigravity | IDE on Hugo's machine (vendor environment); its CLI `agy` runs in the pipeline | The CLI reads `AGENTS.md`, has a print mode and a Gemini API key setup (bundled changelog of 1.4.3); see [`antigravity.md`](antigravity.md) |
| OpenCode | Reported to read `AGENTS.md`; any model, hosted or local | Free software, you pay for the model ([comparison](https://www.critique.sh/comparisons/best-open-source-coding-agents-2026)). In Figma's list |
| OpenHands | Runs sessions in an isolated container, any model | Free software ([comparison](https://pinggy.io/blog/best_open_source_cli_coding_agents/)). In Figma's list |
| Aider, Cline | Terminal and VS Code agents, any model; Aider is listed as supporting `AGENTS.md` on [agents.md](https://agents.md/) | Free software; not in Figma's list, so use them for stages without Figma |
| GitHub Copilot | Best as a reviewer (reads `REVIEW.md`) | Optional. Its cloud coding agent was evaluated and not used, see "Agent identity" in `docs/DELIVERY.md` |

Whatever the agent, the safety rules do not change: its environment holds only the variables in `AGENTS.md`, never Cloudflare, R2, Notion or Linear credentials.

## Reviewer agents (optional)

Hugo can ask a second agent, different from the one that built the stage, to review a stage PR (for example Codex with `/review`, following the `## Code Review Rules` in `AGENTS.md`, or GitHub Copilot code review, which reads `REVIEW.md`). The reviewer reads `AGENTS.md`, the stage spec and the diff, and comments on the PR: spec criteria not met, bugs, security issues. It never pushes to the PR or approves it. The builder (or any agent) answers each finding in the PR.

## Adding a new agent

1. Make sure it can read `AGENTS.md` (natively or with a pointer file that only says "read AGENTS.md", like `CLAUDE.md`).
2. Give its environment only the variables listed in `AGENTS.md`, plus the network domains in `docs/SETUP.md`.
3. Run it once with the kickoff prompt on a stage that only needs `git`, or ask it to review an open PR, and record the result in the table above.
