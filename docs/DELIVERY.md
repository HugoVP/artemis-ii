# Delivery: environments, pipeline and security

How code goes from an agent's sandbox to production, which checks it passes on the way, and who holds which credentials. This is the target design; Stage 03 builds it, and its spec refines the details. Until Stage 03 is merged, Cloudflare Pages' Git integration deploys previews and `main` directly, and the production URL is not announced to anyone.

## Environments

| Environment | Built from | Triggered by | URL | Media | Approval |
| --- | --- | --- | --- | --- | --- |
| Local | Agent's working branch | The agent | `localhost` in the sandbox | Local folder, or staging media (read-only) | Local checks pass |
| Preview | PR head commit | Every push to a PR | Per-PR Cloudflare Pages URL, posted on the PR | Staging bucket | Hugo reviews the stage here |
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
| `ci.yml` | PR, push to `main` | `npm ci`, `check`, `build`, `test` (Playwright) |
| `security.yml` | PR, push to `main`, weekly | Secret scan, dependency audit and review, CodeQL, workflow lint |
| `deploy-preview.yml` | PR (after CI passes) | Build with staging config, deploy to a Pages preview, comment the URL on the PR, Lighthouse report |
| `deploy-staging.yml` | Push to `main` | Build, deploy staging, smoke tests, link check |
| `deploy-production.yml` | Release published; manual run with a tag (rollback) | Build the tag, deploy production, smoke tests |
| `media.yml` | PR or `main` when the photo manifest changes; release | Generate variants and upload to the staging bucket; on release, promote that release's media to the production bucket |
| `dast.yml` | Weekly and after staging deploys | OWASP ZAP baseline scan of staging (report, non-blocking) |

Required checks for merging into `main` (set in the ruleset once Stage 03 is merged): `ci`, `security`, `deploy-preview`.

## Gates

| Gate | Kind | Blocks |
| --- | --- | --- |
| Local checks (`check`, `build`, `test`, `npm audit`) | Automated, run by the agent | Opening the PR |
| CI + security checks | Automated | Merge |
| Spec acceptance criteria | Automated tests + Hugo's manual checklist | Merge |
| Optional reviewer agent | AI, advisory | Nothing; findings are answered in the PR |
| Hugo's review of the preview | Human | Merge (merge = approval) |
| Release | Human (Hugo publishes it) | Production |
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
| `R2_PRODUCTION_ACCESS_KEY_ID`, `R2_PRODUCTION_SECRET_ACCESS_KEY` (production bucket only) | Secret | GitHub Actions, production job only | `media.yml` on release |
| `R2_STAGING_BUCKET`, `R2_PRODUCTION_BUCKET` | Variable | GitHub Actions | `media.yml` |
| `MEDIA_BASE_URL_STAGING`, `MEDIA_BASE_URL_PRODUCTION` | Variable | GitHub Actions | Builds |
| `SITE_URL_STAGING`, `SITE_URL_PRODUCTION` | Variable | GitHub Actions | Builds (canonical, hreflang, Open Graph) |
| `CONTACT_URL` | Variable | GitHub Actions and agent environments | Builds |
| `FIGMA_FILE_URL` | Variable | Agent environments | Design work |
| `MEDIA_BASE_URL` (staging value) | Variable | Agent environments | Local development |

Agent environments never contain Cloudflare or R2 credentials. Production secrets live in a GitHub `production` environment, restricted to release tags and with Hugo as required reviewer, so only production jobs can read them.

## Media flow

1. An agent adds approved photos to the manifest and runs `npm run ingest -- --local`: it downloads the originals from NASA in its sandbox, generates variants into a git-ignored folder and writes the photo metadata (dimensions, camera, date) into the content collections. No credentials needed.
2. `media.yml` runs the same script in upload mode in the pipeline, which generates the same variants and uploads them to the staging bucket. Keys are NASA IDs, so uploads are idempotent and previews of different PRs do not collide.
3. On release, `media.yml` copies the media of the photos in that release from the staging bucket to the production bucket.

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

Today agents act on GitHub as Hugo's user, so GitHub cannot tell them apart from him, and "agents never merge or release" is a written rule, not a technical block. The target setup makes it a technical block:

1. **A machine account for agents** (for example `hugovp-agent`), created and owned by Hugo, with two-factor authentication. GitHub allows machine accounts for automation.
2. **Write role** on this repository only (not Admin): it can push branches and open PRs, but cannot change settings, rulesets, environments or secrets.
3. **Rulesets** that only Hugo (repository admin) can bypass:
   - `main`: require a pull request with 1 approval and the required checks; block force pushes and deletion. Agent PRs need Hugo's approval, and Hugo can approve them because he is no longer the author.
   - Tags `v*`: only Hugo can create, update or delete them, so only Hugo can release.
4. **`production` environment** with Hugo as required reviewer and deployments limited to `v*` tags.
5. **Agents connect to GitHub with that account.** Each platform does it differently (its GitHub app or connector, or a token), so each one is verified in `docs/agents/` before use. For agents that use a token, a fine-grained personal access token of the machine account, limited to this repository, with: Contents read and write, Pull requests read and write, Issues read and write, Metadata read; no Workflows, Administration, Secrets or Environments permission; 90-day expiry. Without the Workflows permission the agent cannot change `.github/workflows/` at all; for Stage 03, Hugo applies those files or grants it temporarily.

Until this is in place, the rules in `AGENTS.md` are the only barrier, and Hugo checks every PR before merging.

## Cloudflare Pages setup

Today the Pages project is connected to the repo through Cloudflare's Git integration, which builds every push on its own: `main` goes to the production URL and other branches to previews. Stage 03 replaces that with the GitHub Actions deploys above. It verifies whether the existing project can receive deployments from GitHub Actions with automatic deployments turned off, or whether a new Direct Upload project is needed, and documents the steps for Hugo in `SETUP.md`.
