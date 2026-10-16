# Claude Code

How Claude Code runs this project. Nothing here is a project rule; the rules are in `AGENTS.md`. `CLAUDE.md` imports `AGENTS.md`, so Claude Code reads it automatically.

## Cloud environment `artemis-ii`

Created at claude.ai/code:

- **Network access:** Custom, with "Also include default list of common package managers" turned on, and the domains listed in `docs/SETUP.md`.
- **Environment variables:** only `FIGMA_FILE_URL`, `MEDIA_BASE_URL` (staging value) and `CONTACT_URL`. No Cloudflare or R2 credentials: those live in GitHub Actions (`docs/DELIVERY.md`).
- **Setup script:**
  ```
  if [ -f package.json ]; then npm ci; fi
  ```

## Routine "Artemis II — next stage"

Created at claude.ai/code/routines:

- **Repository:** this project's repo.
- **Environment:** `artemis-ii`.
- **Connectors:** only **Figma**. Remove all others, including Slack, Linear and Notion: the routine runs unattended on content it does not control, so it keeps the least access it needs. Linear and Notion are used in manual sessions that Hugo starts. Slack notifications come from the GitHub and Linear apps in Slack, not from a connector.
- **Trigger:**
  - **GitHub event:** Pull request → `closed`, with the filters:
     - Is merged = `true`
     - Base branch = `main`
     - Head branch starts with `claude/` (so the routine chains stages built by Claude Code; stages built by other agents are started by hand, see `other-agents.md`)

  The work-order issue that `next-stage.yml` opens after each stage merge does not stop this routine: both start the next stage, and the PR the agent opens says `Closes #<issue>`. If you prefer another agent for a stage, turn the routine off (**Active** switch) before merging.

  The routine page also has a **Run now** button (the play icon), not a trigger, to start a stage by hand or retry one, and an **Active** switch that turns the GitHub trigger on or off. Turn it off to review one stage before the next starts.
- **Instructions** (paste exactly this; the procedure itself lives in the repo, so this never needs to change):

  ```
  Read AGENTS.md and follow docs/agents/next-stage.md.
  ```

## GitHub access

Claude Code acts on GitHub as the account connected to claude.ai. From Stage 03 on, that connection is a limited fine-grained token set with `/web-setup` (see "Agent identity" in `docs/DELIVERY.md`), so Claude Code can push branches and open PRs but cannot change settings, workflows or approve deployments.

## Notes

- Claude Code branches start with `claude/`. Nothing in the project depends on that.
- Verified on 2026-10-12: the Figma connector can read and write the file in `FIGMA_FILE_URL` with `use_figma`.
- Routines are in preview and use Hugo's usage limit, like any session.
