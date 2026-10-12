# Stage plan

This file is maintained by the agents. Each stage ends in a PR, and Hugo approves it by merging.

Possible statuses: `pending`, `in review` (PR open), `approved` (PR merged).
🔍 = content review stage: the PR brings only the content to approve, without integrating it into the site.
🎨 = design review stage: the PR brings the Figma design and its spec, without site code.

The project follows spec-driven development (see [`specs/README.md`](specs/README.md)): requirements live in [`specs/product.md`](specs/product.md), and each stage is built against its own spec in `docs/specs/stage-NN-*.md`, written and approved one stage ahead. Project structure is in [`STRUCTURE.md`](STRUCTURE.md) and the site map in [`SITEMAP.md`](SITEMAP.md).

| # | Stage | Spec | Status | PR |
| --- | --- | --- | --- | --- |
| 00 | 🔍 Plan, structure, site map and product spec | — | in review | #1 |
| 01 | 🎨 Design in Figma: tokens, components and screens | [stage-01-design](specs/stage-01-design.md) | pending | |
| 02 | Project base: Astro, Tailwind with design tokens, es/en routes, layout, tests, CI | written in 01 | pending | |
| 03 | Preferences: theme, language, site density and gallery view | written in 02 | pending | |
| 04 | 🔍 Curation: candidate photos with IDs in `CURATION.md` (no downloads) | written in 03 | pending | |
| 05 | Ingestion: download script, sharp variants and upload to R2 | written in 04 | pending | |
| 06 | Gallery: chapters, Mosaic/Gallery/Immersive views and per-photo page | written in 05 | pending | |
| 07 | 🔍 Texts: The launch, The mission and Why it matters, in both languages, with sources | written in 06 | pending | |
| 08 | Sections: Home, The launch (with video), The mission (timeline) and Why it matters | written in 07 | pending | |
| 09 | About, AI notice, credits, Open Graph and hreflang | written in 08 | pending | |
| 10 | Final review: accessibility, mobile performance, broken links, traceability | written in 09 | pending | |

Decisions:

- The four mandatory review points are covered by stages 00 (plan), 01 (design), 04 (photos) and 07 (texts).
- Design comes right after the plan so that the project base (Stage 02) is built directly on the approved tokens and layout. Design uses placeholders instead of NASA photos, because curation comes later.
- Every PR carries the spec of the next stage (look-ahead cycle), so merging a PR approves both the result and the next plan without extra PRs.
- Stages 06 and 08 do not integrate unapproved content: 06 comes after 04–05, and 08 after 07.
- Stage 09 includes the footer with the short AI notice; the Stage 02 layout reserves the space.

## Detail by stage

The detailed scope, acceptance criteria and tasks of each stage live in its spec. The summaries below are the starting point for those specs.

### 00 🔍 Plan, structure, site map and product spec
- **Deliverable:** this file, `STRUCTURE.md`, `SITEMAP.md`, `specs/README.md`, `specs/_template.md`, `specs/product.md`, `specs/stage-01-design.md`, PR template. No code.

### 01 🎨 Design in Figma
- Figma file (from `FIGMA_FILE_URL`) with Foundations (variables with theme and density modes), Components and Screens (mobile and desktop for every page in `SITEMAP.md`).
- `docs/specs/design.md` with tokens, CSS variable names, frame links and contrast ratios.
- Figma write access verified on 2026-10-12 (`use_figma`); the file currently has one empty page.
- **Possible blocker:** a write call failing during the stage.

### 02 Project base
- Astro + strict TypeScript + Tailwind; `@astrojs/react` for islands; `@astrojs/sitemap`.
- Design tokens from `design.md` as CSS variables (`src/styles/tokens.css`) wired into Tailwind.
- `package.json` with `dev`, `build`, `check`, `test` scripts and `package-lock.json`; Playwright acceptance tests against the static build, run in CI.
- Routes `src/pages/es/*` and `src/pages/en/*`; `/` redirects to `/es/`.
- Base layout, top bar and footer per Figma; UI text dictionary (`src/i18n/`).
- Content collections with Zod schema: `photos`, `stories`, `chapters`, `sources` (minimal sample data, no real content).
- `src/lib/media.ts`: builds URLs from `MEDIA_BASE_URL`. Section pages as shells.

### 03 Preferences
- React island in the top bar: theme, language, density and, only in galleries, gallery view, as designed in Figma.
- Inline script in `<head>` that applies theme and density before painting. `localStorage` always in try/catch.
- Browser language detection only on the first visit; the language selector keeps the page.

### 04 🔍 Curation
- `CURATION.md` with 20–30 mission photos and 5–8 launch photos: NASA ID, link to the original, chapter, justification, verified rights, candidate stories. No downloads.
- **Possible blocker:** NASA domains blocked by the environment's network.

### 05 Ingestion
- `scripts/ingest.ts`: downloads approved originals, AVIF/WebP at several widths, thumbnail and 1200×630 OG, stored by NASA ID, idempotent; local or R2.
- **Possible blocker:** `R2_*` and `MEDIA_BASE_URL` not defined, or domains without access.

### 06 Gallery
- Chapters, three views (mosaic, gallery, immersive) and the per-photo page, per Figma; OG image per photo.

### 07 🔍 Texts
- ES/EN drafts of The launch, The mission and Why it matters, plus photo stories, each fact with its source. In `docs/content-review/`, not integrated.

### 08 Sections
- Home, The launch (click-to-load player), The mission (timeline, crew, milestones) and Why it matters, with the approved texts, per Figma.

### 09 About, AI notice, credits, OG and hreflang
- Short AI notice in the footer and full in About, `CONTACT_URL`, NASA usage guidelines, credits, hreflang and OG per language.

### 10 Final review
- Accessibility, mobile performance, broken links, build in both languages with the 3 densities and 3 views, visual check against Figma, and the traceability column in `product.md`.

## Log

Each stage adds a line here when opening its PR: date, stage, PR link and one sentence on what it did.

- 2026-10-12 — Stage 00 — PR #1 — Detailed plan, project structure and site map.
- 2026-10-12 — Intermediate step (requested by Hugo) — All Markdown docs are now English-only and are the single source of truth; the Spanish versions were removed.
- 2026-10-12 — Naming unification — Branch pattern generalized to `claude/*`, English-only workflow naming (stage, PR titles, CI steps, chapter IDs), routine renamed to "next stage".
- 2026-10-12 — Stage 00 update (requested by Hugo) — Added the Figma design stage (01, stages renumbered to 10) and spec-driven development: product spec with requirement IDs, stage specs written one stage ahead, PR template, acceptance tests in CI.
- 2026-10-12 — Stage 00 update — Verified the Figma connector can write to the design file (`use_figma`); Stage 01 spec and design rules updated with the tools to use and avoid.
