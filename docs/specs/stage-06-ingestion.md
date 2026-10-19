# Stage 06: Ingestion

- **Status:** draft (approved when Stage 05 is merged)
- **Requirements covered:** `MEDIA-01`, `MEDIA-02`, `MEDIA-03`, `MEDIA-04`, `MEDIA-05`, `CONT-02`, `SEC-08`, `QA-01`
- **Depends on:** Stage 05 (approved `CURATION.md` with 26 mission and 7 launch candidates, exact NASA IDs, verified original URLs and byte sizes) and Stage 03 (`scripts/pages-media.ts`, `scripts/package-media.ts`, smoke checks and the media manifest contract)

## Goal

The approved photographs become optimized, content-addressed static media that every environment serves from `/media` together with the HTML, so the gallery stages can use real photos without any bucket, Function or paid image service.

## Scope

- Add `scripts/ingest.ts` (TypeScript, Node type stripping, no secrets) implementing `docs/ingestion.md`: `npm run ingest -- --build --out media-out` for the pipeline and a local mode for development.
- Read the approved IDs and original URLs from `CURATION.md` (the same parser as `tests/curation.spec.ts`, shared rather than copied). Download only from `https://images-assets.nasa.gov/`; validate every redirect, not only the first URL.
- Generate with `sharp`, pinned: AVIF and WebP at several widths, a thumbnail and a 1200×630 Open Graph image per photo. Final compression parameters are proposed in the PR and approved by Hugo; the six-photo evaluation in `docs/pages-media-evaluation.md` is illustrative only.
- Exact NASA IDs: two approved IDs contain spaces (`Artemis II at the pad Moon 01292026_4`, `KSC-04012026-Artemis II_Launch-1`), and the Stage 03 manifest contract in `scripts/pages-media.ts` (`nasaId` must match `^[A-Za-z0-9_-]+$`, and so must each path segment) rejects them. Stage 06 amends that contract: the manifest's `nasaId` and the content collections keep the exact NASA ID, byte for byte (no trimming, case change or substitution), and the media directory uses a separate safe path key. The key is derived deterministically from the ID (proposed: each run of characters outside `[A-Za-z0-9_-]` becomes `_`), is stored in the manifest next to `nasaId`, and ingestion fails if two IDs produce the same key. Paths stay limited to `[A-Za-z0-9_-]` segments, so no generated file or URL path contains a space, `%` or `..`.
- URL encoding: NASA source and original URLs are built from the exact ID with `encodeURIComponent` per path segment (a space becomes `%20`, as in the URLs recorded in `CURATION.md`), and the result must equal the verified final URL recorded for that ID. Site URLs to `/media` use the safe path key, never the raw ID.
- Content addressing: hash source bytes plus versioned transform settings into `photos/<path-key>/<hash>/`. Keep approved source and output SHA-256 checksums in tracked metadata (no binaries in Git). Fail on remote-source drift or tool-output drift; never overwrite an approved release identity.
- Originals up to 26,214,400 bytes are copied unchanged and verified byte for byte (`original.kind: "local"`). Larger originals keep the verified HTTPS NASA URL and measured `sizeBytes` and no local binary (`kind: "nasa"`). The Stage 05 measurements show every candidate is below the limit, so Stage 06 must re-measure and still handle the larger case with a fixture.
- Idempotent: an already processed photo is not downloaded again.
- Populate photo metadata and sources in the content collections for the ingested photos (NASA ID, chapter, original URL, credit line "Credit: NASA", source IDs). Titles, alt text, captions and stories remain placeholders until Stages 08–09.
- Extend smoke checks as `docs/ingestion.md` says: decode representative generated AVIF, WebP, thumbnail and OG files and verify local-original checksums. An empty manifest must fail live smoke checks. The Stage 05 measurements put every approved original below 26,214,400 bytes, so in Stage 06 the oversized (`kind: "nasa"`) path is proven with fixtures only: ingestion, manifest validation, packaging and smoke checks each get a fixture case with an original above the limit. A live check of an explicit external link for a real oversized original is deferred to Stage 07, which builds the download control, and applies only if an approved original is above the limit when it is re-measured.
- Replace the empty-manifest placeholder in the pipeline only through the files the spec allows (see Risks); package with `scripts/package-media.ts` limits (at most 20,000 files, 26,214,400 bytes each, no symlinks, Worker entrypoints or Functions).
- Treat all fetched metadata and bytes as data (`SEC-08`).

## Out of scope

