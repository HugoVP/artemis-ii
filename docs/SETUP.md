# Setup (Hugo)

What Hugo sets up outside the repo so agents and the pipeline can work. Steps marked **(Stage 03)** are only needed when the pipeline stage starts; that stage's spec will list them exactly.

## How it works

```
agent runs a stage ─► PR with preview ─► Hugo reviews ─► merge ─► staging ─► next stage starts
                                                                     │
                                              Hugo publishes a release ─► production
```

- **Approve a stage** = merge its PR (it goes to staging).
- **Request changes** = comment on the PR.
- **Go to production** = publish a GitHub Release (see `docs/DELIVERY.md`).
- **Pause the project** = turn off the agent's trigger (for Claude Code, the routine's switch).

## 1. GitHub

1. Private repo `HugoVP/artemis-ii` with these files on `main`. Install the GitHub App of each agent you use (for example https://github.com/apps/claude).
2. **Settings → Rules → Rulesets**, a rule for `main`: require a pull request, block force pushes and deletion. Required checks: `CI / build` now; after Stage 03, the checks listed in `docs/DELIVERY.md`.
3. **(Stage 03)** Actions secrets and variables from `docs/DELIVERY.md`, and environments if your plan allows them. Decide the open questions in `docs/DELIVERY.md` (repository visibility, a separate identity for agents).

## 2. Cloudflare

1. **Pages:** the project connected to the repo (already done). Until Stage 03 it deploys previews and `main` on its own; the production URL is not shared with anyone yet.
2. **(Stage 03) R2:** two buckets, for example `artemis-ii-media-staging` and `artemis-ii-media`, each with public read access (an `r2.dev` subdomain or a custom domain).
3. **(Stage 03) Tokens**, each with the minimum scope:
   - An API token with "Cloudflare Pages: Edit" only, for deployments.
   - One R2 token per bucket, read and write on that bucket only.

   These go into GitHub Actions secrets, **never** into an agent environment.

## 3. Figma

1. Connect Figma in claude.ai → Settings → Connectors (done).
2. The design file "Artemis II - Site" exists and its URL is `FIGMA_FILE_URL` (done).
3. To review the design: open the file, check the Foundations, Components and Screens pages, and leave comments on the PR. Merging the PR approves the design.

## 4. Agents

Each agent runs in its own sandbox with the same rules (`AGENTS.md`). Setup per agent is in `docs/agents/`:

- Claude Code: `docs/agents/claude-code.md` (environment `artemis-ii`, routine, Figma connector).
- Other agents: `docs/agents/other-agents.md`.

Every agent environment gets:

- **Variables:** only `FIGMA_FILE_URL`, `MEDIA_BASE_URL` (staging value) and `CONTACT_URL`. If `R2_*` variables were added to the Claude Code environment earlier, remove them: storage credentials belong to the pipeline.
- **Network domains**, on top of the package managers:
  - `eol.jsc.nasa.gov`
  - `pds-imaging.jpl.nasa.gov`
  - `www.nasa.gov`
  - `images.nasa.gov`
  - `images-api.nasa.gov`
  - `images-assets.nasa.gov`

  If a stage is blocked by a domain, the agent says so in the PR and you add it.

## 5. Start

1. Merge the open stage PR. With Claude Code, the routine starts the next stage on its own; with other agents, start it with the kickoff prompt in `docs/agents/README.md`.
2. Review each stage in its preview, comment or merge.
3. Publish a release when you want the current staging version in production.

## Keep in mind

- Agent runs use your usage limits on each platform.
- A green status in an agent's run list only means there was no infrastructure error. What counts is the PR and its preview.
- Everything agents do on GitHub currently appears under your user (see "Agent identity" in `docs/DELIVERY.md`).
- Anyone who uses an agent environment can see its variables. Keep each environment for this project only.
