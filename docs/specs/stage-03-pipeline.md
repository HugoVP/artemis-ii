# Stage 03: Delivery pipeline and security baseline

- **Status:** approved (Stage 02 merged)
- **Requirements covered:** `OPS-01` to `OPS-07`, `SEC-01` to `SEC-05` and `SEC-07`, `TECH-04`
- **Depends on:** Stage 02 (buildable project with `check`, `build` and `test`); an agent with `node`; Hugo for Cloudflare, GitHub settings and secrets

## Goal

Every PR gets a preview, every merge to `main` deploys to staging, and production only changes when Hugo publishes a release, all behind the security checks described in `docs/DELIVERY.md`. Hugo can follow `docs/SETUP.md` to finish the account-side steps.

## Scope

- The workflows, gates and controls in `docs/DELIVERY.md`: CI, security checks (CodeQL, gitleaks, `npm audit`, dependency review), preview, staging and production deploys, media workflow shell, rollback, smoke tests.
- `.github/dependabot.yml` (npm and GitHub Actions), `public/_headers` (security headers, CSP decided with the font choice: self-hosted Fraunces and Inter, already bundled in Stage 02).
- CI: install the Playwright browser before `npm run test` (the pinned `@playwright/test` needs its matching Chromium) and pass `MEDIA_BASE_URL` and `SITE_URL` from repository variables.
- Agent identity verification tests and exact setup steps in `docs/SETUP.md`.
- Workflow files are protected paths and the agent token cannot push them: the PR explains which files Hugo applies by hand, as in Stage 02.

## Out of scope

- Real media upload and promotion logic beyond the workflow shell (Stage 06).
- Lighthouse and link checks as blocking gates (Stage 11).
- Preference logic (Stage 04).

## Design references

None (no visible change).

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Workflows listed in `DELIVERY.md` exist, pin actions by commit SHA and use least-privilege `permissions`. | `SEC-04` | automated: workflow lint test |
| AC-2 | Same-repository PRs get a preview URL on the PR; fork PRs only build. | `OPS-02` | manual: open a test PR |
| AC-3 | A merge to `main` deploys staging; production deploys only from a release tag. | `OPS-03`, `OPS-04` | manual: staging run, release dry run |
| AC-4 | `public/_headers` sets the security headers and the build passes with them. | `SEC-05` | automated: `tests/headers.spec.ts` |
| AC-5 | No agent-reachable credentials; secrets only in the GitHub environments of `DELIVERY.md`. | `OPS-06` | manual: `SETUP.md` checklist |
| AC-6 | `docs/specs/stage-04-preferences.md` exists and follows the template. | — | manual: PR diff |

## Tasks

1. Write the workflows and Dependabot configuration; keep them in a branch folder Hugo can copy into `.github/` if the token cannot push.
2. Add `public/_headers` and its test.
3. Write `docs/SETUP.md` steps for Cloudflare Pages projects, R2 buckets, environments and secrets.
4. Run the local checks and write the Stage 04 spec.

## Risks and open questions

- Cloudflare API token, buckets or GitHub settings may not be ready: the stage then opens as a draft with the steps Hugo must take (AGENTS.md, rule 8).
