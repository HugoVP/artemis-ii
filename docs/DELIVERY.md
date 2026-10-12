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
| `security.yml` | PR, push to `main`, weekly | Secret scan, dependency audit, SAST, workflow lint |
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
| Secret scanning | gitleaks | Every PR and push | Yes |
| Dependency vulnerabilities | `npm audit --audit-level=high` | Every PR, weekly | Yes (high and critical) |
| Dependency updates | Dependabot (npm and GitHub Actions) | Weekly | No (opens PRs) |
| Static analysis | Semgrep (open-source rules for JS/TS); CodeQL if the repo becomes public | Every PR | Yes (high severity) |
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

Agent environments never contain Cloudflare or R2 credentials. Where the GitHub plan allows it, production secrets live in a `production` environment so only production jobs can read them (see "Platform constraints").

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

## Platform constraints and open decisions

Stage 03 checks these and records the result here:

- **GitHub plan and repository visibility.** Environment secrets, required reviewers and some rulesets have limits on private repositories depending on the plan. A public repository unlocks them for free (plus CodeQL and secret scanning push protection), but makes the specs, PRs and commit history public. Hugo decides.
- **Agent identity.** Agents currently act on GitHub as Hugo's user, so GitHub cannot tell them apart from Hugo, and "agents never merge or release" is a rule, not a technical block. A dedicated bot account or GitHub App for agents would make it enforceable. Hugo decides.
- **Cloudflare Pages setup.** Whether the existing Git-integrated Pages project can receive deployments from GitHub Actions with automatic deployments turned off, or whether a new Direct Upload project is needed. Stage 03 verifies it and documents the steps for Hugo.
