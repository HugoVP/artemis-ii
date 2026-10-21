# Stage 09: Sections

- **Status:** draft (approved when Stage 08 is merged)
- **Requirements covered:** `NAV-03`, `NAV-04`, `NAV-05`, `NAV-06`, `MEDIA-06`, `CONT-02`, `CONT-04`, `CONT-05`, `I18N-04`, `LEGAL-01`, `LEGAL-02`, `QA-01`, `QA-02`
- **Depends on:** Stage 08 (approved section and photo drafts in `docs/content-review/sections.yaml` and `docs/content-review/photos.yaml`), Stage 07 (gallery views, chapter pages and per-photo pages), Stage 06 (ingested media and `src/content/` collections), and the Figma frames in `docs/specs/design.md`

## Goal

Visitors read the complete Spanish and English content on Home, The launch (with click-to-load official video), The mission (timeline, crew and milestones) and Why it matters, and browse the gallery chapters and photo pages with the approved titles, captions, descriptive alt text, stories and source links.

## Scope

- Integrate the approved texts and source links from `docs/content-review/sections.yaml` and `docs/content-review/photos.yaml` into `src/content/` (`photos`, `stories`, `chapters`, `sources`) and the section pages (`Home`, `The launch`, `The mission`, `Why it matters`), replacing the Stage 02/06/07 placeholder strings in both Spanish and English (`I18N-04`, `CONT-02`, `CONT-04`, `CONT-05`).
- **Home (`NAV-03`):** featured photo from `/media`, welcome copy and section cards linking to The launch, The mission, Why it matters and Gallery in the active language.
- **The launch (`NAV-04`, `MEDIA-06`, `LEGAL-01`):** launch date and time, summary, countdown and ascent phases, click-to-load official NASA launch video player (loads zero third-party or video bytes until the visitor clicks Play, and shows "Crédito: NASA" / "Credit: NASA" with a link to the original record), and the launch chapter photos from `/media`.
- **The mission (`NAV-05`, `CONT-02`):** mission intro, the six-event timeline (launch, translunar injection, outbound/sphere-of-influence entry, lunar flyby with Earthset and Earthrise, deep-space solar eclipse, return and Pacific splashdown), the four crew cards (Reid Wiseman, Victor Glover, Christina Koch, Jeremy Hansen) with `/media` portraits and agency roles, and verified milestones and records with source links.
- **Why it matters (`NAV-06`, `CONT-02`):** hero photo from `/media`, context on the first crewed lunar journey since Apollo 17 (December 1972), Artemis II's role in the Artemis campaign, what comes next (Artemis III, IV and V), and links to the verified official sources.
- **Gallery and photo pages (`CONT-04`, `CONT-05`, `GAL-03`, `GAL-04`, `GAL-05`):** populate `src/content/photos/*.json`, `src/content/chapters/*.json`, `src/content/stories/*.json` and `src/content/sources/*.json` from the approved Stage 08 review YAML files, respecting Hugo's decisions on open date conflicts (`date` kept omitted where unresolved so the UI shows "Por confirmar" / "To be confirmed"), narrative display order per chapter, and story attachments in Immersive view and photo pages.
- Automated Playwright tests in `tests/sections.spec.ts` (and updated gallery/photo tests where needed) verifying `NAV-03`–`NAV-06`, `MEDIA-06` (no network request to the video asset before clicking Play), `CONT-02`–`CONT-05`, `I18N-04` (no placeholder text left on Home, Launch, Mission, Why it matters, chapters or photo pages), and `LEGAL-01`.
- Write the Stage 10 spec from the template.

## Out of scope

- Full About page copy, full AI disclosure from `PROMPT.md`, `CONTACT_URL` wiring, and per-page `hreflang` and section Open Graph tags (Stage 10).
- Interactive expandable timeline, glossary and fact cards, or gallery search and filters (Iteration 2, Stages 12–15).
- Changes to the 33 selected photo IDs or the media ingestion pipeline (Stages 05 and 06).

## Design references

