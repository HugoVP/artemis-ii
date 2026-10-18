# Stage 04: Preferences

- **Status:** draft (approved when Stage 03 is merged)
- **Requirements covered:** `PREF-01` to `PREF-06`, `I18N-02`, `I18N-03`
- **Depends on:** Stage 02 (layout, tokens with theme and density modes, top bar); Stage 03 (previews to review in)

## Goal

A visitor can choose theme, language and density, and the choices are remembered. Hugo can see them working in the preview, in both languages.

## Scope

- TypeScript only, checked with TypeScript 7: `.ts`, `.tsx` and TypeScript in `.astro` files; no JavaScript files. Use an `agent/stage-04-*` branch (for example `agent/stage-04-preferences`), following `AGENTS.md`.
- React island in the top bar Settings panel: theme (light / dark / system, dark default), language, density (Compact / Comfortable / Spacious) and, only on gallery pages, gallery view (Mosaic / Gallery / Immersive), as designed in Figma.
- A TypeScript source compiled to a bundled external script in `<head>` applies theme and density before first paint (`PREF-02`). If an inline script is unavoidable, keep it minimal, state the reason in a comment and allow it through a CSP hash; no `'unsafe-inline'` for scripts.
- `localStorage` always inside try/catch; the site works with storage blocked (`PREF-05`).
- Browser language detection only on the first visit (`I18N-02`); the language selector keeps the equivalent page (`I18N-03`).
- Controls reachable by keyboard and labelled for screen readers (`PREF-06`); the Stage 02 panel placeholders ("not yet available") are replaced.

## Out of scope

- Gallery views themselves (Stage 07); only the control and the stored value exist here.
- Open Graph and hreflang (Stage 10).

## Design references

- Top bar and Settings panel: Components `TopBar` (10:182) and the Settings frames in `docs/specs/design.md`.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Theme control sets dark, light or system; dark is the default. | `PREF-01` | automated: `tests/preferences.spec.ts` |
| AC-2 | No flash of the wrong theme or density on load. | `PREF-02` | automated: `tests/preferences.spec.ts` |
| AC-3 | Density changes spacing, text size and content width on every page. | `PREF-03` | automated: `tests/preferences.spec.ts` |
| AC-4 | Gallery view control appears only on gallery pages and is independent of density. | `PREF-04` | automated: `tests/preferences.spec.ts` |
| AC-5 | Choices persist between visits and the site works with storage blocked. | `PREF-05` | automated: `tests/preferences.spec.ts` |
| AC-6 | Controls work with the keyboard and have accessible names. | `PREF-06` | automated: `tests/preferences.spec.ts` |
| AC-7 | First visit follows the browser language (es or en, otherwise es); switching language keeps the page. | `I18N-02`, `I18N-03` | automated: `tests/language.spec.ts` |
| AC-8 | The panel matches Figma in both themes and all densities. | — | manual: preview, Settings panel |
| AC-9 | `docs/specs/stage-05-curation.md` exists and follows the template. | — | manual: PR diff |

## Tasks

1. Build the island and the head script; update the CSP test if a script hash is needed.
2. Write the preference and language tests.
3. Run the local checks and write the Stage 05 spec.

## Risks and open questions

- The head script and the CSP (`script-src 'self'`) must agree: prefer a bundled external script in the head over an inline one.
