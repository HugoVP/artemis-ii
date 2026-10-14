# Delivery: environments, pipeline and security

How code goes from an agent's sandbox to production, which checks it passes on the way, and who holds which credentials. This is the target design; Stage 03 builds it, and its spec refines the details. Until Stage 03 is merged, Cloudflare Pages' Git integration deploys previews and `main` directly, and the production URL is not announced to anyone.

## Environments

| Environment | Built from | Triggered by | URL | Media | Approval |
| --- | --- | --- | --- | --- | --- |
| Local | Agent's working branch | The agent | `localhost` in the sandbox | Local folder, or staging media (read-only) | Local checks pass |
| Preview | PR head commit (same-repository PRs; fork PRs are build-only) | Every push to a same-repository PR | Per-PR Cloudflare Pages URL, posted on the PR | Bundled into the preview itself under `/media/` from the PR's media artifact; no bucket | Hugo reviews the stage here |
| Staging | `main` | Every merge to `main` | Stable staging URL | Staging bucket | Hugo merged the PR |
| Production | Release tag `vX.Y.Z` | Hugo publishes a GitHub Release | Public URL | Production bucket | Hugo published the release |

Static sites bake URLs into the HTML, so each environment is a separate build of the **same commit** with its own configuration (`MEDIA_BASE_URL`, site URL). Builds are reproducible from `package-lock.json`; production always builds the exact commit that was already on staging.

```
agent branch ──PR──► CI + security checks ──► preview deploy ──► Hugo reviews
                                                                    │ merge
                                                                    ▼
                         staging deploy ◄── main ──► next stage starts
                               │
                     Hugo publishes release vX.Y.Z
                               ▼
                media promotion ──► production deploy ──► smoke tests
```

## Pipeline (GitHub Actions)

| Workflow | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | PR | `npm ci`, `check`, `build`, `test` (Playwright). Until Stage 02 adds `package.json`, a guard skips the build; Stage 02 removes the guard so the steps are unconditional afterwards |
| `security.yml` | PR, push to `main`, weekly | Secret scan, dependency audit and review, CodeQL, workflow lint |
| `preview-build.yml` | PR | Unprivileged: no secrets, read-only token. Generates the PR's media variants, builds the PR code with `MEDIA_BASE_URL=/media`, copies the generated media into `dist/media/` and uploads `dist/` as one artifact, so the preview serves its own media from its own URL. Lighthouse report from this job |
| `deploy-preview.yml` | `workflow_run`, after `preview-build.yml` completes | Privileged, but **defined on the default branch**: GitHub runs a `workflow_run` workflow from `main`, so a PR cannot edit it or reference secrets through it. Takes the commit SHA and PR number from the `workflow_run` event payload, never from the artifact. Runs only when the run belongs to this repository (`head_repository` equals the repository); for fork runs it deploys nothing and reports `preview` success with a note. Downloads the artifact as data, never executes, sources or installs anything from it, uploads it to a Pages preview with a fixed project name, ignoring any configuration file inside the artifact and passing the PR number only through an environment variable, posts the URL on the PR and reports the `preview` status on the PR head SHA |
| `deploy-staging.yml` | Push to `main` | Jobs in order. **Media upload** (calls `media.yml` as a reusable workflow; holds only the staging bucket credentials): uploads the variants of the approved manifest to the staging bucket. **Build** (no secrets), then **deploy staging**, which starts only after the media upload succeeds, so the HTML never goes live before the media it references. **Smoke tests and link check** run after both are done |
| `approval.yml` | `pull_request_target` (`opened`, `synchronize`, `reopened`), defined on the default branch | The approval gate, outside the PR's control: GitHub runs it from `main`, so a PR cannot edit it or remove the environment. It checks out nothing and runs no PR code. One job in the `approval` environment waits for Hugo's click and then reports the `approval` status on `github.event.pull_request.head.sha`, taken from the event payload. A new push is a new SHA and a new run, so an approval never carries over to code Hugo has not seen. This is the click that allows the merge |
| `deploy-production.yml` | Release published; manual run with a tag (rollback) | Five jobs, in order. **Release gate** (no secrets): fails unless the tag resolves to a published, non-draft GitHub Release (looked up through the GitHub releases API by tag, for both the release trigger and a manual rollback run) and the tag's commit is on `main` and has a successful staging deployment (looked up through the GitHub deployments API for that SHA). **Build** (no secrets, read-only token): installs, builds the tag with the production configuration and uploads `dist/` as an artifact; project scripts run only here. **Media promotion** (calls `media.yml` as a reusable workflow; in the `production` environment, so it waits for Hugo's approval): copies the objects listed in the release manifest with a pinned storage tool and runs no project code. **Deploy** (in the `production` environment, starts only after the media promotion succeeds): downloads the build artifact and uploads it to Cloudflare Pages with the pinned deploy tool, running no project code. **Smoke tests** (no secrets): check the live URL once media and site are both published. Only the media promotion and deploy jobs hold production credentials. A rollback to an older tag passes the gate because that commit was on staging when it was released, and its media promotion is a no-op for objects already in the production bucket |
| `media.yml` | PR (build only, no credentials); called by `deploy-staging.yml` (upload to staging) and by `deploy-production.yml` (promote to production) | Generation (every trigger) runs in a no-secrets job that executes `ingest` in build mode and uploads the variants and the manifest as an artifact; PRs stop there and upload nothing. Staging: a credential-only job downloads that artifact and copies the variants of the approved manifest to the staging bucket with a pinned storage tool, before the staging site deploy. Production: a credential-only job copies only the media listed in that release's manifest (read as data) to the production bucket, before the production site deploy. Neither credentialed job runs project code |
| `dast.yml` | Weekly and after staging deploys | OWASP ZAP baseline scan of staging (report, non-blocking) |

