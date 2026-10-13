# Stage plan

This file is maintained by the agents. Each stage ends in a PR, and Hugo approves it by merging.

Possible statuses: `pending`, `in review` (PR open), `approved` (PR merged, deployed to staging). Production is released separately (see "Releases").
🔍 = content review stage: the PR brings only the content to approve, without integrating it into the site.
🎨 = design review stage: the PR brings the Figma design and its spec, without site code.
"Needs" = capabilities the agent must have to run the stage (see [`agents/README.md`](agents/README.md)). Every stage also needs `git`.

The project follows spec-driven development (see [`specs/README.md`](specs/README.md)): requirements live in [`specs/product.md`](specs/product.md), and each stage is built against its own spec in `docs/specs/stage-NN-*.md`, written and approved one stage ahead. Delivery (environments, pipeline, security) is described in [`DELIVERY.md`](DELIVERY.md). Project structure is in [`STRUCTURE.md`](STRUCTURE.md) and the site map in [`SITEMAP.md`](SITEMAP.md).

| # | Stage | Needs | Spec | Status | PR |
| --- | --- | --- | --- | --- | --- |
| 00 | 🔍 Plan, structure, site map, product spec and delivery design | — | — | in review | #1 |
| 01 | 🎨 Design in Figma: tokens, components and screens | `figma-write` | [stage-01-design](specs/stage-01-design.md) | pending | |
| 02 | Project base: Astro, Tailwind with design tokens, es/en routes, layout, tests | `node`, `browser`, `figma-read` | written in 01 | pending | |
| 03 | Delivery pipeline and security baseline: preview, staging and production deploys, security checks | `node` | written in 02 | pending | |
| 04 | Preferences: theme, language, site density and gallery view | `node`, `browser`, `figma-read` | written in 03 | pending | |
| 05 | 🔍 Curation: candidate photos with IDs in `CURATION.md` (no downloads) | `web` | written in 04 | pending | |
| 06 | Ingestion: script, variants with sharp, upload through the pipeline | `node`, `web` | written in 05 | pending | |
| 07 | Gallery: chapters, Mosaic/Gallery/Immersive views and per-photo page | `node`, `browser`, `figma-read` | written in 06 | pending | |
| 08 | 🔍 Texts: The launch, The mission and Why it matters, in both languages, with sources | `web` | written in 07 | pending | |
| 09 | Sections: Home, The launch (with video), The mission (timeline) and Why it matters | `node`, `browser`, `figma-read` | written in 08 | pending | |
| 10 | About, AI notice, credits, Open Graph and hreflang | `node`, `browser` | written in 09 | pending | |
| 11 | Final review: accessibility, performance, security, links, traceability | `node`, `browser`, `web` | written in 10 | pending | |

## Releases

Production changes only when Hugo publishes a GitHub Release (see `DELIVERY.md`). Suggested milestones; Hugo can release whenever he wants:

| Version | After stage | What visitors get |
| --- | --- | --- |
| `v0.1.0` | 04 | The site shell: design, navigation, both languages, preferences |
| `v0.5.0` | 07 | The photo gallery |
| `v1.0.0` | 11 | The complete site |

## Decisions

- The four mandatory review points are covered by stages 00 (plan), 01 (design), 05 (photos) and 08 (texts). Production releases are a fifth, separate gate.
- Design comes right after the plan, so the project base (Stage 02) is built on approved tokens and layout. Design uses placeholders instead of NASA photos, because curation comes later.
- The pipeline (Stage 03) comes right after the project base: it needs a buildable project, and every later stage then gets previews, staging and security checks.
- Media upload runs in the pipeline, not in agents: agents never hold storage credentials.
- Every PR carries the spec of the next stage (look-ahead cycle), so merging a PR approves both the result and the next plan.
- Stages 07 and 09 do not integrate unapproved content: 07 comes after 05–06, and 09 after 08.
- Stage 10 includes the footer with the short AI notice; the Stage 02 layout reserves the space.

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
- Until Stage 03, Cloudflare Pages' Git integration still deploys; the production URL is not announced.

### 03 Delivery pipeline and security baseline
- The workflows, gates and controls in `DELIVERY.md`: CI, security checks, preview, staging and production deploys, rollback, Dependabot, `public/_headers`, smoke tests.
- Applies the decisions in `DELIVERY.md` (public repository, limited agent token with approval clicks, Pages setup), runs the agent-identity verification tests, and documents the exact setup steps in `SETUP.md`.
- **Possible blocker:** Cloudflare API token, buckets or GitHub settings not ready; the stage opens as a draft with the steps Hugo must take.

### 04 Preferences
- React island in the top bar: theme, language, density and, only in galleries, gallery view, as designed in Figma.
- Inline script in `<head>` that applies theme and density before painting. `localStorage` always in try/catch.
- Browser language detection only on the first visit; the language selector keeps the page.

### 05 🔍 Curation
- `CURATION.md` with 20–30 mission photos and 5–8 launch photos: NASA ID, link to the original, chapter, justification, verified rights, candidate stories. No downloads.

### 06 Ingestion
- `scripts/ingest.ts` with a local mode (agents: download, variants, metadata into content collections) and an upload mode (pipeline: same variants into the staging bucket; promotion to production on release). Idempotent, keyed by NASA ID.

### 07 Gallery
- Chapters, three views (mosaic, gallery, immersive) and the per-photo page, per Figma; Open Graph image per photo.

### 08 🔍 Texts
- ES/EN drafts of The launch, The mission and Why it matters, plus photo stories, each fact with its source. In `docs/content-review/`, not integrated.

### 09 Sections
- Home, The launch (click-to-load player), The mission (timeline, crew, milestones) and Why it matters, with the approved texts, per Figma.

### 10 About, AI notice, credits, OG and hreflang
- Short AI notice in the footer and full in About, `CONTACT_URL`, NASA usage guidelines, credits, hreflang and Open Graph per language.

### 11 Final review
- Accessibility, mobile performance, security (dynamic scan findings, headers), broken links, build in both languages with the 3 densities and 3 views, visual check against Figma, the traceability column in `product.md`, and quality checks switched to blocking.

## Log

Each stage adds a line here when opening its PR: date, stage, PR link and one sentence on what it did.

- 2026-10-12 — Stage 00 — PR #1 — Detailed plan, project structure and site map.
- 2026-10-12 — Intermediate step (requested by Hugo) — All Markdown docs are now English-only and are the single source of truth; the Spanish versions were removed.
- 2026-10-12 — Naming unification — Branch pattern generalized to `claude/*`, English-only workflow naming (stage, PR titles, CI steps, chapter IDs), routine renamed to "next stage".
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
