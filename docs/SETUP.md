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

### Stage 03 steps (pipeline)

1. **Prepare the environments first** (Settings → Environments), with deployment branch policies: `preview` and `staging` (`main` only), `production` (tags `v*` only, Hugo as required reviewer), `approval` (`main` only, Hugo as required reviewer).
2. **Secrets and variables** as listed in "Secrets and configuration" of `docs/DELIVERY.md`: `CLOUDFLARE_API_TOKEN` in `preview`, `staging` and `production`; R2 keys in `staging` and `production`; the `*_STAGING` / `*_PRODUCTION` variables and `CLOUDFLARE_ACCOUNT_ID` at repository level. Check `SITE_URL_STAGING` points at the staging Pages URL for smoke tests and DAST.
3. **Protect release tags.** In Settings → Rules → Rulesets, create an active **tag ruleset** targeting `v*`. Enable **Restrict updates** and **Restrict deletions**, with an **empty bypass list** (including for Hugo). Leave tag creation available for publishing releases. Record the ruleset configuration in the Stage 03 manual checks; existing release tags must not move or disappear (OPS-04, OPS-05).
4. **Verify agent workflow-write restrictions before bootstrap (blocking prerequisite).** The agent connection used for `590305e` successfully pushed `.github/workflows/` changes. Its permissions therefore do not meet the limited-token assumption in `docs/DELIVERY.md` ("Agent identity"). Hugo must restrict this connection to this repository with Contents, Pull requests and Issues read/write, without Workflows or Administration access, then record a **rejected workflow push** from that same agent connection on a disposable test branch. Confirm that rejection specifically denies workflow-file writes; a network error or a non-fast-forward rejection does not verify the boundary. Record only the sanitized rejection and connection identity, never credentials. Do not proceed to steps 6–7 until this verification passes. A same-repository workflow with `statuses: write` could otherwise report `approval` without Hugo's click. Agents never change the connection's permissions themselves. AC-5 remains unchecked until Hugo records this evidence.
5. **Install the workflows on the Stage 03 branch.** Using his owner connection, Hugo copies `pipeline/github/workflows/*.yml` into `.github/workflows/`, `pipeline/github/dependabot.yml` into `.github/`, and `docs/agents/workflows/agent-run.yml` into `.github/workflows/agent-run.yml`, commits those files and pushes. Workflow installation is Hugo's responsibility; the agent connection must have passed step 4. The action pins are already resolved; check that no `UNRESOLVED` or all-zero pin remains. Review the workflow diff and wait for the existing CI and Security checks to pass.
6. **Bootstrap on main.** Merge the installation PR under the existing protections after the permission verification in step 4 and Hugo's code and security review; do not remove or loosen any existing rule. Do not yet require the new `approval` and `preview` statuses: their reporters use default-branch workflows and cannot report until their definitions exist on `main`. Configure the Direct Upload Pages projects `artemis-ii-staging` and (or convert) `artemis-ii`; switch off automatic Git deployments when switching to the workflow deploys. Check that the first staging deployment succeeds.
7. **Verify and enable the new rules.** After the workflows are on `main`, open a test PR and verify that the `approval` status waits for Hugo's click, a successful preview reports its URL and `preview` status on the current commit, and the Security jobs publish their results. Then add the required checks to the `main` ruleset: `build` (CI), the Security jobs, `approval` and `preview`, with an empty bypass list. Before enabling, use the exact check names from that test PR; `preview-build` is separate from CI's `build`.
   Enable **Require code scanning results**, select **CodeQL**, and block **High or higher** security alerts (SEC-03). Successful CodeQL jobs only prove that analysis was uploaded; they do not prove that no high-severity alerts were found. Hugo configures this rule in GitHub and verifies the final protections with another push to the test PR, including that the pending `approval` status blocks merging. Do not merge the test PR until all required results and approvals are present.
8. **Remaining agent identity tests:** do the other "Verified in Stage 03" tests of `docs/DELIVERY.md` ("Agent identity") once the above is done and record the results in the PR. The workflow-write verification belongs to step 4 and must already have passed.
9. **Rollback:** from a clone of the repository, run `gh workflow run deploy-production.yml --ref vX.Y.Z -f tag=vX.Y.Z`, replacing both occurrences with the same published release tag. In the Actions UI, select that tag in **Use workflow from** and enter the same tag in the input. The workflow rejects branch refs or mismatched tags before deployment and verifies that the tag resolves to the triggering commit; keep the `production` environment restricted to tags `v*`.

### Stage 03 quality reports

- `preview-build.yml` runs Lighthouse 13.5.0 with its default mobile settings against the built Home page, an existing chapter and an existing photo. `scripts/lighthouse-pages.ts` selects the chapter and photo from the current build, so replacing sample content does not leave stale URLs. Download `preview-lighthouse-reports` for the HTML, JSON and execution logs.
- `deploy-staging.yml` runs Linkinator 8.1.0 after deployment, starting from the deployed `sitemap-index.xml` and following same-site pages. It checks internal and external links and fragment targets; download `staging-link-report` for its JSON and execution log.
- These two reporting steps use `continue-on-error` and upload their reports even when a scan fails. Review failures in the artifacts; score and link enforcement becomes blocking in Stage 11 (`QA-03`, `QA-04`). Neither report job has deployment or storage credentials.

