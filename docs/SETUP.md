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
2. **Secrets and variables** as listed in "Secrets and configuration" of `docs/DELIVERY.md`: `CLOUDFLARE_API_TOKEN` in `preview`, `staging` and `production`; the `SITE_URL_STAGING` / `SITE_URL_PRODUCTION` variables and `CLOUDFLARE_ACCOUNT_ID` at repository level. Check `SITE_URL_STAGING` points at the staging Pages URL for smoke tests and DAST.
3. **Protect release tags.** In Settings → Rules → Rulesets, create an active **tag ruleset** targeting `v*`. Enable **Restrict updates** and **Restrict deletions**, with an **empty bypass list** (including for Hugo). Leave tag creation available for publishing releases. Record the ruleset configuration in the Stage 03 manual checks; existing release tags must not move or disappear (OPS-04, OPS-05).
4. **Prepare Cloudflare before the bootstrap merge (blocking prerequisite).** Create or configure the Direct Upload Pages projects `artemis-ii-staging` and `artemis-ii`, and verify their deployment credentials and variables. Disable automatic Git deployments for both production and preview branches of the existing Git integration before any merge of the installation PR. Confirm that a push to `main` can no longer publish production through that integration. The staging project must exist before the merge starts its workflow; production must change only through a published release.
5. **Prepare the dedicated approval App before bootstrap (blocking prerequisite).** Follow "Dedicated approval App" below: Hugo creates a separate status-only App, installs it only on this repository, and stores its key and App ID only in the protected `approval` environment. Verify each agent connection cannot approve protected environments, change rulesets/settings or read their secrets. The ChatGPT Codex Connector can write workflows; Hugo chose to keep it and replace the previous workflow-write-denial assumption with an App-bound approval. GitHub's installed-app screen offers repository selection, not arbitrary removal of an app's requested permissions. Do not rely on the old GitHub Actions approval reporter. AC-5 stays unchecked until the new environment and source binding are verified.
6. **Install the workflows on the Stage 03 branch.** Review the active `.github/` files and their proposed copies. Where the agent connection cannot push workflows, Hugo copies `pipeline/github/workflows/*.yml` into `.github/workflows/`, `pipeline/github/dependabot.yml` into `.github/`, and `docs/agents/workflows/agent-run.yml` into `.github/workflows/agent-run.yml` from his local clone, commits and pushes. The action pins are resolved; check that no `UNRESOLVED` or all-zero pin remains. Wait for the existing CI and Security checks to pass.
7. **Bootstrap on main.** Merge the installation PR under the existing protections after steps 4–5 and Hugo's code and security review; do not remove or loosen any existing rule. Do not yet require the new `approval` and `preview` statuses: their reporters use default-branch workflows and cannot report until their definitions exist on `main`. Check that the first staging deployment succeeds and production did not change. Keep stage runners paused until steps 8–9 are complete.
8. **Verify and enable the new rules.** After the workflows are on `main`, open a test PR and verify that the `approval` environment waits for Hugo's click, then the dedicated App reports the custom `approval` status on the current head SHA. Verify the preview URL/status and Security results. Add the required checks to the `main` ruleset: `build` (CI), the Security jobs, `approval` and `preview`, with an empty bypass list. Select the dedicated approval App as the **expected source** of `approval`; neither **any source** nor **GitHub Actions** is acceptable. Use the exact check names from the test PR; `preview-build` is separate from CI's `build`, and `approve` is a job name, not the custom `approval` context.
   Enable **Require code scanning results**, select **CodeQL**, and block **High or higher** security alerts (SEC-03). Successful CodeQL jobs only prove that analysis was uploaded; they do not prove that no high-severity alerts were found. Hugo configures this rule in GitHub and verifies the final protections with another push to the test PR, including that the pending `approval` status blocks merging. Do not merge the test PR until all required results and approvals are present.
9. **Remaining agent identity tests:** complete the "To verify in Stage 03" tests of `docs/DELIVERY.md` ("Agent identity") and record the results. App source binding does not replace verification that an agent cannot approve the protected environment or access its key. If any boundary fails, stop the rollout and keep AC-5 unchecked.
10. **Rollback:** from a clone of the repository, run `gh workflow run deploy-production.yml --ref vX.Y.Z -f tag=vX.Y.Z`, replacing both occurrences with the same published release tag. In the Actions UI, select that tag in **Use workflow from** and enter the same tag in the input. The workflow rejects branch refs or mismatched tags before deployment and verifies that the tag resolves to the triggering commit; keep the `production` environment restricted to tags `v*`.

