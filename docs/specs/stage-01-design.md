# Stage 01: Design in Figma

- **Status:** draft (approved when Stage 00 is merged)
- **Requirements covered:** `DES-01`, `DES-02`, `DES-03`, `QA-02` (contrast part); visual definition of `NAV-*`, `PREF-*`, `GAL-*`
- **Depends on:** Stage 00 (`SITEMAP.md`, `product.md`); a Figma file shared through `FIGMA_FILE_URL`; an agent with the `figma-write` capability (`docs/agents/README.md`)

## Goal

Hugo can open one Figma file and see how every page of the site will look on a phone and on a desktop, in both themes and three densities, before any page is coded.

## Scope

- **One Figma file** (`FIGMA_FILE_URL`) with these pages: `Foundations`, `Components` and `Screens` (approved, source of truth for stage 02), plus `Exploration` (alternatives compared before choosing, e.g. two palettes or two top-bar layouts) and `Archive` (rejected options, so they are not proposed again by mistake). No other files.
- **Foundations** page, built with Figma variables:
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
- Final texts and photos: screens use realistic placeholder text and neutral image placeholders, not NASA images (curation is Stage 05).
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
| AC-5 | Every text/background pair meets WCAG AA (4.5:1 for normal text, including navigation links, buttons and preference labels; 3:1 only for large text and non-text UI such as icons, borders and focus rings) in both themes; ratios listed in `design.md`. | `QA-02` | manual: `design.md` table |
| AC-6 | The top bar shows all preference controls on mobile without crowding (menu or sheet allowed). | `PREF-*`, `DES-03` | manual: Figma, mobile top bar |
| AC-7 | No NASA logo, insignia or endorsement wording appears in any frame. | `LEGAL-02` | manual |
| AC-8 | `docs/specs/stage-02-base.md` exists and follows the template. | — | manual: PR diff |

## Tasks

1. Read `FIGMA_FILE_URL` and run `get_metadata` on the file to see its current state (as of Stage 00 it has a single empty page, `Page 1`).
2. Rename `Page 1` to `Foundations` and add the `Components`, `Screens`, `Exploration` and `Archive` pages. Build the Foundations page with variables and modes using `use_figma`. Use `Exploration` for any choice that has more than one option; move the rejected ones to `Archive` and keep only the chosen one in the approved pages.
3. Build components using the variables (`use_figma`; components with variants, auto-layout, every fill, gap and font size bound to a variable).
4. Build mobile screens first, then desktop, then the variations, as instances of the components.
5. Check each frame with `get_screenshot` and fix overlaps, clipped text and broken auto-layout before moving on.
6. Compute contrast ratios and write `docs/specs/design.md`, with a link (`?node-id=`) to every page and frame.
7. Write the Stage 02 spec.
8. Open the PR with links to each Figma page and frame in "What to review".

## Risks and open questions

- **Figma write access: verified on 2026-10-12** with Claude Code's Figma connector. The Figma MCP server exposes `use_figma` (Plugin API: frames, components, variants, text, auto-layout, variables, styles), plus `get_metadata`, `get_screenshot` and `get_variable_defs` for checking. If a write call fails during the stage, the agent keeps what it built, opens a draft PR and explains the error (AGENTS.md, rule 8).
- **Tools not to use:** `html_to_figma` (produces plain layers without components or variables, which breaks `AC-3`), `create_new_file` (work only in `FIGMA_FILE_URL`), `generate_image` and `weave_*` (spend Figma AI credits), and the shader/plugin tools (they change Hugo's account library, not the file).
- **Verified on 2026-10-12:** `FIGMA_FILE_URL` is set and the Figma connector is in the Claude Code routine. If the agent running the stage has no Figma access or no `FIGMA_FILE_URL`, it does not start the stage (`docs/agents/next-stage.md`, step 5).
- **Fonts:** only open-license fonts that can be self-hosted or loaded from Google Fonts.