The secret scan keeps the complete Git history and all default gitleaks rules. `.gitleaks.toml` adds one narrowly scoped false-positive exception: the public design file ID already linked in `docs/specs/design.md`, used as `fileKey` in historical and current Figma mock-server tests. The exception applies only to `generic-api-key`, the two exact test-file paths and that exact identifier together. It never exempts OAuth tokens, other values, other files or whole commits. Its scope is covered by `scripts/pipeline-review.test.ts` and was verified with synthetic credentials through gitleaks itself.

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
  Statuses follow `docs/PLAN.md` through the `linear-sync.yml` workflow, which moves each stage issue forward (never back) and only changes statuses. One-time setup:
  1. In Linear, create a personal API key (Settings, Security & access, Personal API keys) with "Only select permissions": check **Read** and **Write** (Write alone is rejected with `Invalid scope: read required`), leave Admin unchecked, and limit "Team access" to the team of the stage issues. Keep the key for step 2. Never paste it in a chat, a file or an agent environment.
  2. In GitHub, create the environment `linear`, with deployment branches limited to `main` (Selected branches and tags), and add the secret `LINEAR_API_KEY`.
  3. The workflow is `.github/workflows/linear-sync.yml`. Agent tokens cannot push workflow files, so Hugo adds or edits it.
  4. Until you switch writes on, every run is a dry run: after merging, the runs triggered by pushes and by hand only print what they would change. Run it by hand (Actions, Linear sync, Run workflow, leave the dry-run box ticked) and check the output against Linear.
  5. When the output is what you expect, create the variable `LINEAR_SYNC_APPLY` with the value `true` in the `linear` environment. From then on, pushes that change `docs/PLAN.md` apply the changes. To go back to dry runs, delete the variable or set it to anything else.
  6. To see what the plan asks for without any key, run `DRY_RUN=1 node scripts/linear-sync.ts` on your machine.
- **Notion:** a page "Artemis II" with a sub-page "Decision log (synced from repo)", filled automatically from `docs/PLAN.md` by the `notion-sync.yml` workflow. Only entries that end with `<!-- notion -->` are published, so nothing reaches Notion unless someone marks it as safe. The page may be public (see `AGENTS.md`). One-time setup:
  1. In Notion, create an internal connection (API token) at notion.so/profile/integrations, with the three content capabilities (read, update and insert content) and no user information.
  2. On the sub-page, open the `...` menu, then Connections, and add the connection. Share only that sub-page with it.
  3. In GitHub, create the environment `notion`, with deployment branches limited to `main` (Selected branches and tags), the secret `NOTION_TOKEN` and the variable `NOTION_PAGE_ID` (the sub-page ID or its URL).
  4. The workflow is `.github/workflows/notion-sync.yml`. It runs on `main` when `docs/PLAN.md` changes, and by hand.
  5. Run the workflow once by hand (Actions, Notion sync, Run workflow) and check the page.
  Do not edit that sub-page: every sync overwrites it. Keep your own notes on another page.
- **Obsidian:** open the `docs/` folder as a vault. Use relative paths for links and turn wikilinks off, so links keep working on GitHub. `docs/.obsidian/` is git-ignored.
- **Slack:** a private channel with the GitHub app subscribed to this repository (`pulls`, `reviews`, `issues`, `releases`, `deployments`) and Linear's team notifications. Do not add Slack to the routine.

## 7. Work order for the next stage (any agent)

After each stage merge, `next-stage.yml` opens an issue `Run Stage NN: <name>` (label `agent-task`) with the kickoff prompt, the spec link and the needed capabilities, so any agent can start from it (`docs/agents/README.md`, "Universal flow").

1. The workflow is `.github/workflows/next-stage.yml`. It runs when a stage PR is merged. Agent tokens cannot push workflow files, so Hugo adds or edits it.
2. No secret or variable is needed: the job uses the automatic token with `contents: read` and `issues: write`. The `agent-task` label is created on the first run.
3. After the next stage PR is merged, check that the issue exists. To test earlier, run `PR_NUMBER=<n> GITHUB_REPOSITORY=<owner>/<repo> DRY_RUN=1 node scripts/next-stage-issue.ts` on your machine: it prints the issue without creating it.

## Keep in mind

- Agent runs use your usage limits on each platform.
- A green status in an agent's run list only means there was no infrastructure error. What counts is the PR and its preview.
- Everything agents do on GitHub currently appears under your user (see "Agent identity" in `docs/DELIVERY.md`).
- Anyone who uses an agent environment can see its variables. Keep each environment for this project only.
