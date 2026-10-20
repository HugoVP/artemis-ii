# Stage plan

This file is maintained by the agents. Each stage ends in a PR, and Hugo approves it by merging.

Possible statuses: `pending`, `in review` (PR open), `approved` (PR merged, deployed to staging). Production is released separately (see "Releases"). Linear mirrors them: `pending` = Backlog or Todo, `in review` = In Review, `approved` = Done.
🔍 = content review stage: the PR brings only the content to approve, without integrating it into the site.
🎨 = design review stage: the PR brings the Figma design and its spec, without site code.
"Needs" = capabilities the agent must have to run the stage (see [`agents/README.md`](agents/README.md)). Every stage also needs `git`, and from Stage 02 on also `node` and `browser`, because the local checks (`check`, `build`, `test`) must pass before any PR, even for stages whose Needs column does not list them.

The project follows spec-driven development (see [`specs/README.md`](specs/README.md)): requirements live in [`specs/product.md`](specs/product.md), and each stage is built against its own spec in `docs/specs/stage-NN-*.md`, written and approved one stage ahead. Delivery (environments, pipeline, security) is described in [`DELIVERY.md`](DELIVERY.md). Project structure is in [`STRUCTURE.md`](STRUCTURE.md) and the site map in [`SITEMAP.md`](SITEMAP.md).

| # | Stage | Needs | Spec | Status | PR | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | 🔍 Plan, structure, site map, product spec and delivery design | — | — | approved | #1 | — |
| 01 | 🎨 Design in Figma: tokens, components and screens | `figma-write` | [stage-01-design](specs/stage-01-design.md) | approved | #4 | `HUG-5` |
| 02 | Project base: Astro, Tailwind with design tokens, es/en routes, layout, tests | `node`, `browser`, `figma-read` | [stage-02-base](specs/stage-02-base.md) | approved | #8 | `HUG-6` |
| 03 | Delivery pipeline and security baseline: preview, staging and production deploys, security checks | `node` | [stage-03-pipeline](specs/stage-03-pipeline.md) | approved | #14 | `HUG-7` |
| 04 | Preferences: theme, language, site density and gallery view | `node`, `browser`, `figma-read` | [stage-04-preferences](specs/stage-04-preferences.md) | approved | #31 | |
| 05 | 🔍 Curation: candidate photos with IDs in `CURATION.md` (no downloads) | `web` | [stage-05-curation](specs/stage-05-curation.md) | approved | #34 | |
| 06 | Ingestion: script, variants with sharp, static Pages packaging | `node`, `web` | [stage-06-ingestion](specs/stage-06-ingestion.md) | in review | #44 | |
| 07 | Gallery: chapters, Mosaic/Gallery/Immersive views and per-photo page | `node`, `browser`, `figma-read` | [stage-07-gallery](specs/stage-07-gallery.md) | pending | | |
| 08 | 🔍 Texts: The launch, The mission and Why it matters, in both languages, with sources | `web` | written in 07 | pending | | |
| 09 | Sections: Home, The launch (with video), The mission (timeline) and Why it matters; photo stories, captions and alt text into the gallery | `node`, `browser`, `figma-read` | written in 08 | pending | | |
| 10 | About, AI notice, credits, Open Graph and hreflang | `node`, `browser`, `figma-read` | written in 09 | pending | | |
| 11 | Final review: accessibility, performance, security, links, traceability | `node`, `browser`, `web`, `figma-read` | written in 10 | pending | | |

## Releases

Production changes only when Hugo publishes a GitHub Release (see `DELIVERY.md`). Suggested milestones; Hugo can release whenever he wants:

| Version | After stage | What visitors get |
| --- | --- | --- |
| `v0.1.0` | 04 | The site shell: design, navigation, both languages, preferences |
| `v0.5.0` | 07 | The photo gallery |
| `v1.0.0` | 11 | The complete site |

## Decisions

Entries that end with `<!-- notion -->` are published to the Notion page by `notion-sync.yml` (see `AGENTS.md`). Add the marker only to entries that are safe to publish; the sync ignores the rest.

