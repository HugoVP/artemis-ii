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

1. Public repo `HugoVP/artemis-ii` (see "Public repository" in `docs/DELIVERY.md`). Install the GitHub App of each agent you use (for example https://github.com/apps/claude).
2. **Settings → Code security:** turn on Dependabot alerts, secret scanning and push protection. **Settings → Actions → General:** require approval for workflows from outside contributors.
3. **Settings → Rules → Rulesets**, a rule for `main`: require a pull request, block force pushes and deletion. Required checks: `CI / build` now; after Stage 03, the checks listed in `docs/DELIVERY.md`.
4. **(Stage 03)** Variables and environments from `docs/DELIVERY.md`. Credentials go into the environment of the jobs that use them (`preview`, `staging`, `production`), never into repository-level secrets.
5. **(Stage 03) Agent permissions:** a fine-grained token for the agents, the `approval`, `preview`, `staging` and `production` environments and the rulesets without bypass ("Agent identity" in `docs/DELIVERY.md`). Stage 03 lists the exact steps.

## 2. Cloudflare

1. **Pages:** the project connected to the repo (already done). Until Stage 03 it deploys previews and `main` on its own; the production URL is not shared with anyone yet. **(Stage 03)** Two projects in the same Cloudflare account: `artemis-ii` for production and `artemis-ii-staging` for staging and previews (see "Cloudflare Pages setup" in `docs/DELIVERY.md`).
2. **(Stage 03) R2:** two buckets, for example `artemis-ii-media-staging` and `artemis-ii-media`, each with public read access (an `r2.dev` subdomain or a custom domain).
3. **(Stage 03) Tokens**, each with the minimum scope:
   - An API token with "Cloudflare Pages: Edit" only, for deployments. Cloudflare scopes it to the account, not to one Pages project; see "Secrets and configuration" in `docs/DELIVERY.md` for how it is protected.
   - One R2 token per bucket, read and write on that bucket only.

   These go into GitHub environment secrets (see "Secrets and configuration" in `docs/DELIVERY.md`), **never** into an agent environment or a repository-level secret.

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

## 6. Task tracking and notes (optional)

- **Linear:** a team `HUG` and a project "Artemis II", one issue per stage in the order of `docs/PLAN.md`, and the GitHub integration turned on so a PR that says `Closes HUG-N` moves its issue. Keep Linear's own statuses; the mapping is in `AGENTS.md`.
- **Notion:** a page "Artemis II" with a sub-page "Decision log (synced from repo)", filled automatically from `docs/PLAN.md` by the `notion-sync.yml` workflow. Only entries that end with `<!-- notion -->` are published, so nothing reaches Notion unless someone marks it as safe. The page may be public (see `AGENTS.md`). One-time setup:
  1. In Notion, create an internal connection (API token) at notion.so/profile/integrations, with the three content capabilities (read, update and insert content) and no user information.
  2. On the sub-page, open the `...` menu, then Connections, and add the connection. Share only that sub-page with it.
  3. In GitHub, create the environment `notion`, with deployment branches limited to `main` (Selected branches and tags), the secret `NOTION_TOKEN` and the variable `NOTION_PAGE_ID` (the sub-page ID or its URL).
  4. The workflow is `.github/workflows/notion-sync.yml`. It runs on `main` when `docs/PLAN.md` changes, and by hand.
  5. Run the workflow once by hand (Actions, Notion sync, Run workflow) and check the page.
  Do not edit that sub-page: every sync overwrites it. Keep your own notes on another page.
- **Obsidian:** open the `docs/` folder as a vault. Use relative paths for links and turn wikilinks off, so links keep working on GitHub. `docs/.obsidian/` is git-ignored.
- **Slack:** a private channel with the GitHub app subscribed to this repository (`pulls`, `reviews`, `issues`, `releases`, `deployments`) and Linear's team notifications. Do not add Slack to the routine.

## Keep in mind

- Agent runs use your usage limits on each platform.
- A green status in an agent's run list only means there was no infrastructure error. What counts is the PR and its preview.
- Everything agents do on GitHub currently appears under your user (see "Agent identity" in `docs/DELIVERY.md`).
- Anyone who uses an agent environment can see its variables. Keep each environment for this project only.
