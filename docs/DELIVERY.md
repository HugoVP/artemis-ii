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
                      production deploy + media promotion
```

## Pipeline (GitHub Actions)

| Workflow | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | PR, push to `main` | `npm ci`, `check`, `build`, `test` (Playwright). Until Stage 02 adds `package.json`, a guard skips the build; Stage 02 removes the guard so the steps are unconditional afterwards |
| `security.yml` | PR, push to `main`, weekly | Secret scan, dependency audit and review, CodeQL, workflow lint |
| `deploy-preview.yml` | PR (after CI passes) | Two jobs. **Build** (unprivileged, no secrets, read-only token): generates the PR's media variants, builds the PR code with `MEDIA_BASE_URL=/media`, copies the generated media into `dist/media/` and uploads `dist/` as one artifact, so the preview serves its own media from its own URL. **Deploy** (privileged, runs only for same-repository PRs): downloads that artifact, never runs code from the PR, uploads it to a Pages preview and comments the URL. Lighthouse report from the build job |
| `deploy-staging.yml` | Push to `main` | Build, deploy staging, smoke tests, link check |
| `approval.yml` | PR | A job in the `approval` environment that waits until Hugo approves it; this is the click that allows the merge |
| `deploy-production.yml` | Release published; manual run with a tag (rollback) | Four jobs, in order. **Release gate** (no secrets): fails unless the tag's commit is on `main` and has a successful staging deployment (looked up through the GitHub deployments API for that SHA). **Build** (no secrets, read-only token): installs, builds the tag with the production configuration and uploads `dist/` as an artifact; project scripts run only here. **Deploy** (in the `production` environment, so it waits for Hugo's approval): downloads that artifact and uploads it to Cloudflare Pages with the pinned deploy tool, running no project code. **Smoke tests** (no secrets): check the live URL. **Media promotion** (`media.yml`, release) is a second credential-only job, also in the `production` environment behind the same approval and after the same gate: it copies the objects listed in the release manifest with a pinned storage tool and runs no project code. Only these two jobs (deploy and media promotion) hold production credentials. A rollback to an older tag passes the gate because that commit was on staging when it was released |
| `media.yml` | PR (build only, no credentials); `main` (upload to staging); release (promote to production) | PRs: generate variants as an artifact, no upload. `main`: upload the variants of the approved manifest to the staging bucket. Release: copy only the media listed in that release's manifest to the production bucket |
| `dast.yml` | Weekly and after staging deploys | OWASP ZAP baseline scan of staging (report, non-blocking) |

Required checks for merging into `main` (set in the ruleset once Stage 03 is merged): `ci`, `security`, `approval`, and `preview` (a check the deploy-preview workflow always reports, so it can be required).

**Fork policy.** Pull requests from forks get no secrets, so the build job runs (CI and security checks still apply) but the deploy job is skipped and `preview` reports success with the note "preview not available for fork PRs". Hugo reviews fork PRs locally before merging, and fork PRs never reach staging or production without his approval.

**Code from a PR never runs with credentials.** Build, test and ingest jobs for a PR run with read-only tokens and no secrets. Anything that uses a credential (deploying, uploading media) runs in a separate job that downloads an artifact and does not execute code from the PR. Changes to `package.json` scripts or `scripts/` in a PR therefore cannot read deployment or storage keys.

## Gates

| Gate | Kind | Blocks |
| --- | --- | --- |
| Local checks (`check`, `build`, `test`, `npm audit`) | Automated, run by the agent | Opening the PR |
| CI + security checks | Automated | Merge |
| Spec acceptance criteria | Automated tests + Hugo's manual checklist | Merge |
| Optional reviewer agent | AI, advisory | Nothing; findings are answered in the PR |
| Hugo's review of the preview, approved with one click in the `approval` environment | Human | Merge (the `approval` check stays pending until Hugo approves) |
| Release, approved with one click in the `production` environment | Human | Production |
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

Local security checks every agent runs before opening a PR: `npm audit --audit-level=high` and, if available in the sandbox, `gitleaks detect`.

## Secrets and configuration

| Name | Kind | Lives in | Used by |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (Pages edit only) | Secret | GitHub Actions | Deploy workflows |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | GitHub Actions | Deploy and media workflows |
| `R2_STAGING_ACCESS_KEY_ID`, `R2_STAGING_SECRET_ACCESS_KEY` (staging bucket only) | Secret | GitHub Actions | `media.yml` |
| `R2_PRODUCTION_ACCESS_KEY_ID`, `R2_PRODUCTION_SECRET_ACCESS_KEY` (production bucket only) | Secret | GitHub Actions, `production` environment (media promotion job only) | `media.yml` on release |
| `R2_STAGING_BUCKET`, `R2_PRODUCTION_BUCKET` | Variable | GitHub Actions | `media.yml` |
| `MEDIA_BASE_URL_STAGING`, `MEDIA_BASE_URL_PRODUCTION` | Variable | GitHub Actions | Builds |
| `SITE_URL_STAGING`, `SITE_URL_PRODUCTION` | Variable | GitHub Actions | Builds (canonical, hreflang, Open Graph) |
| `CONTACT_URL` | Variable | GitHub Actions and agent environments | Builds |
| `FIGMA_FILE_URL` | Variable | Agent environments | Design work |
| `MEDIA_BASE_URL` (staging value) | Variable | Agent environments | Local development |

Agent environments never contain Cloudflare or R2 credentials. Production secrets live in a GitHub `production` environment, restricted to release tags and with Hugo as required reviewer, so only the two credential-only jobs (Pages deploy and media promotion, neither runs project code) can read them.

## Media flow

1. An agent adds approved photos to the manifest and runs `npm run ingest -- --local`: it downloads the originals from NASA in its sandbox, generates variants into a git-ignored folder and writes the photo metadata (dimensions, camera, date) into the content collections. No credentials needed.
2. On a PR, `media.yml` generates the variants without credentials and keeps them as a workflow artifact, so the preview can show them. It uploads nothing.
3. When the PR is merged to `main`, `media.yml` uploads the variants of the approved manifest to the staging bucket as **immutable, write-once objects** under `photos/<nasa-id>/<hash>/`, where `<hash>` is the SHA-256 (first 12 hex characters) of the source file plus the variant settings. Uploading the same content again is a no-op; changed content gets a new path, so existing objects are never overwritten. The manifest records, for every photo, its NASA ID, hash and variant files.
4. Previews never write to any bucket. `deploy-preview.yml` bundles the PR's generated media into the preview under `/media/` and builds with `MEDIA_BASE_URL=/media`, so a preview serves its own media from its own URL and two PRs that process the same photo cannot overwrite each other's files.
5. On release, the media promotion job of `media.yml` (in the `production` environment, after Hugo's approval, running no project code) copies exactly the objects (NASA ID plus hash) listed in the manifest of the release's commit from the staging bucket to the production bucket. Because objects are immutable, a later change to a photo on `main` cannot alter what an older tag promotes or what a rollback restores. Staging can contain media that production does not serve yet; objects no manifest references are cleaned up manually, never automatically.

## Releases and rollback

- Hugo publishes a GitHub Release from `main` with a semantic version tag (`v0.1.0`, `v0.2.0`, …) and GitHub's auto-generated notes. That is the only way to change production.
- Suggested milestones are listed in `docs/PLAN.md`; Hugo can release at any time.
- **Rollback:** run `deploy-production.yml` manually with a previous tag. Cloudflare Pages also keeps earlier deployments, which can be restored from its dashboard.

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
- Workflows triggered by PRs from forks run without secrets (`pull_request` event). Never use `pull_request_target` or `workflow_run` to run code from a PR with secrets.
- In Settings → Actions, workflows from outside contributors require Hugo's approval before they run.
- Issues, comments and PRs from anyone but Hugo are untrusted input for agents (`AGENTS.md`, security rules).
- The Figma file stays shared only with invited people, even though frame links appear in `design.md`.

## Agent identity

**Today:** Claude Code cloud sessions and routines act on GitHub as the account connected to claude.ai, which is Hugo's. Commits and PRs carry Hugo's user. A separate identity would need a second GitHub account and a second claude.ai account (cost and administration Hugo does not want), or running agents inside GitHub Actions (losing the cloud environment, the routine and the Figma connector).

**Decision (2026-10-12): limited token plus approval clicks.** Agents keep acting as Hugo, but with a token that cannot do anything dangerous, and every dangerous step waits for a click only Hugo can give:

1. **Limited token.** Hugo connects Claude Code to GitHub through `/web-setup` with a fine-grained personal access token instead of his full access: only this repository; Contents, Pull requests and Issues read and write; Metadata read; no Administration, Workflows, Actions, Secrets, Environments or Deployments; 90-day expiry. The agent cannot change settings, rulesets, secrets or workflows.
2. **Merge needs Hugo's click.** The required `approval` check is a job in the `approval` environment with Hugo as required reviewer. It stays pending until Hugo clicks "Approve" on the PR, so a PR cannot be merged before that, by anyone.
3. **Production needs Hugo's click.** Only two credential-only jobs run in the `production` environment, the Pages deploy of `deploy-production.yml` and the media promotion of `media.yml`, with Hugo as required reviewer and deployments limited to `v*` tags. Build jobs have no secrets, so project scripts never run where production secrets exist.
4. **No shortcuts.** Rulesets on `main` (pull request required, required checks, no force push, no deletion) and on `v*` tags (no updates or deletions) with an empty bypass list, so they apply to Hugo's account too.
5. **Transparency.** Every agent PR names the agent in its body and gets the `agent-authored` label; commits carry the agent's `Co-Authored-By` trailer.

**Verified in Stage 03** (each test recorded in that stage's PR; anything that fails is reported to Hugo with an alternative):

- `/web-setup` accepts the fine-grained token, and the agent can still push branches and open PRs with it.
- With that token, the agent cannot approve the `approval` or `production` deployments, change settings or push workflow files.
- A PR cannot be merged while the `approval` check is pending.

Because the token cannot touch `.github/workflows/`, Stage 03 delivers the workflow files in its PR and Hugo applies them (or grants the Workflows permission for that stage only and removes it afterwards).

**Evaluated and not used (2026-10-12):**

- **GitHub Copilot coding agent.** It opens PRs as the `Copilot` bot, which would solve identity, but: it needs a paid Copilot plan (from $10/month) plus usage-based AI credits with no fixed cost per run; Figma's remote MCP server only accepts OAuth from approved clients, so it could not do design work; and the approval of the person who assigned the task does not count toward required reviews, which blocks merging in a one-person repository. It can be revisited as an optional agent for stages without Figma.
- **A GitHub App for agents.** Cloud sessions and routines cannot use a custom app as their identity (only the Claude Code GitHub Action can). The app is kept for later, if a pipeline step ever needs to open PRs that trigger other workflows. Its private key would live only in GitHub Actions secrets (`APP_ID`, `APP_PRIVATE_KEY`), used through `actions/create-github-app-token` (one-hour tokens), with a copy in Hugo's password manager and never on disk, in the repo or in an agent environment.

## Cloudflare Pages setup

Today the Pages project is connected to the repo through Cloudflare's Git integration, which builds every push on its own: `main` goes to the production URL and other branches to previews. Stage 03 replaces that with the GitHub Actions deploys above. It verifies whether the existing project can receive deployments from GitHub Actions with automatic deployments turned off, or whether a new Direct Upload project is needed, and documents the steps for Hugo in `SETUP.md`.