### Dedicated approval App (Hugo, once)

1. In GitHub Settings → Developer settings → GitHub Apps, create a private App for this account, for example `artemis-ii-approval-hugovp` (choose a unique name). Its homepage can be this repository. Turn off the webhook and request no user authorization or events.
2. Grant **Repository permissions → Commit statuses: Read and write** only; Metadata read is implicit. Grant no Contents, Workflows, Actions, Administration, Checks or Pull requests permission. This App is separate from the agent publisher App.
3. Install it on **Only select repositories → HugoVP/artemis-ii**. Note its numeric **App ID**, not its client ID or installation ID. Generate its private key and keep it in Hugo's password manager; never share it with an agent or paste it in a PR/chat.
4. In the GitHub environment `approval`, restrict deployment branches to **main only**, make Hugo a required reviewer and disable administrative bypass of its protections. Store the numeric App ID as the environment variable `APPROVAL_APP_ID` and the key as the environment secret `APPROVAL_APP_PRIVATE_KEY`. Neither value is set by agents; the key is never repository-level or in the `agents` environment. If the App or key is missing, the reporter fails closed.
5. After the bootstrap merge, approve the protected environment on the test PR. Its `approval` status must be authored by the dedicated App. Configure the required status's expected source to that App in the active `main` ruleset, with no bypass actors. Record the source-bound rule; a GitHub Actions status with the same context cannot satisfy it. Agents never post a fake approval to test this.
6. Inspect the rule with the read-only helper. In a local clone, create `.agent/`, then run `gh api repos/HugoVP/artemis-ii/rulesets/24929267 > .agent/approval-ruleset.json` and `node scripts/approval-ruleset.ts .agent/approval-ruleset.json 123456`. Replace `123456` with the approval App's numeric ID and the ruleset ID if the rule was recreated. This refuses inactive rules, bypass actors, missing main coverage, and approval from GitHub Actions, another App or any source. It changes no settings.
7. Push another commit to the test PR and verify that merging is blocked until Hugo approves the new head's environment job and the dedicated App reports on that head. Inspect `integration_id` in the downloaded rule and the status author before marking AC-5 complete. The environment and ruleset checks are manual; passing unit tests alone does not verify the live configuration.

References: [GitHub App installation permissions](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps), [expected status-check source](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging).

### Stage 03 quality reports

- `preview-build.yml` runs Lighthouse 13.5.0 with its default mobile settings against the built Home page, an existing chapter and an existing photo. `scripts/lighthouse-pages.ts` selects the chapter and photo from the current build, so replacing sample content does not leave stale URLs. Download `preview-lighthouse-reports` for the HTML, JSON and execution logs.
- `deploy-staging.yml` runs Linkinator 8.1.0 after deployment, starting from the deployed `sitemap-index.xml` and following same-site pages. It checks internal and external links and fragment targets; download `staging-link-report` for its JSON and execution log.
- These two reporting steps use `continue-on-error` and upload their reports even when a scan fails. Review failures in the artifacts; score and link enforcement becomes blocking in Stage 11 (`QA-03`, `QA-04`). Neither report job has deployment or storage credentials.

The secret scan keeps the complete Git history and all default gitleaks rules. `.gitleaks.toml` adds one narrowly scoped false-positive exception: the public design file ID already linked in `docs/specs/design.md`, used as `fileKey` in historical and current Figma mock-server tests. The exception applies only to `generic-api-key`, the two exact test-file paths and that exact identifier together. It never exempts OAuth tokens, other values, other files or whole commits. Its scope is covered by `scripts/pipeline-review.test.ts` and was verified with synthetic credentials through gitleaks itself.

A second exception covers photos' public NASA image IDs, stored as `pathKey` in `media-lock.json`, `src/content/photos/*.json` and `scripts/ingest.test.ts`. It applies only to `generic-api-key`, only to a `pathKey` assignment and only to the verified NASA ID forms, so a credential-shaped value in the same file and field is still reported. `npm run test:gitleaks` proves both cases with the real binary; it needs gitleaks 8.28.0 on `PATH` or in `GITLEAKS_BIN`, fails without it, and runs in the `secrets` job right after the checksum-verified download. The scanner-free part of that scope is covered by `scripts/pipeline-review.test.ts`.

## 2. Cloudflare