Required checks for merging into `main` (set in the ruleset once Stage 03 is merged; `approval` and `preview` are statuses reported by workflows defined on the default branch, so a PR cannot fake them): `ci`, `security`, `approval`, and `preview` (a status that `deploy-preview.yml` always reports on the PR head SHA, so it can be required).

**Fork policy.** Pull requests from forks get no secrets, so `preview-build.yml` runs (CI and security checks still apply) but `deploy-preview.yml` deploys nothing and `preview` reports success with the note "preview not available for fork PRs". Hugo reviews fork PRs locally before merging, and fork PRs never reach staging or production without his approval.

**Code from a PR never runs with credentials.** Build, test and ingest jobs for a PR run with read-only tokens and no secrets. Anything that uses a credential (deploying, uploading media) runs in a separate job that downloads an artifact and does not execute code from the PR, and whose workflow definition comes from the default branch (`workflow_run`, or a call from a workflow that only runs on `main` or on release tags), so a PR cannot rewrite the privileged steps. The artifact is treated as untrusted data: nothing in it is executed or sourced, and the PR number and SHA come from the event payload. Changes to `package.json` scripts or `scripts/` in a PR therefore cannot read deployment or storage keys.

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
| `CLOUDFLARE_ACCOUNT_ID` | Variable | GitHub Actions | Deploy and media workflows |
| `R2_STAGING_ACCESS_KEY_ID`, `R2_STAGING_SECRET_ACCESS_KEY` (staging bucket only) | Secret | GitHub environment `staging` (`main` only), never repository-level | `media.yml`, called by `deploy-staging.yml` |
| `R2_PRODUCTION_ACCESS_KEY_ID`, `R2_PRODUCTION_SECRET_ACCESS_KEY` (production bucket only) | Secret | GitHub Actions, `production` environment (media promotion job only) | `media.yml`, called by `deploy-production.yml` |
| `R2_STAGING_BUCKET`, `R2_PRODUCTION_BUCKET` | Variable | GitHub Actions | `media.yml` |
| `MEDIA_BASE_URL_STAGING`, `MEDIA_BASE_URL_PRODUCTION` | Variable | GitHub Actions | Builds |
| `SITE_URL_STAGING`, `SITE_URL_PRODUCTION` | Variable | GitHub Actions | Builds (canonical, hreflang, Open Graph) |
| `CONTACT_URL` | Variable | GitHub Actions and agent environments | Builds |
| `FIGMA_FILE_URL` | Variable | Agent environments | Design work |
| `MEDIA_BASE_URL` (staging value) | Variable | Agent environments | Local development |

Agent environments never contain Cloudflare or R2 credentials. **No credential is a repository-level secret:** a workflow in a same-repository PR can read repository-level secrets, but not environment secrets whose deployment policy allows only `main` or release tags. Each credential lives in the environment of the jobs that use it.

- **R2 production keys** live in a GitHub `production` environment, restricted to release tags and with Hugo as required reviewer, so only the media promotion job can read them. R2 tokens are scoped per bucket, so this is real isolation.
- **The Cloudflare Pages token** cannot be limited to one Pages project, so the `production` environment does not isolate it, and this design does not claim it does. Its boundary is the code allowed to read it: only credential-only deploy jobs in workflows defined on the default branch hold it; they run no project code, never execute, source or read configuration from the artifact they deploy, use a Pages project name and target branch fixed in the workflow, and receive the PR number (the only PR-derived value) through an environment variable, never interpolated into a shell command. The `production` environment approval and the release gate control what reaches production, not who can read the token. Changing those workflows takes a PR to a protected path that Hugo approves. If Cloudflare offers per-project token scopes, Stage 03 splits it into a preview and staging token and a production token held only in the `production` environment, and verifies the current behavior when it builds the pipeline.

