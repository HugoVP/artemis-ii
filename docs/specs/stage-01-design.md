# Stage 01: Design in Figma

- **Status:** draft (approved when Stage 00 is merged)
- **Requirements covered:** `DES-01`, `DES-02`, `DES-03`, `QA-02` (contrast part); visual definition of `NAV-*`, `PREF-*`, `GAL-*`
- **Depends on:** Stage 00 (`SITEMAP.md`, `product.md`); a Figma file shared through `FIGMA_FILE_URL`; the Figma connector enabled in the routine

## Goal

Hugo can open one Figma file and see how every page of the site will look on a phone and on a desktop, in both themes and three densities, before any page is coded.

## Scope

- **Foundations** page in the Figma file, built with Figma variables:
  - Color collection with modes `dark` (default) and `light`: background, surface, text, muted text, accent, focus ring, border.
  - Typography: one or two open-license fonts (Google Fonts), type scale for headings, body, captions, UI labels.
  - Spacing and layout collection with modes `compact`, `comfortable` (default), `spacious`: spacing scale, base text size, content max width.
- **Components** page: top bar (navigation + theme, language, density controls + gallery view control), footer with credit and short AI notice, buttons and links, photo card (mosaic, gallery, immersive variants), timeline item, crew card, lightweight video placeholder (before click), source/credit line.
- **Screens** page, mobile (390 px wide) and desktop (1440 px wide), dark theme, comfortable density, in Spanish:
  Home, The launch, The mission, Why it matters, Gallery index, a chapter in each of the three views, a photo page, About.
- Variations: the photo page and Home in light theme; the mission page in compact and spacious density; one English screen to check text length.
- `docs/specs/design.md` in the repo: token tables (name, value per mode, CSS variable name), component inventory, link to every Figma frame, and contrast ratios of each text/background pair in both themes.
- The spec for Stage 02 (`docs/specs/stage-02-base.md`), per the look-ahead cycle.

## Out of scope

- Site code (Stage 02 onward).
- Final texts and photos: screens use realistic placeholder text and neutral image placeholders, not NASA images (curation is Stage 04).
- Logos: no NASA logo or insignia anywhere (`LEGAL-02`).

## Design references

This stage creates them.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Every page in `SITEMAP.md` has a mobile and a desktop frame in Figma. | `DES-01`, `DES-03` | manual: Figma, Screens page |
| AC-2 | The three gallery views are shown for the same chapter. | `GAL-02`–`GAL-04` | manual: Figma, chapter frames |
| AC-3 | Colors, spacing and type are Figma variables with the modes listed in Scope, and every variable has a CSS name in `design.md`. | `DES-02` | manual: Figma variables panel + `design.md` |
| AC-4 | Switching a frame between `dark`/`light` and between densities in Figma updates it without broken layouts. | `PREF-01`, `PREF-03` | manual: Figma, mode switcher |
| AC-5 | Every text/background pair meets WCAG AA (4.5:1 body, 3:1 large text and UI) in both themes; ratios listed in `design.md`. | `QA-02` | manual: `design.md` table |
| AC-6 | The top bar shows all preference controls on mobile without crowding (menu or sheet allowed). | `PREF-*`, `DES-03` | manual: Figma, mobile top bar |
| AC-7 | No NASA logo, insignia or endorsement wording appears in any frame. | `LEGAL-02` | manual |
| AC-8 | `docs/specs/stage-02-base.md` exists and follows the template. | — | manual: PR diff |

## Tasks

1. Read `FIGMA_FILE_URL`; confirm the Figma connector can read and write that file. If not, stop and open a draft PR (see Risks).
2. Build the Foundations page with variables and modes.
3. Build components using the variables.
4. Build mobile screens first, then desktop, then the variations.
5. Compute contrast ratios and write `docs/specs/design.md`.
6. Write the Stage 02 spec.
7. Open the PR with links to each Figma page and frame in "What to review".

## Risks and open questions

- **Figma write access.** The agent must be able to create pages, variables, components and frames through the Figma connector. If the connector only allows reading, the stage cannot be completed automatically: the agent opens a draft PR with `design.md` (tokens, components and layout described in text) and asks Hugo how to proceed (for example, Hugo lays out the frames and the agent reviews and documents them).
- **Missing `FIGMA_FILE_URL`** or the Figma connector not enabled in the routine: draft PR asking for it (CLAUDE.md, rule 8).
- **Fonts:** only open-license fonts that can be self-hosted or loaded from Google Fonts.
