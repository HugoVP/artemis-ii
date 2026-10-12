# Agents

This project is built by AI agents, but it does not depend on any one of them. Any agent that can follow `AGENTS.md`, use git and open PRs on GitHub can run a stage. This folder explains how to plug one in.

## How it works for any agent

- **Instructions:** `AGENTS.md` at the repo root. It is read natively by many agents (for example OpenAI Codex); others need a pointer, like `CLAUDE.md` does for Claude Code.
- **Kickoff prompt:** the same for every agent:

  > Read AGENTS.md and follow docs/agents/next-stage.md.

- **Work order:** the next `pending` stage in `docs/PLAN.md` and its spec in `docs/specs/`. Everything an agent needs is in the repo; nothing lives in a vendor's settings except credentials and connectors.
- **Handoff:** the PR. Any agent can pick up a stage PR on its branch to address Hugo's comments (rule 7).
- **Traceability:** every stage PR states which agent did the work.

## Capabilities

Each stage lists the capabilities it needs in the "Needs" column of `docs/PLAN.md`. An agent that lacks one must not start that stage (see `next-stage.md`).

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
| OpenAI Codex (cloud) | `AGENTS.md` | `git`, `node`, `browser`, `web` depending on its environment settings; Figma depends on MCP support in that runner | Not yet tried | [`other-agents.md`](other-agents.md) |
| Open-source agents (for example OpenHands, Aider, Goose, Cline) with any model, including open-weight models | `AGENTS.md` (configure if not automatic) | Depends on the runner; Figma only if it is an MCP client | Not yet tried | [`other-agents.md`](other-agents.md) |

When an agent is tried for the first time, update its row with what was verified and the date.

## Reviewer agents (optional)

Hugo can ask a second agent, different from the one that built the stage, to review a stage PR. The reviewer reads `AGENTS.md`, the stage spec and the diff, and comments on the PR: spec criteria not met, bugs, security issues. It never pushes to the PR or approves it. The builder (or any agent) answers each finding in the PR.

## Adding a new agent

1. Make sure it can read `AGENTS.md` (natively or with a pointer file that only says "read AGENTS.md", like `CLAUDE.md`).
2. Give its environment only the variables listed in `AGENTS.md`, plus the network domains in `docs/SETUP.md`.
3. Run it once with the kickoff prompt on a stage that only needs `git`, or ask it to review an open PR, and record the result in the table above.