1. **Pages:** the project connected to the repo (already done). Until Stage 03 it deploys previews and `main` on its own; the production URL is not shared with anyone yet. **(Stage 03)** Two projects in the same Cloudflare account: `artemis-ii` for production and `artemis-ii-staging` for staging and previews (see "Cloudflare Pages setup" in `docs/DELIVERY.md`).
2. **No R2:** do not activate R2 or create buckets/tokens for Artemis II. Media is generated without secrets and bundled at `/media` with the HTML on Pages. Do not enable Functions, Workers or paid image transformations for this purpose.
3. **Pages token:** create a Cloudflare API token with Account → Cloudflare Pages → Edit, limited to the intended account. Store `CLOUDFLARE_API_TOKEN` only in GitHub environments `preview`, `staging` and `production`; never as a repository secret or in an agent shell. `preview` and `staging` permit main only; `production` permits release tags `v*` only and requires Hugo, with administrative bypass disabled.
4. **Variables:** repository variables `CLOUDFLARE_ACCOUNT_ID`, `SITE_URL_STAGING`, `SITE_URL_PRODUCTION`. The pipeline fixes `MEDIA_BASE_URL=/media`; `MEDIA_BASE_URL_STAGING` and `MEDIA_BASE_URL_PRODUCTION` are no longer consumed.
5. **Disable automatic Git deployments:** Workers & Pages → existing `artemis-ii` project → Settings → Builds / Branch control. Disable automatic production branch deployments and set preview branches to None; save before the bootstrap merge. Cancel pending automatic builds. The existing Git-integrated project can accept Wrangler direct uploads without converting or deleting it. Create missing staging with `npx --yes wrangler@4.151.1 pages project create artemis-ii-staging --production-branch=main`. Keep production's current domain (the project name can differ from the pages.dev hostname).
6. **Manual cleanup only (Hugo):** after confirming nothing else uses them, remove obsolete `R2_STAGING_ACCESS_KEY_ID`, `R2_STAGING_SECRET_ACCESS_KEY`, `R2_PRODUCTION_ACCESS_KEY_ID`, `R2_PRODUCTION_SECRET_ACCESS_KEY`, `R2_STAGING_BUCKET`, `R2_PRODUCTION_BUCKET` and environment-specific `MEDIA_BASE_URL_*` configuration if it was created. Review/revoke unused R2 credentials and review any existing R2 resources/subscription yourself; agents neither delete resources nor change settings. If R2 was never activated, leave it inactive.
7. **Live verification:** after bootstrap, check actual optimized image responses and local original downloads when Stage 06 ingestion exists. Verify release-only production and restore an earlier production Pages deployment to prove HTML/media roll back together. Limits and local fixture tests do not prove deployment behavior. Follow the approval App verification above; this media amendment does not close AC-5 or AC-7.


## 3. Figma

1. Connect Figma in claude.ai → Settings → Connectors (done).
2. The design file "Artemis II - Site" exists and its URL is `FIGMA_FILE_URL` (done).
3. To review the design: open the file, check the Foundations, Components and Screens pages, and leave comments on the PR. Merging the PR approves the design.

## 4. Agents

Each agent runs in its own sandbox with the same rules (`AGENTS.md`). Setup per agent is in `docs/agents/`:

- Claude Code: `docs/agents/claude-code.md` (environment `artemis-ii`, routine, Figma connector).
- Other agents: `docs/agents/other-agents.md`.

Every agent environment gets:

- **Variables:** only `FIGMA_FILE_URL`, `MEDIA_BASE_URL=/media` and `CONTACT_URL`. Hugo removes any obsolete `R2_*` configuration manually; R2 is not used.
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
  3. The workflow is `.github/workflows/linear-sync.yml`. Hugo adds or edits it when the agent connection has no workflow-write access.
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

1. The workflow is `.github/workflows/next-stage.yml`. It runs when a stage PR is merged. Hugo adds or edits it when the agent connection has no workflow-write access.
2. No secret or variable is needed: the job uses the automatic token with `contents: read` and `issues: write`. The `agent-task` label is created on the first run.
3. After the next stage PR is merged, check that the issue exists. To test earlier, run `PR_NUMBER=<n> GITHUB_REPOSITORY=<owner>/<repo> DRY_RUN=1 node scripts/next-stage-issue.ts` on your machine: it prints the issue without creating it.

## Keep in mind

- Agent runs use your usage limits on each platform.
- A green status in an agent's run list only means there was no infrastructure error. What counts is the PR and its preview.
- Everything agents do on GitHub currently appears under your user (see "Agent identity" in `docs/DELIVERY.md`).
- Anyone who uses an agent environment can see its variables. Keep each environment for this project only.
