# Stage 07: Gallery

- **Status:** approved (merged with Stage 06)
- **Requirements covered:** `GAL-01`, `GAL-02`, `GAL-03`, `GAL-04`, `GAL-05`, `GAL-06`, `LEGAL-01`, `PREF-04`, `QA-01`, `QA-02`
- **Depends on:** Stage 06 (ingested photos in `media-lock.json`, photo entries in `src/content/photos`, manifest with `pathKey`, local originals and external-original records), Stage 04 (gallery view preference) and the Figma frames listed below

## Goal

A visitor browses the real Artemis II photographs by chapter in three views (Mosaic, Gallery, Immersive) and opens a page per photo with a large optimized image and a download of the original. Titles, captions, alt text and stories are still placeholders; they arrive in Stage 09.

## Scope

- Chapter pages list their photos in the view chosen with the Stage 04 control, using the generated thumbnails and AVIF/WebP widths (`srcset` and `sizes`, same-origin `/media`, explicit width and height, lazy loading below the fold).
- Photo pages (route key = `pathKey`, never the raw NASA ID): large image, title and caption slots, date when known, camera when known, exact NASA ID, link to the NASA record, "Credit: NASA" with a link to the original, and a link back to the chapter. Photos without a verified date show "To be confirmed"; unresolved date conflicts recorded in `CURATION.md` are not resolved here.
- Original download: for `kind: "local"`, a same-origin download of the unchanged file with its size; for `kind: "nasa"`, an explicit external link labelled in both languages with the size. Stage 06 proves the external case with fixtures only; if any approved original is above 26,214,400 bytes when re-measured, this stage also checks that live link once.
- A 1200×630 Open Graph image per photo page (`og:image` and `twitter:image` use the generated `og.jpg`; `og:image:width` and `og:image:height` are set).
- Read manifest data at build time from the generated `manifest.json` for sizes and file names; the build fails if a photo entry has no manifest record (or the reverse).
- Accessibility: keyboard order, visible focus, `alt` from the content collection in the page language, no layout shift.

## Out of scope

- Final titles, captions, alt text and stories (Stages 08 and 09).
- Home, launch, mission and why-it-matters sections (Stage 09); About, AI notice, credits and hreflang polish (Stage 10).
- Changing the photo selection, ingestion settings or the media contract (Stages 05 and 06).
- Any bucket, Function, Worker or billed image service.

## Design references

- Gallery index: `11:453` (mobile), `11:498` (desktop); Chapter, Mosaic view: `11:547`, `11:608`; Chapter, Gallery view: `11:687`, `11:734`; Chapter, Immersive view: `11:797`, `11:833`; Photo: `11:877`, `11:911`; Photo, light theme: `11:1011`, `11:1045`. Components: `PhotoCard` (`10:207`) and `ViewControl` (`10:77`). Frame IDs are from `docs/specs/design.md`.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | The five chapters list their ingested photos; every ingested photo appears in exactly one chapter, in both languages. | `GAL-01` | automated: `tests/gallery.spec.ts` |
| AC-2 | Mosaic, Gallery and Immersive views render for every chapter and follow the stored preference without a flash. | `GAL-02`, `GAL-03`, `GAL-04`, `PREF-04` | automated for structure and preference; manual for look against Figma |
| AC-3 | Each photo page has its large image, title and caption slots, NASA ID, record link, credit and original download (local file with size, or labelled external link with size). | `GAL-05`, `LEGAL-01` | automated: `tests/photo-page.spec.ts` with a fixture `kind: "nasa"` entry |
| AC-4 | Each photo page has its own 1200×630 `og:image` that exists in the build. | `GAL-06` | automated: `tests/photo-page.spec.ts` |
| AC-5 | Pages load images only from `/media`; no NASA-hosted image is embedded; images have dimensions and alt text in both languages. | `MEDIA-01`, `QA-02` | automated: `tests/media.spec.ts` |
| AC-6 | Keyboard use and visible focus work on the views and the photo page. | `QA-02` | automated: Playwright keyboard checks; manual look |
| AC-7 | Hugo compares the three views and a photo page with the Figma frames in the preview. | `GAL-02`–`GAL-05` | manual |
| AC-8 | Existing checks, build, tests and local security checks pass. | `QA-01` | automated: `npm run check`, `npm run build`, `npm run test`, `npm audit --audit-level=high` |

## Tasks

1. Read `design.md`, the frames above (`figma-read`) and the Stage 06 outputs.
2. Add a build-time manifest reader and responsive image component; build the three views and the photo page.
3. Add the download control (local and external) and Open Graph images.
4. Write the tests, run all checks and write the Stage 08 spec.

## Risks and open questions

- The build needs `manifest.json`: locally, run `npm run ingest` first; the pipeline already runs it before the site build. Decide in the PR how a missing manifest fails.
- Photo pages for 33 photos in two languages add 66 pages; build time and Lighthouse budgets (`QA-03`) are checked in Stage 11.
- Placeholder titles and alt text must not ship as final content: Stage 09 replaces them.