- Home: `11:2` (mobile), `11:41` (desktop), light theme `11:1087` / `11:1125`, Spanish desktop `11:1349`.
- The launch: `11:85` (mobile), `11:154` (desktop).
- The mission: `11:228` (mobile), `11:312` (desktop), compact/spacious density `11:1168` / `11:1258`.
- Why it matters: `11:403` (mobile), `11:424` (desktop).
- Chapter Immersive view: `11:797` (mobile), `11:833` (desktop); Photo page: `11:877` (mobile), `11:911` (desktop).
- Components: `TimelineItem` (`10:208`), `CrewCard` (`10:215`), `VideoPlaceholder` (`10:220`), `CreditLine` (`10:226`), `PhotoCard` (`10:207`). Frame IDs are from `docs/specs/design.md`.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Home renders the featured `/media` photo, welcome text and links to the four main sections in both Spanish and English with no placeholder strings. | `NAV-03`, `I18N-04` | automated: `tests/sections.spec.ts`; manual look against Figma |
| AC-2 | The launch page renders the launch date/time, summary, ascent phases, launch photos from `/media`, and a click-to-load video player that makes zero video/third-party requests before Play is clicked and shows NASA credit with a source link. | `NAV-04`, `MEDIA-06`, `LEGAL-01` | automated: `tests/sections.spec.ts` |
| AC-3 | The mission page renders the six timeline events, four crew cards (Wiseman, Glover, Koch, Hansen) and verified milestones/records with source links in both languages. | `NAV-05`, `CONT-02`, `I18N-04` | automated: `tests/sections.spec.ts`; manual look against Figma |
| AC-4 | Why it matters explains the return to the Moon since Apollo 17 (1972), the role in the Artemis program and what comes next, with linked official sources in both languages. | `NAV-06`, `CONT-02`, `I18N-04` | automated: `tests/sections.spec.ts`; manual look against Figma |
| AC-5 | All 33 photo entries, 5 chapter entries and 9 story entries in `src/content/` carry the approved Spanish and English titles, captions, descriptive alt text, stories and source IDs; Immersive view and photo pages display them with no remaining Stage 06/07 placeholders. | `CONT-02`, `CONT-04`, `CONT-05`, `I18N-04`, `QA-02` | automated: `tests/sections.spec.ts`, `tests/schema.spec.ts` |
| AC-6 | If the launch video is loaded from NASA (`images-assets.nasa.gov`), `public/_headers` CSP `media-src` explicitly permits only what is required and is documented under "Security-relevant changes". | `SEC-05`, `MEDIA-06` | automated: `tests/headers.spec.ts` |
| AC-7 | Hugo compares Home, The launch, The mission, Why it matters, Immersive view and a photo page against the Figma frames in the preview. | `DES-01`, `NAV-03`–`NAV-06` | manual |
| AC-8 | Existing checks, build, tests and local security checks pass. | `QA-01` | automated: `npm run check`, `npm run build`, `npm run test`, `npm audit --audit-level=high` |

## Tasks

1. Read `docs/specs/design.md`, the Figma frames above (`figma-read`), and the approved `docs/content-review/sections.yaml` and `docs/content-review/photos.yaml`.
2. Populate `src/content/photos/*.json`, `src/content/chapters/*.json`, `src/content/stories/*.json` and `src/content/sources/*.json` from the approved Stage 08 content, and order chapter photos by the narrative display order.
3. Build the Home, The launch (with click-to-load video component), The mission (timeline, crew cards, milestones) and Why it matters sections in both languages matching the Figma frames.
4. Write `tests/sections.spec.ts`, run all checks, and write the Stage 10 spec.

## Risks and open questions

- Playing the external NASA MP4 when the visitor clicks Play requires `media-src 'self' https://images-assets.nasa.gov` in `public/_headers` (a protected path); Stage 09 must call this out under "Security-relevant changes" in its PR.
- Any unresolved capture date from Stage 08 (`Artemis II at the pad Moon 01292026_4`, `art002e009007`) stays unset (`date` omitted) unless Hugo resolves it when merging Stage 08.