- The four mandatory review points are covered by stages 00 (plan), 01 (design), 05 (photos) and 08 (texts). Production releases are a fifth, separate gate. <!-- notion -->
- Design comes right after the plan, so the project base (Stage 02) is built on approved tokens and layout. Design uses placeholders instead of NASA photos, because curation comes later. <!-- notion -->
- The pipeline (Stage 03) comes right after the project base: it needs a buildable project, and every later stage then gets previews, staging and security checks. <!-- notion -->
- Media generation is secret-free; the pipeline packages media and HTML into one Pages deployment. Agents never hold deployment credentials.
- Every PR carries the spec of the next stage (look-ahead cycle), so merging a PR approves both the result and the next plan. <!-- notion -->
- Stages 07 and 09 do not integrate unapproved content: 07 comes after 05–06, and 09 after 08. <!-- notion -->
- Stage 10 includes the footer with the short AI notice; the Stage 02 layout reserves the space. <!-- notion -->
- Work is tracked in Linear (one issue per stage, in the "Issue" column), the decision log and notes live in Notion and Obsidian is a personal reader over `docs/` (Hugo, 2026-10-15). The repo stays the source of truth; see "Task tracking and knowledge tools" in `AGENTS.md`. <!-- notion -->
- Production keeps one credential-only Pages deploy job behind Hugo's approval; media generation stays in the no-secrets build (amended 2026-10-18).
- Until Stage 03 is merged, Cloudflare Pages' Git integration keeps deploying every merge to `main` straight to production (Hugo's decision, 2026-10-15); the production URL is not announced.
- Cloudflare: one account, two Pages projects; no R2 activation. HTML and media share each deployment, including rollback (Hugo, 2026-10-18; supersedes the bucket design).
- The default-branch approval workflow reports `approval` through a dedicated status-only GitHub App; the ruleset must require that App as the expected source (Hugo's decision, 2026-10-18). This replaces the earlier workflow-write-denial assumption; setup and verification are in `DELIVERY.md` and `SETUP.md`.

## Detail by stage

The scope, acceptance criteria and tasks of each stage live in its spec. These summaries are the starting point for those specs.

### 00 🔍 Plan, structure, site map, product spec and delivery design
- **Deliverable:** this file, `STRUCTURE.md`, `SITEMAP.md`, `DELIVERY.md`, `AGENTS.md` (with `CLAUDE.md` pointing to it), `agents/`, `specs/README.md`, `specs/_template.md`, `specs/product.md`, `specs/stage-01-design.md`, PR template. No code.

### 01 🎨 Design in Figma
- Figma file (from `FIGMA_FILE_URL`) with Foundations (variables with theme and density modes), Components and Screens (mobile and desktop for every page in `SITEMAP.md`), plus `Exploration` and `Archive` pages.
- `docs/specs/design.md` with tokens, CSS variable names, frame links and contrast ratios.

### 02 Project base
- Astro + strict TypeScript + Tailwind; `@astrojs/react` for islands; `@astrojs/sitemap`.
- Design tokens from `design.md` as CSS variables (`src/styles/tokens.css`) wired into Tailwind.
- `package.json` with `dev`, `build`, `check`, `test` scripts and `package-lock.json`; Playwright acceptance tests against the static build.
- Routes `src/pages/es/*` and `src/pages/en/*`; `/` redirects to `/es/`. Base layout, top bar and footer per Figma; UI text dictionary.
- Content collections with Zod schema (minimal sample data). `src/lib/media.ts` builds URLs from `MEDIA_BASE_URL`. Section pages as shells.
- **Removes the `package.json` existence guard** from `.github/workflows/ci.yml` in the same PR that adds `package.json`, so `npm ci`, `check`, `build` and `test` are unconditional from then on and deleting `package.json` can never make CI skip everything. The agent token cannot push workflow files, so Hugo applies this edit to the Stage 02 branch (the spec and the PR description say so).
- Until Stage 03, Cloudflare Pages' Git integration still deploys; the production URL is not announced.

### 03 Delivery pipeline and security baseline
- The workflows, gates and controls in `DELIVERY.md`: CI, security checks, preview, staging and production deploys, rollback, Dependabot, `public/_headers`, smoke tests.
- Applies the decisions in `DELIVERY.md` (public repository, limited agent token with approval clicks, Pages setup), runs the agent-identity verification tests, and documents the exact setup steps in `SETUP.md`.
- **Possible blocker:** Cloudflare API token, Pages projects or GitHub settings not ready; the stage opens as a draft with the steps Hugo must take.

### 04 Preferences
- React island in the top bar: theme, language, density and, only in galleries, gallery view, as designed in Figma.
- Inline script in `<head>` that applies theme and density before painting. `localStorage` always in try/catch.
- Browser language detection only on the first visit; the language selector keeps the page.

### 05 🔍 Curation
- `CURATION.md` with 20–30 mission photos and 5–8 launch photos: NASA ID, link to the original, chapter, justification, verified rights, candidate stories. No downloads.

### 06 Ingestion
- Stage 06 implements the contract in `docs/ingestion.md`: secret-free approved-source downloads and variants, content hashes/checksums, unchanged local originals up to 25 MiB and explicit external NASA originals above it. All environments bundle media under `/media` with HTML; no bucket uploads or promotion. Stage 03 only supplies the shell, manifest, packaging and bounds checks.

### 07 Gallery
- Chapters, three views (mosaic, gallery, immersive) and the per-photo page, per Figma; Open Graph image per photo.

### 08 🔍 Texts
- ES/EN drafts of The launch, The mission and Why it matters, plus photo stories, each fact with its source. In `docs/content-review/`, not integrated.

### 09 Sections
- Home, The launch (click-to-load player), The mission (timeline, crew, milestones) and Why it matters, with the approved texts, per Figma.
- The approved photo stories, captions and alt text from Stage 08 go into the content collections (`stories` and photo entries, with their sources), so the gallery views and per-photo pages from Stage 07 show them in both languages.

### 10 About, AI notice, credits, OG and hreflang
- Short AI notice in the footer and full in About, `CONTACT_URL`, NASA usage guidelines, credits, hreflang and Open Graph per language.

### 11 Final review
- Accessibility, mobile performance, security (dynamic scan findings, headers), broken links, build in both languages with the 3 densities and 3 views, visual check against Figma, the traceability column in `product.md`, and quality checks switched to blocking.

## Log

Each stage adds a line here before opening its PR (date, stage and one sentence on what it did) and fills in the PR link in a follow-up commit right after opening it.

- 2026-10-12 — Stage 00 — PR #1 — Detailed plan, project structure and site map. <!-- notion -->
- 2026-10-12 — Intermediate step (requested by Hugo) — All Markdown docs are now English-only and are the single source of truth; the Spanish versions were removed. <!-- notion -->
- 2026-10-12 — Naming unification — Branch pattern generalized to `claude/*`, English-only workflow naming (stage, PR titles, CI steps, chapter IDs), routine renamed to "next stage". <!-- notion -->
- 2026-10-12 — Stage 00 update (requested by Hugo) — Added the Figma design stage (01, stages renumbered to 10) and spec-driven development: product spec with requirement IDs, stage specs written one stage ahead, PR template, acceptance tests in CI.
- 2026-10-12 — Stage 00 update — Verified the Figma connector can write to the design file (`use_figma`); Stage 01 spec and design rules updated with the tools to use and avoid.
- 2026-10-12 — Stage 00 update (requested by Hugo) — DevSecOps and agent-neutral restructure: four environments (local, preview, staging, production), production only through releases, new Stage 03 (delivery pipeline and security baseline, stages renumbered to 11), `AGENTS.md` as the single instruction file for any agent, `docs/DELIVERY.md`, `docs/agents/`.
- 2026-10-12 — Stage 00 update — Repository confirmed public by Hugo; `DELIVERY.md` updated with public-repository rules, the agent identity setup and GitHub-native security checks (CodeQL, secret scanning with push protection, dependency review).
- 2026-10-12 — Stage 00 update — Agent identity decided: limited fine-grained token plus approval clicks (merge and production). GitHub Copilot coding agent and a custom GitHub App evaluated and not used for now.
- 2026-10-12 — Stage 00 update — Added `## Code Review Rules` to `AGENTS.md` and the OpenAI Codex setup, verified facts and open questions to `docs/agents/other-agents.md`.
- 2026-10-13 — Stage 00 update — Added `REVIEW.md` (short copy of the review rules for GitHub Copilot code review) and listed it as a protected path.
- 2026-10-13 — Stage 00 update — Addressed Copilot code review on `docs/DELIVERY.md`: PR code never runs with credentials (build and deploy split), fork policy with a `preview` check that always reports, media namespaced per PR and promoted from manifests only.
- 2026-10-13 — Stage 00 update — Second Copilot review addressed: release gate (tag on `main` with a successful staging deployment), CI no longer skips missing `check`/`test` scripts, one preview layout (media bundled under `/media/`), OPS-02 scoped to same-repository PRs.
- 2026-10-13 — Stage 00 update — Third Copilot review: media is immutable and content-addressed, one media path in `STRUCTURE.md` and `DELIVERY.md`.
- 2026-10-13 — Stage 00 update — Fourth Copilot review: the CI `package.json` guard is temporary and Stage 02 must remove it atomically (applied by Hugo, since agent tokens cannot push workflows).
- 2026-10-13 — Stage 00 update — Fifth Copilot review: production build runs in a no-secrets job; only the deploy job (artifact download and upload, no project code) is in the `production` environment.
- 2026-10-13 — Stage 00 update — Sixth Copilot review: release media promotion is a credential-only job in the `production` environment behind Hugo's approval, next to the Pages deploy; neither runs project code.
- 2026-10-13 — Stage 00 update — Copilot findings from review bodies: complete Figma page set, PR link added to `PLAN.md` after opening the PR, previews scoped to same-repository PRs in `PROMPT.md`, media upload and promotion ordered before site deploys and smoke tests, `TECH` requirements in `product.md`, `npm audit` from Stage 02, photo stories integrated in Stage 09, missing capability opens a draft PR.
- 2026-10-15 — Process (requested by Hugo) — Task tracking and knowledge tools: Linear issues per stage ("Issue" column), status mapping, Notion as a public-safe readable layer and Obsidian as a personal reader, documented in `AGENTS.md`, `docs/agents/` and `docs/SETUP.md`.
- 2026-10-15 — Stage 00 approved (PR #1 merged); Stage 01 — PR #4 — Figma design built (variables, components, screens) and `design.md`; Stage 02 spec written.
- 2026-10-16 — Stage 01 approved (PR #4 merged); Stage 02 — PR #8 — Astro + Tailwind base with design tokens, es/en routes, layout, content collections and Playwright tests; Stage 03 spec written.
- 2026-10-17 — Stage 02 approved (PR #8 merged); Stage 03 — PR #14 — Delivery pipeline: workflows ready in `pipeline/github/` for Hugo to copy into `.github/`, security headers, smoke test script and setup steps; Stage 04 spec written.
- 2026-10-18 — Process (requested by Hugo) — TypeScript only, on TypeScript 7: scripts and configuration converted from JavaScript, with a test that refuses JavaScript files; one branch prefix, `agent/`, for every agent. <!-- notion -->
- 2026-10-18 — Stage 03 — PR #14 — Hugo authorized retaining the Codex Connector and replacing the workflow-write-denial assumption with a dedicated approval App, protected environment and source-bound ruleset. Account-side setup and live verification remain pending.

- 2026-10-18 — Stage 03 — PR #14 — Hugo replaced R2 with static Pages media, approved external NASA downloads for originals above 25 MiB, and required complete-artifact limits and rollback of HTML/media together. Evaluation is illustrative, not final curation or visual approval.

- 2026-10-19 — Stage 04 — PR #31 — Added accessible theme, language, density and gallery-view preferences, storage-safe persistence and pre-paint restoration; wrote the Stage 05 curation spec. <!-- notion -->
- 2026-10-19 — Stage 04 approved (PR #31 merged); Stage 05 — PR #34 — Curation document with 26 mission and 7 launch candidates (verified NASA IDs, original URLs, sizes and rights notes) and a validation test; Stage 06 spec written.
- 2026-10-20 — Stage 05 — PR #34 — Editorial review retained all 33 candidates, reconciled preliminary and later science, documented date conflicts and supplemental credits, and aligned the exact-ID/media-path handoff contract.
- 2026-10-20 — Stage 05 approved (PR #34 merged); Stage 06 — PR #44 — Ingestion: `scripts/ingest.ts` with pinned sharp, AVIF/WebP widths, thumbnail and OG image for the 33 approved photos, a tracked `media-lock.json` of source and output checksums, exact NASA IDs with safe path keys, photo entries and sources in the content collections, decoding smoke checks; Stage 07 spec written.