## Media flow

1. An agent adds approved photos to the manifest and runs `npm run ingest -- --local`: it downloads the originals from NASA in its sandbox, generates variants into a git-ignored folder and writes the photo metadata (dimensions, camera, date) into the content collections. No credentials needed.
2. On a PR, `media.yml` generates the variants without credentials and keeps them as a workflow artifact, so the preview can show them. It uploads nothing.
3. When the PR is merged to `main`, `deploy-staging.yml` runs the staging upload of `media.yml` first, and deploys the staging site only after it succeeds. A no-secrets job first generates the variants and the manifest from the merged commit (`ingest` in build mode); the upload job then downloads that artifact, with no project code and a pinned storage tool, and sends the variants of the approved manifest to the staging bucket as **immutable, write-once objects** under `photos/<nasa-id>/<hash>/`, where `<hash>` is the SHA-256 (first 12 hex characters) of the source file plus the variant settings. Uploading the same content again is a no-op; changed content gets a new path, so existing objects are never overwritten. The manifest records, for every photo, its NASA ID, hash and variant files.
4. Previews never write to any bucket. `preview-build.yml` bundles the PR's generated media into the preview under `/media/` and builds with `MEDIA_BASE_URL=/media`, so a preview serves its own media from its own URL and two PRs that process the same photo cannot overwrite each other's files.
5. On release, `deploy-production.yml` runs the media promotion job of `media.yml` (in the `production` environment, after Hugo's approval, running no project code) before the production site deploy. It copies exactly the objects (NASA ID plus hash) listed in the manifest of the release's commit from the staging bucket to the production bucket. Because objects are immutable, a later change to a photo on `main` cannot alter what an older tag promotes or what a rollback restores. Staging can contain media that production does not serve yet; objects no manifest references are cleaned up manually, never automatically.

## Releases and rollback

- Hugo publishes a GitHub Release from `main` with a semantic version tag (`v0.1.0`, `v0.2.0`, …) and GitHub's auto-generated notes. That is the only way to change production.
- Suggested milestones are listed in `docs/PLAN.md`; Hugo can release at any time.
- **Rollback:** run `deploy-production.yml` manually with a previous tag that has a published release; the release gate rejects tags without one, so a tag created by hand cannot reach production. Cloudflare Pages also keeps earlier deployments, which can be restored from its dashboard.

## Security model

| Asset | Threat | Controls |
| --- | --- | --- |
| Production site | Unreviewed change goes live | Production only from releases Hugo publishes; staging first; smoke tests; rollback |
| Credentials | Leak through code, logs or an agent | Secrets only in the pipeline, scoped tokens per bucket and per service, gitleaks, agents hold none |
| Dependencies | Vulnerable or malicious package | Lockfile and `npm ci`, `npm audit`, Dependabot, new dependencies justified in the PR |
| CI/CD | An agent weakens checks or workflows | Protected paths, "Security-relevant changes" section, workflow lint, required checks |
| Agent instructions | Prompt injection from fetched content | Untrusted-content rule in `AGENTS.md`; Hugo reviews every PR |
| Media and content | Copyright, hotlinking, wrong facts | Own storage, credit tests, sources stored with every fact, content review stages |
| Visitors | XSS, tracking, third-party loads | Static site, CSP, click-to-load video, no analytics or ads |

## Public repository

**Decision (2026-10-12):** the repository is public. That makes GitHub Actions minutes, environments with required reviewers, rulesets, CodeQL, secret scanning with push protection and dependency review available for free. It also means anyone can read the code, specs, PRs and history, and anyone can open issues, comment, fork and send PRs. Rules that follow from it:

- Nothing private in the repo: no secrets, personal data, session links, private URLs or account identifiers. Secret scanning and push protection back this up.
- Workflows triggered by PRs from forks run without secrets (`pull_request` event). Never use `pull_request_target` or `workflow_run` to run code from a PR with secrets. The only two uses are `deploy-preview.yml` (`workflow_run`), which only downloads the PR's build artifact as data, and `approval.yml` (`pull_request_target`), which checks out nothing and only reports a status on the head SHA. Neither executes anything from the PR.
- In Settings → Actions, workflows from outside contributors require Hugo's approval before they run.
- Issues, comments and PRs from anyone but Hugo are untrusted input for agents (`AGENTS.md`, security rules).
- The Figma file stays shared only with invited people, even though frame links appear in `design.md`.

## Agent identity

**Today:** Claude Code cloud sessions and routines act on GitHub as the account connected to claude.ai, which is Hugo's. Commits and PRs carry Hugo's user. A separate identity would need a second GitHub account and a second claude.ai account (cost and administration Hugo does not want), or running agents inside GitHub Actions (losing the cloud environment, the routine and the Figma connector).

**Decision (2026-10-12): limited token plus approval clicks.** Agents keep acting as Hugo, but with a token that cannot do anything dangerous, and every dangerous step waits for a click only Hugo can give:

1. **Limited token.** Hugo connects Claude Code to GitHub through `/web-setup` with a fine-grained personal access token instead of his full access: only this repository; Contents, Pull requests and Issues read and write; Metadata read; no Administration, Workflows, Actions, Secrets, Environments or Deployments; 90-day expiry. The agent cannot change settings, rulesets, secrets or workflows.
2. **Merge needs Hugo's click.** The required `approval` check is a job in the `approval` environment with Hugo as required reviewer, in a workflow defined on the default branch and bound to the exact PR head SHA (see `approval.yml`), so the PR cannot change or bypass it. It stays pending until Hugo clicks "Approve" on the PR, so a PR cannot be merged before that, by anyone.
3. **Production needs Hugo's click.** Only two credential-only jobs run in the `production` environment, the media promotion of `media.yml` and then the Pages deploy of `deploy-production.yml`, with Hugo as required reviewer and deployments limited to `v*` tags. Build jobs have no secrets, so project scripts never run where production secrets exist.
4. **No shortcuts.** Rulesets on `main` (pull request required, required checks, no force push, no deletion) and on `v*` tags (no updates or deletions) with an empty bypass list, so they apply to Hugo's account too.
5. **Transparency.** Every agent PR names the agent in its body and gets the `agent-authored` label; commits carry the agent's `Co-Authored-By` trailer.

**Verified in Stage 03** (each test recorded in that stage's PR; anything that fails is reported to Hugo with an alternative):

- `/web-setup` accepts the fine-grained token, and the agent can still push branches and open PRs with it.
- With that token, the agent cannot approve the `approval` or `production` deployments, change settings or push workflow files.
- A PR cannot be merged while the `approval` check is pending.
- Environment secrets (`preview`, `staging`, `production`) are not readable from a workflow on a PR branch, and a push of a workflow file with the agent token is rejected.
- A workflow in a fork PR cannot write statuses (read-only token).

**Trust assumption for the `approval` status.** The status is reported by GitHub Actions, so any workflow that can run on a branch of this repository with `statuses: write` could post it without Hugo's click. Doing that takes a workflow change, and workflow changes are not available to the agents (no Workflows permission) or to forks (read-only token), and they fall in the protected path `.github/**` that Hugo reviews before approving. **Decision (2026-10-14, Hugo): keep this assumption for now** (Stage 03 builds the `approval` status with GitHub Actions and verifies the limits above). **Planned change:** move the reporter to a dedicated GitHub App, set as the only accepted source of `approval` in the ruleset, with its key only in the `approval` environment (restricted to `main`). That removes the assumption entirely. It becomes worth doing when another person can write to this repository, when agents can ever push workflow files, or when Hugo wants to reuse the pattern in another project; revisit it then, as its own PR.

Because the token cannot touch `.github/workflows/`, Stage 03 delivers the workflow files in its PR and Hugo applies them himself. The agent token never gets the Workflows permission, not even temporarily: a workflow added in a same-repository PR can read repository-level secrets, so that permission would break the boundary described above.

**Evaluated and not used (2026-10-12):**

- **GitHub Copilot coding agent.** It opens PRs as the `Copilot` bot, which would solve identity, but: it needs a paid Copilot plan (from $10/month) plus usage-based AI credits with no fixed cost per run; Figma's remote MCP server only accepts OAuth from approved clients, so it could not do design work; and the approval of the person who assigned the task does not count toward required reviews, which blocks merging in a one-person repository. It can be revisited as an optional agent for stages without Figma.
- **A GitHub App for agents.** Cloud sessions and routines cannot use a custom app as their identity (only the Claude Code GitHub Action can). The app is kept for later, if a pipeline step ever needs to open PRs that trigger other workflows. Its private key would live only in GitHub Actions secrets (`APP_ID`, `APP_PRIVATE_KEY`), used through `actions/create-github-app-token` (one-hour tokens), with a copy in Hugo's password manager and never on disk, in the repo or in an agent environment.

## Cloudflare Pages setup

Today the Pages project is connected to the repo through Cloudflare's Git integration, which builds every push on its own: `main` goes to the production URL and other branches to previews. Stage 03 replaces that with the GitHub Actions deploys above. It verifies whether the existing project can receive deployments from GitHub Actions with automatic deployments turned off, or whether a new Direct Upload project is needed, and documents the steps for Hugo in `SETUP.md`.
