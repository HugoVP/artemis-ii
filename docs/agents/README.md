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
| `figma-read` | Figma MCP server, read tools (`get_metadata`, `get_screenshot`, `get_variable_defs`) | Stages with visible changes |
| `figma-write` | Figma MCP server, `use_figma` | Design stage and design changes |

## Known agents

| Agent | Instructions | Capabilities | Status in this project | Setup |
| --- | --- | --- | --- | --- |
| Claude Code (cloud, routine) | `CLAUDE.md` → `AGENTS.md` | All, Figma through the claude.ai Figma connector | Verified 2026-10-12 (Stage 00, Figma write access) | [`claude-code.md`](claude-code.md) |
| OpenAI Codex (cloud, CLI) | `AGENTS.md` (including `## Code Review Rules`) | `git`, `node`, `browser`, `web` depending on its environment settings; Figma works through MCP in the CLI, cloud support to verify | Not yet tried; first use planned as PR reviewer (`/review`) | [`other-agents.md`](other-agents.md) |
| GitHub Copilot coding agent | `AGENTS.md` | `git`, `node`, `browser`; no Figma (Figma's remote MCP only accepts approved OAuth clients) | Evaluated 2026-10-12, not used (see "Agent identity" in `docs/DELIVERY.md`) | — |
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
| Integrations | Pipeline workflows: Notion (`notion-sync.yml`); Linear moves with the GitHub integration (`Closes HUG-N`). Agents never hold those credentials | No |
| Design (Figma) | The Figma MCP server, which only accepts clients in Figma's catalog | **Yes**: use a listed client for stages that need `figma-read` or `figma-write` |

**Starting a stage with an agent.** Open the work-order issue, copy its prompt and give it to the agent you choose. The stage's "Needs" column says which capabilities it requires; pick an agent that has them.

**Use what each agent does well.** Stages that need Figma go to a client Figma accepts; stages that only need `git` and `node` (pipeline, content, reviews) can go to any agent, including free or open-weight ones. The routine in `claude-code.md` keeps chaining stages built by Claude Code; for any other agent, the work-order issue is the trigger.

**Figma clients.** Figma's guide (checked 2026-10-16, to re-check before relying on it) lists among its supported clients Claude Code, Codex, Gemini CLI, OpenCode, OpenHands, Copilot CLI, Cursor and VS Code. Writing to the canvas (`figma-write`) works only in some of them: confirm it in Figma's table before assigning a design stage to an agent other than Claude Code.

**Agent options seen on 2026-10-16.** Gathered from vendor pages and third-party articles that sometimes disagree; every row is "to verify" until tried on this project. Prices and free limits change, so check the vendor page before paying or relying on a free tier.

| Agent | How it fits | Notes |
| --- | --- | --- |
| Claude Code | Routine and manual sessions; `CLAUDE.md` points to `AGENTS.md` | Paid plan (Hugo's). Figma with write access verified |
| OpenAI Codex | Reads `AGENTS.md`; cloud tasks and CLI; `@codex` on GitHub | Paid plan (Hugo's). Reports of `@codex` tasks failing; try with a small task first |
| Google Jules | Cloud VM that opens PRs on GitHub; listed on agents.md | Reported free tier (about 15 tasks per day, to verify); no Figma confirmed |
| Gemini CLI | Local or in GitHub Actions; default context file is `GEMINI.md`, so add a pointer file or configure `AGENTS.md` | Free personal-account access reported as ended in June 2026, API key tier remains (to verify) |
| Google Antigravity | Local IDE agent with MCP | Free plan with weekly limits (to verify); `AGENTS.md` support not confirmed; not seen in Figma's list |
| OpenCode | Reads `AGENTS.md`; any model, hosted or local | Free software, you pay for the model; in Figma's list |
| OpenHands | Runs in an isolated container, any model | Free software; in Figma's list |
| Aider, Cline | Terminal and VS Code agents, any model | Free software; not in Figma's list; keep to non-Figma stages |
| GitHub Copilot | Best as a reviewer (reads `REVIEW.md`); its cloud coding agent appears to need a paid plan (to verify) | Optional, not needed for the flow |

Whatever the agent, the safety rules do not change: its environment holds only the variables in `AGENTS.md`, never Cloudflare, R2, Notion or Linear credentials.

## Reviewer agents (optional)

Hugo can ask a second agent, different from the one that built the stage, to review a stage PR (for example Codex with `/review`, following the `## Code Review Rules` in `AGENTS.md`, or GitHub Copilot code review, which reads `REVIEW.md`). The reviewer reads `AGENTS.md`, the stage spec and the diff, and comments on the PR: spec criteria not met, bugs, security issues. It never pushes to the PR or approves it. The builder (or any agent) answers each finding in the PR.

## Adding a new agent

1. Make sure it can read `AGENTS.md` (natively or with a pointer file that only says "read AGENTS.md", like `CLAUDE.md`).
2. Give its environment only the variables listed in `AGENTS.md`, plus the network domains in `docs/SETUP.md`.
3. Run it once with the kickoff prompt on a stage that only needs `git`, or ask it to review an open PR, and record the result in the table above.