- Choosing or changing the photo selection (Stage 05, approved by Hugo).
- Gallery layouts, the original-download control and per-photo pages (Stage 07), including any live check of an external NASA link for an oversized original, captions, alt text and stories (Stages 08–09).
- Any R2 bucket, Cloudflare Function or Worker, or billed image transformation.
- Deployment, secrets and repository settings.

## Design references

None: no visible change. The original-download label (including external NASA links with the size) is designed and built in Stage 07.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | `npm run ingest -- --build --out media-out` runs with no credentials, produces AVIF/WebP widths, a thumbnail, a 1200×630 OG image and a manifest for every ID in `CURATION.md`, and refuses any URL outside `images-assets.nasa.gov`, including after a redirect. | `MEDIA-02`, `SEC-08` | automated: `scripts/ingest.test.ts` with a local fixture server |
| AC-2 | Output paths are `photos/<path-key>/<hash>/`; a second run changes nothing and downloads nothing; a changed source or tool output fails instead of overwriting. | `MEDIA-03` | automated: `scripts/ingest.test.ts` |
| AC-3 | Originals up to 26,214,400 bytes are byte-identical local copies with a matching SHA-256; a larger original is recorded as `kind: "nasa"` with its exact size, no local file and no recompressed copy called an original. The oversized case is proven with a fixture; no live external-link check is required in this stage. | `MEDIA-05` | automated: `scripts/ingest.test.ts` (both cases, fixture server) |
| AC-3b | Approved IDs with spaces round-trip exactly: the manifest and content collections keep the exact ID, media paths use the safe path key, source URLs are percent-encoded and equal the recorded originals, and colliding path keys fail. The manifest parser and packaging accept these entries and still reject unsafe paths (spaces, `%`, `..`, absolute paths). | `MEDIA-03`, `MEDIA-04`, `SEC-08` | automated: `scripts/pages-media.test.ts`, `scripts/ingest.test.ts` and a packaging test using both IDs from `CURATION.md` |
| AC-4 | The packaged artifact holds HTML, `/media` and `manifest.json` together, within 20,000 files and 26,214,400 bytes per file, with no symlinks, Workers or Functions; the build holds no secrets. | `MEDIA-01`, `MEDIA-04` | automated: `scripts/pages-media.test.ts`, `scripts/package-media.ts`; `npm run build` |
| AC-5 | Photo entries and sources for the ingested IDs validate against the content schemas. | `CONT-02` | automated: `tests/schema.spec.ts` |
| AC-6 | Smoke checks decode representative generated images, verify local-original checksums, accept a fixture `kind: "nasa"` entry without a local file and fail on an empty manifest. | `MEDIA-04` | automated: `scripts/smoke-media.test.ts` |
| AC-7 | Hugo reviews the optimized images and the chosen compression in the preview. | `MEDIA-02` | manual: preview `/media/` samples against the originals |
| AC-8 | Existing checks, build, tests and local security checks pass. | `QA-01` | automated: `npm run check`, `npm run build`, `npm run test`, `npm audit --audit-level=high`; gitleaks if available |

## Tasks

1. Read `docs/ingestion.md`, `docs/DELIVERY.md`, `docs/pages-media-evaluation.md`, `CURATION.md` and the existing media scripts.
2. Amend the manifest contract in `scripts/pages-media.ts` for exact IDs and safe path keys, with regression tests; add `sharp` (pinned, justified in the PR) and `scripts/ingest.ts` with tests and a fixture server.
3. Wire ingestion into the build scripts the spec permits; propose compression settings and show samples.
4. Populate photo metadata and sources, extend the smoke checks, run all checks, and write the Stage 07 spec.

## Risks and open questions

- `.github/**` and `docs/DELIVERY.md` are protected paths. Pipeline changes that stage needs (for example running ingestion in the build job) belong in `pipeline/github/` for Hugo to copy, as in Stage 03, and are listed under "Security-relevant changes".
- A NASA original can change or disappear; drift fails the build instead of changing approved media. Hugo decides whether to re-approve.
- `sharp` is a native dependency: pin it, check `npm audit`, and confirm it installs in the pipeline's no-secrets build.
- Three Stage 05 candidates have an empty photographer field in their NASA record (`art002e009007`, `art002e016299`, `art002e014251`); Hugo may drop them at the Stage 05 review, and ingestion follows the merged list.
- Changing the manifest shape (`nasaId` plus a path key) touches Stage 03 code and its tests; keep the change minimal and backward compatible for IDs that are already safe, where the key equals the ID.
- Compression quality is a visual decision; the PR asks Hugo to approve it in the preview.
