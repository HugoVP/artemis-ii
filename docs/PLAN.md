# Stage plan

This file is maintained by the agents. Each stage ends in a PR, and Hugo approves it by merging.

Possible statuses: `pending`, `in review` (PR open), `approved` (PR merged).
🔍 = content review stage: the PR brings only the content to approve, without integrating it into the site.

Project structure is in [`STRUCTURE.md`](STRUCTURE.md) and the site map in [`SITEMAP.md`](SITEMAP.md).

| # | Stage | Status | PR |
| --- | --- | --- | --- |
| 00 | 🔍 Detailed plan, project structure and site map | in review | #1 |
| 01 | Project base: Astro, Tailwind, es/en routes, layout, CI | pending | |
| 02 | Preferences: theme, language, site density and gallery view | pending | |
| 03 | 🔍 Curation: candidate photos with IDs in `CURATION.md` (no downloads) | pending | |
| 04 | Ingestion: download script, sharp variants and upload to R2 | pending | |
| 05 | Gallery: chapters, Mosaic/Gallery/Immersive views and per-photo page | pending | |
| 06 | 🔍 Texts: The launch, The mission and Why it matters, in both languages, with sources | pending | |
| 07 | Sections: Home, The launch (with video), The mission (timeline) and Why it matters | pending | |
| 08 | About, AI notice, credits, Open Graph and hreflang | pending | |
| 09 | Final review: accessibility, mobile performance and broken links | pending | |

Stage 00 keeps the suggested order and split. Adjustments decided:

- The three mandatory review points in `PROMPT.md` are covered by stages 00, 03 and 06.
- Stages 05 and 07 could be built with minimal test data if their content stages (03/06) were not yet merged, but they do not integrate unapproved content. The current order avoids that case: 05 comes after 04, and 07 after 06.
- Stage 08 includes the footer with the short AI notice; the Stage 01 layout reserves the space.

## Detail by stage

### 00 🔍 Plan, structure and site map
- **Deliverable:** this file, `STRUCTURE.md`, `SITEMAP.md`. No code.
- **Approval:** Hugo merges.

### 01 Project base
- Astro + strict TypeScript + Tailwind; `@astrojs/react` installed for islands; `@astrojs/sitemap`.
- `package.json` with `dev`, `build`, `check` (`astro check`) scripts, `package-lock.json`.
- Routes `src/pages/es/*` and `src/pages/en/*`; `/` redirects to `/es/` (browser language detection arrives in Stage 02).
- Base layout, top bar and footer (with room for the AI notice), UI text dictionary (`src/i18n/`).
- Content collections with Zod schema: `photos`, `stories`, `chapters`, `sources` (with minimal sample data, no real content).
- `src/lib/media.ts`: builds URLs from `MEDIA_BASE_URL`.
- Pages for each section as shells without final text.
- **Review:** `/es/` and `/en/` load, navigation between sections, mobile view.

### 02 Preferences
- React island in the top bar: theme (light/dark/system, dark by default), language, density (compact/comfortable/spacious) and, only in galleries, view (mosaic/gallery/immersive).
- Inline script in `<head>` that applies theme and density before painting (no flash). `localStorage` always in try/catch.
- Density through CSS variables (spacing, text size, content width). Browser language detection only on the first visit.
- The language selector takes you to the same page in the other language.
- **Review:** every combination of preferences, persistence on reload, visible focus and contrast in both themes.

### 03 🔍 Curation
- `CURATION.md` with 20–30 mission photos and 5–8 launch photos: NASA ID, link to the original, chapter, justification, verified license/rights, and notes on candidate stories. No images downloaded.
- Sources: Gateway to Astronaut Photography, PDS, official NASA galleries.
- **Possible blocker:** NASA domains blocked by the environment's network; reported in the PR.

### 04 Ingestion
- `scripts/ingest.ts`: reads the approved list, downloads originals, generates AVIF/WebP at several widths, thumbnail and 1200×630 Open Graph, stores by NASA ID, idempotent.
- Local destination (development) or R2 (production) depending on environment variables; no secrets in the repo.
- Photo metadata moves to `src/content/photos/`.
- **Possible blocker:** `R2_*` and `MEDIA_BASE_URL` variables not defined, or domains without access.

### 05 Gallery
- Chapters: the launch, toward the Moon, the far side, the eclipse, the return.
- Three views (mosaic, gallery, immersive) independent of density, page per photo (image, story or caption, date, camera, NASA ID, link to the original, download from own storage, credit).
- Open Graph per photo.

### 06 🔍 Texts
- ES/EN drafts of The launch, The mission and Why it matters, plus photo stories, each fact with its source link. Anything unverifiable is left out and noted.
- They go in `docs/content-review/` without being integrated into the site.

### 07 Sections
- Home, The launch (lightweight player that loads nothing from third parties until clicked), The mission (timeline, crew, milestones and records) and Why it matters, with the approved texts.

### 08 About, AI, credits, OG and hreflang
- Short AI notice in the footer and full in About (ES/EN), `CONTACT_URL`, NASA usage guidelines, credits, hreflang and Open Graph per language.

### 09 Final review
- Accessibility (contrast, focus, alt text in both languages), mobile performance, broken links, build in both languages with the 3 densities and the 3 views.

## Log

Each stage adds a line here when opening its PR: date, stage, PR link and one sentence on what it did.

- 2026-10-12 — Stage 00 — PR #1 — Detailed plan, project structure and site map.
- 2026-10-12 — Intermediate step (requested by Hugo) — All Markdown docs are now English-only and are the single source of truth; the Spanish versions were removed.
- 2026-10-12 — Naming unification — Branch pattern generalized to `claude/*`, English-only workflow naming (stage, PR titles, CI steps, chapter IDs), routine renamed to "next stage".
