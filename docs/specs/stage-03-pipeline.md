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
- Workflow files are protected paths. Keep proposed copies for connections that cannot push them; capable connections can submit authorized changes for Hugo's review.
- **Scope amendment (2026-10-18, Hugo):** retain the ChatGPT Codex Connector and replace the workflow-write-denial assumption with a dedicated status-only approval App. Its key lives only in the protected `approval` environment; the ruleset accepts the custom `approval` context only from that App. Account-side setup and verification remain Hugo's responsibility.

- **Media scope amendment (2026-10-18, Hugo):** replace R2 with HTML/media bundled under `/media` on Pages; unchanged originals at most 25 MiB are local, larger ones are explicit verified NASA links with measured byte sizes. No paid media serving services. Stage 03 adds packaging/manifest/limit contracts, not the Stage 06 ingestion implementation. Requirements GAL-05, MEDIA-01–05, TECH-04, QA-06 and OPS-04/06 are amended together.

## Out of scope

- Real NASA ingestion and image compression beyond the manifest/packaging contract (Stage 06).
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
| AC-7 | Approval is reported only after the protected environment is approved, on the current PR head, using a dedicated status-only App; the active ruleset requires that App as the expected source. | `OPS-06`, `SEC-04` | automated: approval workflow and ruleset fixture tests; manual: protected test PR and read-only ruleset inspection |
| AC-8 | Every complete Pages artifact obeys 26,214,400 bytes per file and 20,000 files; generation is secret-free, media paths are hashed, and no R2 operations remain. Local/external original selection preserves URL and size. | `MEDIA-03` to `MEDIA-05`, `TECH-04`, `QA-06` | automated: pages-media and workflow tests; manual: deployed media and Pages rollback after ingestion |

## Tasks

1. Write the workflows and Dependabot configuration; keep them in a branch folder Hugo can copy into `.github/` if the token cannot push.
2. Add `public/_headers` and its test.
3. Write `docs/SETUP.md` steps for Cloudflare Pages projects, bundled media, environments and secrets.
4. Run the local checks and write the Stage 04 spec.

## Risks and open questions

- Cloudflare API token, Pages projects or GitHub settings may not be ready: the stage then opens as a draft with the steps Hugo must take (AGENTS.md, rule 8).
