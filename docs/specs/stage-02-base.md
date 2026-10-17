# Stage 02: Project base

- **Status:** approved (Stage 01 merged)
- **Requirements covered:** `NAV-01`, `NAV-02`, `I18N-01`, `DES-02`, `TECH-01`, `TECH-02`, `TECH-03`, `QA-01`, `MEDIA-01` (URL helper only)
- **Depends on:** Stage 01 (`docs/specs/design.md` and the Figma file); an agent with `node`, `browser` and `figma-read`

## Goal

The repository builds a static, bilingual site shell, with the approved design tokens, layout, top bar and footer, section pages as shells, and automated checks. Hugo can open the preview and navigate every page in Spanish and English.

## Scope

- Astro, strict TypeScript, Tailwind, `@astrojs/react` (islands only, none needed yet beyond the top-bar controls shell), `@astrojs/sitemap`. Node.js 22, `package-lock.json`.
- `src/styles/tokens.css`: every variable in `design.md` as a CSS variable (`--color-*` per theme via `data-theme`, `--space-*` and `--text-base` per density via `data-density`, type and radius), wired into the Tailwind theme. No hard-coded colors, spacing or font sizes in components. Fraunces and Inter self-hosted (OFL) or loaded per `design.md`.
- Routes `src/pages/es/*` and `src/pages/en/*` for every page in `docs/SITEMAP.md` with the localized slugs; `/` redirects to `/es/`. Pages are shells with the Stage 01 placeholder structure; chapter and photo pages are generated from minimal sample data.
- Base layout, top bar (navigation, Settings/Menu button and panel as designed, static for now: preferences logic is Stage 04) and footer (credit, independence note, short AI notice with link) per the Figma frames.
- UI text dictionary (`es`, `en`).
- Content collections with Zod schemas for photos, stories, chapters and sources, with minimal sample data. `src/lib/media.ts` builds URLs from `MEDIA_BASE_URL`.
- `package.json` scripts `dev`, `build`, `check`, `test`; Playwright acceptance tests against the static build.
- Removes the `package.json` existence guard from `.github/workflows/ci.yml`. The agent token cannot push workflow files, so Hugo applies this edit to the branch; the PR says so.

## Out of scope

- Preference logic: theme, language detection, density, gallery view (Stage 04).
- Deploy pipeline and security headers (Stage 03). Cloudflare Pages' Git integration keeps deploying; the production URL is not announced.
- Real photos, texts and the gallery views (Stages 05 to 09).

## Design references

- Top bar, footer and every screen in [`design.md`](design.md) (Screens table). Home mobile 11:2, desktop 11:41.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | `npm run check`, `build` and `test` pass and CI no longer has the `package.json` guard. | `QA-01`, `TECH-01` | automated: CI |
| AC-2 | Every page in `SITEMAP.md` exists under `/es/` and `/en/` with the localized slugs, and `/` redirects to `/es/`. | `NAV-01`, `I18N-01` | automated: `tests/routes.spec.ts` |
| AC-3 | Every page has a top bar with links to all sections and a footer with the credit and AI notice link. | `NAV-02` | automated: `tests/layout.spec.ts` |
| AC-4 | Each Figma variable in `design.md` has the matching CSS variable with the same values per mode. | `DES-02` | automated: `tests/tokens.spec.ts` |
| AC-5 | Content collections reject entries missing required fields or sources. | `TECH-02` | automated: schema test |
| AC-6 | Media URLs come from `MEDIA_BASE_URL`; nothing points to NASA hosts. | `MEDIA-01` | automated: `tests/media.spec.ts` |
| AC-7 | No React is shipped on pages without an island. | `TECH-03` | automated: build output check |
| AC-8 | Pages match the Figma frames on mobile and desktop. | `DES-01` | manual: preview vs Figma |
| AC-9 | `docs/specs/stage-03-pipeline.md` exists and follows the template. | — | manual: PR diff |

## Tasks

1. Scaffold Astro with the packages above; commit `package-lock.json`.
2. Generate `tokens.css` from `design.md` and wire Tailwind.
3. Build layout, top bar, footer and the UI dictionary, reading frames with `get_screenshot` and `get_variable_defs`.
4. Create routes, sample data, collections and `media.ts`.
5. Write the Playwright tests above.
6. Run `check`, `build`, `test` and the local security checks in `DELIVERY.md`.
7. Write the Stage 03 spec; ask Hugo to remove the CI guard on the branch.

## Risks and open questions

- Hugo must apply the `ci.yml` edit (agent tokens cannot push workflows).
- Fonts: confirm self-hosting versus Google Fonts before the security headers (CSP) in Stage 03.
