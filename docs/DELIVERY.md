# Delivery: environments, pipeline and security

How code goes from an agent's sandbox to production, which checks it passes on the way, and who holds which credentials. This is the target design; Stage 03 builds it, and its spec refines the details. Until Stage 03 is merged, Cloudflare Pages' Git integration deploys previews and `main` directly (Hugo's decision, 2026-10-15), and the production URL is not announced to anyone.

## Environments

| Environment | Built from | Triggered by | URL | Media | Approval |
| --- | --- | --- | --- | --- | --- |
| Local | Agent's working branch | The agent | `localhost` in the sandbox | Git-ignored generated local folder under `/media` | Local checks pass |
| Preview | PR head commit (same-repository PRs; fork PRs are build-only) | Every push to a same-repository PR | Per-PR URL in the staging Pages project, posted on the PR | Bundled into the preview itself under `/media/` from the PR's media artifact; no bucket | Hugo reviews the stage here |
| Staging | `main` | Every merge to `main` | Stable URL of the staging Pages project | Bundled under `/media/` in the same Pages deployment | Hugo merged the PR |
| Production | Release tag `vX.Y.Z` | Hugo publishes a GitHub Release | Public URL (production Pages project) | Bundled under `/media/` in the same Pages deployment | Hugo published the release |

Static sites bake URLs into the HTML, so each environment is a separate build of the **same commit** with its own configuration (`MEDIA_BASE_URL`, site URL). Builds are reproducible from `package-lock.json`; production always builds the exact commit that was already on staging.

```
agent branch ──PR──► CI + security checks ──► preview deploy ──► Hugo reviews
                                                                    │ merge
                                                                    ▼
                         staging deploy ◄── main ──► next stage starts
                               │
                     Hugo publishes release vX.Y.Z
                               ▼
                bundled build ──► production deploy ──► smoke tests
```

## Pipeline (GitHub Actions)

| Workflow | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | PR | `npm ci`, `check`, `build`, `test` (Playwright). Until Stage 02 adds `package.json`, a guard skips the build; Stage 02 removes the guard so the steps are unconditional afterwards |
| `security.yml` | PR, push to `main`, weekly | Secret scan, dependency audit and review, CodeQL, workflow lint |
| `preview-build.yml` | PR | Unprivileged: no secrets, read-only token. Generates the PR's media variants, builds the PR code with `MEDIA_BASE_URL=/media`, copies the generated media into `dist/media/` and uploads `dist/` as one artifact, so the preview serves its own media from its own URL. Lighthouse report from this job |
| `deploy-preview.yml` | `workflow_run`, after `preview-build.yml` completes | Privileged, but **defined on the default branch**: GitHub runs a `workflow_run` workflow from `main`, so a PR cannot edit it or reference secrets through it. Takes the commit SHA and PR number from the `workflow_run` event payload, never from the artifact. Runs only when the run belongs to this repository (`head_repository` equals the repository); for fork runs it deploys nothing and reports `preview` success with a note. Downloads the artifact as data, never executes, sources or installs anything from it, uploads it to a Pages preview with a fixed project name, ignoring any configuration file inside the artifact and passing the PR number only through an environment variable, posts the URL on the PR and reports the `preview` status on the PR head SHA |
| `deploy-staging.yml` | Push to `main` | No-secrets build generates media, builds HTML with `MEDIA_BASE_URL=/media`, packages and validates one complete artifact. A separate credential-only job deploys it to staging. Smoke tests check HTML, headers and media; link reports follow |
| `approval.yml` | `pull_request_target` (`opened`, `synchronize`, `reopened`), defined on the default branch | Checks out nothing and runs no PR code. One job in the `approval` environment waits for Hugo's click, then creates a short-lived token of a dedicated approval GitHub App, scoped to this repository and Commit statuses write only. It reports `approval` on `github.event.pull_request.head.sha`. The ruleset accepts this context only from that App, so another workflow's GitHub Actions token cannot impersonate the approval. A new push needs a new approval |
| `deploy-production.yml` | Published release; manual rollback tag | Release gate still requires a published non-draft release, exact triggering SHA on main and a successful staging workflow triggered by a `push` to `main` for that SHA. The no-secrets build regenerates and verifies the release media contract and packages HTML/media together. One separate credential-only Pages deploy job waits in the protected production environment for Hugo. Smoke tests follow. No bucket upload or promotion |
| `media.yml` | PR | No-secrets generation shell for Stage 06, with a media artifact only. No reusable upload target, storage credentials, upload or promotion job. Preview/staging/production builds each generate and package their own media |
| `next-stage.yml` | `pull_request_target` (`closed`), defined on the default branch | After a stage PR is merged (merged, from a branch of this repository, title starts with `Stage `), opens a GitHub issue "Run Stage NN: <name>" with the label `agent-task` for the next pending stage (`scripts/next-stage-issue.ts`, no dependencies). The issue is the agent-neutral work order: it holds the kickoff prompt, the spec link, the capabilities the stage needs and the Linear issue, so any agent can start from it. Reads only `docs/PLAN.md` from the default branch, never PR code; the PR title is used only in the job condition and never appears in the issue. No secrets: the automatic token with `contents: read` and `issues: write`. It does not open duplicates |
| `notion-sync.yml` | Push to `main` that changes `docs/PLAN.md` or the script; manual run | One-way publication of the stage status and the Decisions and Log entries marked `<!-- notion -->` (allowlist) to one Notion page (`scripts/notion-sync.ts`, no dependencies). Runs only on `main`, so PR code never sees the Notion token. One job in the `notion` environment: runs the script's unit tests (no credentials needed), then the script, which appends the new blocks and deletes the old ones, and refuses to publish content that looks like a session link, token or email address (checked on each block's joined text, so a value split across rich-text items is caught). The Notion page may be public, so only repository content that is already public goes there |
| `linear-sync.yml` | Push to `main` that changes `docs/PLAN.md` or the scripts; manual run (a dry run by default) | Moves the Linear issue of each stage forward to the status `docs/PLAN.md` says (`pending` = Todo or Backlog, `in review` = In Review, `approved` = Done), with `scripts/linear-sync.ts` (no dependencies). Forward only, because `PLAN.md` lags a merge (a stage becomes `approved` in the next stage's PR) and Linear's own GitHub automation may already have moved the issue; canceled issues are left alone. It only changes statuses: no issues, comments or descriptions are created or edited. Runs only on `main`, in one job in the `linear` environment (unit tests first, without credentials), so PR code never sees the Linear key. Every run is a dry run until the variable `LINEAR_SYNC_APPLY` is `true` in that environment, so the first authenticated run is reviewed before anything is written. Each issue is read again right before its update, so a status Linear's own integration set meanwhile is not overwritten (the update itself cannot be made conditional, so a window of a few milliseconds remains). It fails with a clear message if a status name is missing in the Linear team |
| `dast.yml` | Weekly and after staging deploys | OWASP ZAP baseline scan of staging (report, non-blocking) |

Required checks for merging into `main` (set in the ruleset once Stage 03 is merged): CI, the Security jobs, `approval`, and `preview`. The custom `approval` status must require the dedicated approval App as its expected source, never "any source" or GitHub Actions. `preview` is reported by `deploy-preview.yml` on the PR head SHA. The initial installation is merged under existing protections after Hugo's review; verify the default-branch reporters on a test PR before enabling the new required statuses.

**Fork policy.** Pull requests from forks get no secrets, so `preview-build.yml` runs (CI and security checks still apply) but `deploy-preview.yml` deploys nothing and `preview` reports success with the note "preview not available for fork PRs". Hugo reviews fork PRs locally before merging, and fork PRs never reach staging or production without his approval.

**Code from a PR never runs with credentials.** Build, test and ingest jobs for a PR run with read-only tokens and no secrets. Anything that uses a credential (deploying the bundled site) runs in a separate job that downloads an artifact and does not execute code from the PR, and whose workflow definition comes from the default branch (`workflow_run`, or a workflow that only runs on `main` or on release tags), so a PR cannot rewrite the privileged steps. The artifact is treated as untrusted data: nothing in it is executed or sourced, and the PR number and SHA come from the event payload. Changes to `package.json` scripts or `scripts/` in a PR therefore cannot read deployment or storage keys.

**One narrow exception: the model key of an agent run.** When the pipeline runs an agent (`agent-run.yml`, planned in `docs/MULTI-AGENT-PHASES.md`), the `work` job holds one model API key next to project code, because the agent runs the project's own scripts. That key is a dedicated key with a spending limit set in the provider's console, lives in the GitHub environment `agents` (deployment branch policy: `main` only), and is exposed only to the step that starts that agent. It is the only credential the agent can reach: the job has no GitHub write token and no deployment or storage credentials, and the repository-wide rule above still holds for every other job. The agent and all project code (npm included) run in a container started by the job, as the runner's user, without the Docker socket and with only the workspace mounted (`.git` read-only); the job's own steps run on the runner and never run project code. For stages that need Figma, the agent gets no Figma credential: the Figma gateway, a trusted script from `main` running on the runner, exchanges the stored refresh token for the run's access token, keeps it out of the agent's container, and forwards only the stage's tools on the design file of `FIGMA_FILE_URL`. A separate job, on a fresh runner with a clean checkout of `main`, replaces the token when the run ends. Claude Code is the exception to the exception: it holds no model key at all. The `work` job has `id-token: write`, a trusted script on the runner fetches short-lived GitHub OIDC tokens into a file, and only that file reaches the container, read-only; the request variables that can mint tokens never do (`docs/specs/claude-wif.md`).

## Gates

| Gate | Kind | Blocks |
| --- | --- | --- |
| Local checks (`check`, `build`, `test`, `npm audit`, from Stage 02; `gitleaks` when available) | Automated, run by the agent | Opening the PR |
| CI + security checks | Automated | Merge |
| Spec acceptance criteria | Automated tests + Hugo's manual checklist | Merge |
| Optional reviewer agent | AI, advisory | Nothing; findings are answered in the PR |
| Hugo's review of the preview, approved with one click in the `approval` environment | Human | Merge (the `approval` check stays pending until Hugo approves) |
| Release, approved by Hugo in the `production` environment | Human | Production |
| Post-deploy smoke tests | Automated | Marks the deployment failed; Hugo rolls back |

## Security controls

| Control | Tool | When | Blocking |
| --- | --- | --- | --- |
| Secret scanning | GitHub secret scanning with push protection, plus gitleaks in CI | Every push (push protection) and every PR | Yes |
| Dependency vulnerabilities | `npm audit --audit-level=high` | Every PR, weekly | Yes (high and critical) |
| New dependencies | GitHub dependency review on PRs | Every PR that changes the lockfile | Yes (high and critical) |
| Dependency updates | Dependabot alerts and updates (npm and GitHub Actions) | Weekly | No (opens PRs) |
| Static analysis | CodeQL for JavaScript/TypeScript and GitHub Actions | Every PR, weekly | Yes (high severity) |
| Workflow hardening | Least-privilege `permissions`, actions pinned to commit SHAs, actionlint | Every PR touching `.github/` | Yes |
| Security headers | `public/_headers` (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), checked by a test | Every build | Yes |
| Dynamic scan | OWASP ZAP baseline against staging | Weekly, after staging deploys | No (report) |
| Quality | Lighthouse (mobile), link checker | Preview and staging | Report until Stage 11, then blocking |

Local security checks every agent runs before opening a PR: `npm audit --audit-level=high` once the npm project exists (from Stage 02, which adds `package.json` and `package-lock.json`) and, if available in the sandbox, `gitleaks detect` (every stage, including Stages 00 and 01).

## Secrets and configuration

| Name | Kind | Lives in | Used by |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (Pages edit only; Cloudflare scopes it to the account, not to one Pages project) | Secret | GitHub environments `preview` and `staging` (deployment branch policy: `main` only) and `production` (release tags only), never repository-level | Credential-only deploy jobs of the preview, staging and production workflows, all defined on the default branch |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | GitHub Actions | Pages deploy workflows |
| `SITE_URL_STAGING`, `SITE_URL_PRODUCTION` | Variable | GitHub Actions | Builds (canonical, hreflang, Open Graph) |
| `NOTION_TOKEN` (Notion internal connection, shared with one page only) | Secret | GitHub environment `notion` (deployment branch policy: `main` only), never repository-level | `notion-sync.yml` |
| `NOTION_PAGE_ID` | Variable | GitHub environment `notion` | `notion-sync.yml` |
| `LINEAR_API_KEY` (Linear personal API key) | Secret | GitHub environment `linear` (deployment branch policy: `main` only), never repository-level | `linear-sync.yml` |
| `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` (ids of the Anthropic workload identity federation rule of Claude Code; no secret, no static Anthropic key) | Repository variables | Repository settings | `prepare` (shape check) and the agent step of the `work` job, which passes them to the agent's container. The OIDC token comes from the `work` job's `id-token: write`, is fetched by a trusted script on the runner and reaches the container only as a read-only file ([`docs/agents/claude-code-wif.md`](agents/claude-code-wif.md)) |
| `AGENT_KEY_<ID>` (one dedicated model API key per registered agent that uses a static key, with a spending limit) | Secret | GitHub environment `agents` (deployment branch policy: `main` only), never repository-level | The step that starts that agent in the `work` job of `agent-run.yml` |
| `FIGMA_MCP_CLIENT_ID`, `FIGMA_MCP_REFRESH_TOKEN` and, if the client has one, `FIGMA_MCP_CLIENT_SECRET` (a grant of Figma's MCP server, made once by Hugo with an approved client) | Secret | GitHub environment `agents` (deployment branch policy: `main` only) | The Figma gateway of the `work` job (a trusted copy of `scripts/figma-mcp-gateway.ts`, on the runner, outside the agent's container), which issues the run's access token and keeps it, and the `figma-revoke` job, from a clean checkout of `main`, which replaces it at the end. Only for stages that need `figma-read` or `figma-write`. The agent gets neither these secrets nor the access token; the gateway forwards only the stage's tools on the design file. The token carries the Figma permissions of the account that signed in: an account with access to the design file only adds a second boundary |
| `AGENT_APP_PRIVATE_KEY` (key of the GitHub App that opens agent PRs) and `AGENT_APP_ID` | Secret and variable | GitHub environment `agents` | The `publish` job of `agent-run.yml`, which runs no project code |
| `APPROVAL_APP_PRIVATE_KEY` and `APPROVAL_APP_ID` (a separate App with Commit statuses write only) | Secret and variable | GitHub environment `approval`, restricted to `main` with Hugo as required reviewer, never repository-level or in an agent environment | `approval.yml`, only after Hugo approves the environment job |
| `AGENT_TRUSTED_LOGIN` (Hugo's GitHub login) | Variable | GitHub Actions (repository variable) | The authorization checks of `agent-run.yml` |
| `CONTACT_URL` | Variable | GitHub Actions and agent environments | Builds |
| `FIGMA_FILE_URL` | Variable | Agent environments, and the repository variables for the agent pipeline | Design work; in the pipeline, the only file the Figma gateway lets through |
| `MEDIA_BASE_URL=/media` | Variable | Agent environments | Local development |

Agent environments never contain Cloudflare or R2 credentials, and vendor agent environments never contain the model keys of `agent-run.yml`. **No credential is a repository-level secret:** a workflow in a same-repository PR can read repository-level secrets, but not environment secrets whose deployment policy allows only `main` or release tags. Each credential lives in the environment of the jobs that use it.

- **The Cloudflare Pages token** cannot be limited to one Pages project, so the `production` environment does not isolate it, and this design does not claim it does. Its boundary is the code allowed to read it: only credential-only deploy jobs in workflows defined on the default branch hold it; they run no project code, never execute, source or read configuration from the artifact they deploy, use a Pages project name and target branch fixed in the workflow, and receive the PR number (the only PR-derived value) through an environment variable, never interpolated into a shell command. The `production` environment approval and the release gate control what reaches production, not who can read the token. Changing those workflows takes a PR to a protected path that Hugo approves. If Cloudflare offers per-project token scopes, Stage 03 splits it into a preview and staging token and a production token held only in the `production` environment, and verifies the current behavior when it builds the pipeline.

## Media flow

Hugo authorized replacing R2 with static Pages assets on 2026-10-18. `MEDIA_BASE_URL=/media` in every pipeline build. No Functions, Workers or billed image transformations serve these assets.

1. Stage 06 implements no-secrets ingestion: approved NASA downloads, AVIF/WebP variants, thumbnail and OG image. Binaries and generated output remain git-ignored.
2. All builds generate `media-out/manifest.json` and files under `photos/<nasa-id>/<hash>/`. `hash` derives from source bytes and versioned variant settings; Stage 06 records and verifies source/output checksums against the approved manifest, failing if a NASA source or tool output drifts. This PR provides the contract and empty shell, not ingestion.
3. `package-media.ts` validates the manifest, referenced files and local original sizes; replaces `dist/media/` with the generated media; and checks the complete artifact. HTML, optimized images, eligible unchanged originals and manifest become one artifact and one Pages deployment. A later release must not reference a staging-only URL.
4. Originals at most **26,214,400 bytes (25 MiB)** are included unchanged. Larger originals are omitted and represented by a verified HTTPS NASA URL and exact byte size; the gallery explicitly labels an external original download. Never embed that external source as an image or claim a recompressed derivative is the original. Stage 06 verifies URL provenance, final redirect destination, measured bytes and checksums; schema validation alone cannot establish provenance.
5. Build and deploy both fail when any file exceeds 26,214,400 bytes or the complete site exceeds **20,000 files**, including HTML, fonts, metadata and media. Exactly those limits are accepted. Symlinks/non-regular entries are rejected. The deploy job uses inline validation, never artifact scripts. Worker entrypoints and Functions are forbidden. No automatic paid-service fallback.
6. Smoke tests load the deployed manifest and real image bytes when photos exist, reject HTML fallbacks, and check local-original lengths. An empty manifest is allowed only before `scripts/ingest.ts` exists. Stage 06 adds representative image decoding and checksum coverage for actual ingested assets.
7. The preferred exact rollback restores a previous **production Pages deployment**, recovering its HTML and media together. The existing tag workflow remains gated; rebuilding an old tag requires Stage 06 checksum verification and must fail on source drift. Retain release manifests/checksums and production deployment IDs; do not delete deployment assets independently.

The six-source evaluation measured 60 optimized files totaling 5.23 MiB (largest 0.77 MiB); five originals fit, while NHQ202604110008 at 32.4 MiB requires an external link. The illustrative 38-photo projection is 33.1 MiB and 380 optimized files, not a measured final selection or visual approval of compression. See `docs/pages-media-evaluation.md`.

Static requests do not incur Pages Functions usage when no Functions run. This is not a zero-cost guarantee for the whole project: GitHub Actions, agent APIs and other products have independent conditions.

References: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [static requests and Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).

## Releases and rollback

- Hugo publishes a GitHub Release from `main` with a semantic version tag (`v0.1.0`, `v0.2.0`, …) and GitHub's auto-generated notes. That is the only way to change production.
- Suggested milestones are listed in `docs/PLAN.md`; Hugo can release at any time.
- **Rollback:** run `deploy-production.yml` manually with a previous tag that has a published release; the release gate rejects tags without one, so a tag created by hand cannot reach production. Cloudflare Pages also keeps earlier deployments, which can be restored from its dashboard.

## Security model

| Asset | Threat | Controls |
| --- | --- | --- |
| Production site | Unreviewed change goes live | Production only from releases Hugo publishes; staging first; smoke tests; rollback |
| Credentials | Leak through code, logs or an agent | Secrets only in the pipeline, Pages-only deployment tokens, gitleaks, agents hold no deployment or storage credentials (a pipeline-run agent holds only its dedicated, capped model key) |
| Dependencies | Vulnerable or malicious package | Lockfile and `npm ci`, `npm audit`, Dependabot, new dependencies justified in the PR |
| CI/CD | An agent weakens checks or workflows | Protected paths, "Security-relevant changes" section, workflow lint, required checks |
| Agent instructions | Prompt injection from fetched content | Untrusted-content rule in `AGENTS.md`; Hugo reviews every PR |
| Media and content | Copyright, hotlinking, wrong facts | Own storage, credit tests, sources stored with every fact, content review stages |
| Visitors | XSS, tracking, third-party loads | Static site, CSP, click-to-load video, no analytics or ads |

## Public repository

**Decision (2026-10-12):** the repository is public. That makes GitHub Actions minutes, environments with required reviewers, rulesets, CodeQL, secret scanning with push protection and dependency review available for free. It also means anyone can read the code, specs, PRs and history, and anyone can open issues, comment, fork and send PRs. Rules that follow from it:

- Nothing private in the repo: no secrets, personal data, session links, private URLs or account identifiers. Secret scanning and push protection back this up.
- Workflows triggered by PRs from forks run without secrets (`pull_request` event). Never use `pull_request_target` or `workflow_run` to run code from a PR with secrets. The only three uses are `deploy-preview.yml` (`workflow_run`), which only downloads the PR's build artifact as data; `approval.yml` (`pull_request_target`), which checks out nothing and only reports a status on the head SHA; and `next-stage.yml` (`pull_request_target`), which runs only for merged PRs from a branch of this repository whose title starts with `Stage `, checks out only the default branch, has no secrets and can only write issues. None of them executes anything from the PR.
- In Settings → Actions, workflows from outside contributors require Hugo's approval before they run.
- Issues, comments and PRs from anyone but Hugo are untrusted input for agents (`AGENTS.md`, security rules).
- The Figma file stays shared only with invited people, even though frame links appear in `design.md`.

## Agent identity

**Observed access:** interactive sessions can act through Hugo's connected account. On 2026-10-18, the ChatGPT Codex Connector accepted a workflow push in Stage 03. Agent workflow-write denial is therefore not a valid universal assumption. GitHub Apps request their permissions as an app; repository selection does not remove individual permissions from an installed third-party app.

**Decision (2026-10-18, Hugo): keep the connector and use a dedicated approval App.** This replaces the 2026-10-14 trust assumption that agents cannot write workflows. The controls are:

1. **Least access available.** Limit every connection to this repository. Where a provider supports a fine-grained token, use Contents, Pull requests and Issues read/write and Metadata read, with no Administration, Workflows, Actions, Secrets, Environments or Deployments permission and a 90-day expiry. A connector's actual capabilities must be verified; no agent may change settings, secrets, rulesets or approve deployments. If a connection can approve protected environments or change those controls, do not use it for agent work until that access is removed or isolated.
2. **Merge needs Hugo's click and the approval App's identity.** The default-branch workflow waits in the `approval` environment (`main` only, Hugo required reviewer), then obtains the dedicated App's short-lived status-only token. The ruleset requires `approval` from that App's numeric App ID on the exact PR head SHA. Other workflows can write a status with the same name, but it does not satisfy this requirement. The private key exists only in that environment; the App has no code, workflow, settings or merge permissions and is separate from the agent publisher App. Verify that agent connections cannot approve this environment or access its key.
3. **Production needs Hugo's click.** Only the credential-only Pages deploy job runs in the `production` environment, with Hugo as required reviewer and deployments limited to `v*` tags. Build and media generation have no secrets and never run in the credentialed job.
4. **No shortcuts.** Rulesets on `main` (pull request required, required checks, no force push, no deletion) and on `v*` tags (no updates or deletions) with an empty bypass list, so they apply to Hugo's account too.
5. **Transparency.** Every agent PR names the agent in its body and gets the `agent-authored` label; commits carry the agent's `Co-Authored-By` trailer.

**To verify in Stage 03** (record evidence in the PR; these manual checks are not complete merely because the code exists):

- Each agent connection has the documented effective access and cannot approve the `approval` or `production` deployments or change settings, rulesets or secrets. Verify workflow denial for providers configured with a limited token; the Codex Connector's workflow-write capability is recorded explicitly.
- The dedicated approval App is installed only here with Commit statuses write, its key exists only in `approval`, and the `main` ruleset requires its numeric App ID for the custom `approval` context with no bypass.
- On a test PR, merging is blocked before Hugo's approval and permitted only when the dedicated App reports on the current head SHA and all other requirements pass. A same-named GitHub Actions status must not satisfy the App requirement. Inspect the source with `scripts/approval-ruleset.ts`; no agent posts a fake approval as a test.
- Environment secrets (`preview`, `staging`, `production`, `approval`) are not readable from jobs on a PR branch. Their branch policies and required reviewers are mandatory even when a connector can write workflow files.
- A workflow in a fork PR cannot write statuses (read-only token).

**Approval boundary.** The 2026-10-14 design reported `approval` with GitHub Actions and depended on denying workflow writes. Hugo authorized replacing that design within PR #14 after the connector's broader access was observed. App source binding replaces that assumption; it does not replace the protected environment, the restriction on who may approve it, or Hugo's review of workflow changes. Until the App, environment and source-bound ruleset are configured and verified, the approval gate is not ready for use. Successful CI cannot prove these account-side controls.

Stage 03 keeps proposed workflow copies for providers whose tokens cannot push `.github/workflows/`; Hugo applies those copies when needed. Authorized workflow changes from a capable connector remain protected review material. No provider is given deployment, storage or approval-App credentials, and no credential is stored as a repository-level secret.

**Evaluated and not used (2026-10-12):**

- **GitHub Copilot coding agent.** It opens PRs as the `Copilot` bot, which would solve identity, but: it needs a paid Copilot plan (from $10/month) plus usage-based AI credits with no fixed cost per run; Figma's remote MCP server only accepts OAuth from approved clients, so it could not do design work; and the approval of the person who assigned the task does not count toward required reviews, which blocks merging in a one-person repository. It can be revisited as an optional agent for stages without Figma.
- **A GitHub App for agents.** Cloud sessions and routines cannot use a custom app as their identity (only the Claude Code GitHub Action can). The app is kept for later, if a pipeline step ever needs to open PRs that trigger other workflows. Its private key would live only in GitHub Actions secrets (`APP_ID`, `APP_PRIVATE_KEY`), used through `actions/create-github-app-token` (one-hour tokens), with a copy in Hugo's password manager and never on disk, in the repo or in an agent environment.

## Cloudflare Pages setup

**Accounts and projects (amended 2026-10-18, Hugo):** one Cloudflare account and two Pages projects: `artemis-ii` for production and `artemis-ii-staging` for staging and PR previews. No R2 activation or buckets are required. Project and target branch names are fixed in the workflow. The Pages token is account-scoped, so separate projects prevent mistakes but are not a credential isolation boundary.

Today the Pages project is connected to the repo through Cloudflare's Git integration, which builds every push on its own: `main` goes to the production URL and other branches to previews. Stage 03 replaces that with the GitHub Actions deploys above. It verifies whether the existing project can receive deployments from GitHub Actions with automatic deployments turned off, or whether a new Direct Upload project is needed, and documents the steps for Hugo in `SETUP.md`.
