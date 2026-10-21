# Stage 09: Sections

- **Status:** draft (approved when Stage 08 is merged)
- **Requirements covered:** `NAV-03`, `NAV-04`, `NAV-05`, `NAV-06`, `CONT-02`, `CONT-04`, `CONT-05`, `GAL-03`, `GAL-04`, `GAL-05`, `I18N-01`, `LEGAL-01`, `QA-01`, `QA-02`
- **Depends on:** Stage 08 (the approved drafts in `docs/content-review/`), Stage 07 (gallery, chapters and photo pages with caption, alt and story slots), Stage 04 (preferences) and the Figma frames listed below

## Goal

A visitor reads Home, The launch, The mission and Why it matters in Spanish or English, and sees the approved titles, captions, alt text and stories in the gallery views and on every photo page.

## Scope

- Move the texts Hugo approved in `docs/content-review/photos.yaml` into `src/content/photos` (title, caption, alt) and `src/content/stories` (one story per anchor photo, `photoId` = the anchor's NASA ID), keeping each entry's source links as `sources` entries and `sourceIds`. Anything Hugo changed or removed in the review is followed exactly; the YAML drafts are then deleted from `docs/content-review/` or marked integrated.
- Add the section texts of `docs/content-review/sections.yaml` to content collections with Zod schemas (blocks, timeline milestones with dates, crew, milestones), each fact with its sources (`CONT-02`).
- Pages, per the Figma frames: Home (featured photo, welcome line, links), The launch (summary, launch photos, official NASA video loaded on demand after a click), The mission (timeline, crew, milestones; static HTML, no interaction yet) and Why it matters. Sources appear next to or below the facts they support.
- Show the story in the Immersive view and on the photo page when a photo has one; the caption in the Mosaic and Gallery views; `alt` from the collection in the page language.
- Resolve the open decisions and omitted facts listed in `sections.yaml` only as Hugo decided in the Stage 08 review; anything still open stays out of the pages.
- Write the Stage 10 spec from the template.

## Out of scope

- About, AI notice, credits page, hreflang and Open Graph per language (Stage 10).
- The interactive timeline (Stage 15) and the glossary (Stages 14–15).
- New photos, new curation, ingestion changes or visual redesign.
- Any text, quote or fact that was not approved in Stage 08.

## Design references

- Home `11:2` (mobile), `11:41` (desktop); The launch `11:85`, `11:154`; The mission `11:228`, `11:312`; Why it matters `11:403`, `11:424`; Home in Spanish, desktop (text length check) `11:1349`. Gallery and photo frames are those of Stage 07 (`design.md`).

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Home, The launch, The mission and Why it matters exist in both languages with the approved text and a source next to every fact. | `NAV-03`–`NAV-06`, `CONT-02`, `I18N-01` | automated: `tests/sections.spec.ts`; look against Figma: manual |
| AC-2 | The launch loads the official NASA video only after a click. | `NAV-04` | automated: `tests/sections.spec.ts` |
| AC-3 | The mission shows the timeline, the four crew members and the milestones, from the content collections. | `NAV-05`, `CONT-02` | automated: `tests/sections.spec.ts` |
| AC-4 | All 33 photos show their approved title, caption and alt text in both languages; photos with a story show it in the Immersive view and on the photo page. | `CONT-04`, `CONT-05`, `GAL-03`–`GAL-05` | automated: `tests/gallery.spec.ts`, `tests/photo-page.spec.ts` |
| AC-5 | Every integrated text equals its approved draft (no text added or changed without a spec change). | `CONT-04` | automated: `scripts/content-integration.test.ts` |
| AC-6 | Credit and links to the original remain on every photo. | `LEGAL-01` | automated: existing Stage 07 tests |
| AC-7 | Hugo reads the pages in the preview and compares them with the Figma frames. | `NAV-03`–`NAV-06` | manual |
| AC-8 | Existing checks, build, tests and local security checks pass. | `QA-01`, `QA-02` | automated: `npm run check`, `npm run build`, `npm run test`, `npm audit --audit-level=high` |

## Tasks

1. Read the approved drafts and Hugo's review comments.
2. Extend the Zod schemas and fill the collections; write the integration test against the drafts.
3. Build the four pages against the Figma frames; wire stories, captions and alt text into the gallery.
4. Run all checks and write the Stage 10 spec.

## Risks and open questions

- `NAV-06` asks for "the first crewed return to the Moon since Apollo 17"; no source consulted in Stage 08 says it in those words, so Hugo decides whether to find a source or reword the requirement.
- The countdown, ascent phases and the official NASA video (`NAV-04`) were not verified in Stage 08; this stage verifies them against NASA sources first or leaves them out and lists them in the PR.
- Spanish text can be longer than English; check the Home frame in Spanish (`11:1349`).
