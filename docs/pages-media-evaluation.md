# Pages media feasibility evaluation

Hugo authorized using Cloudflare Pages for media on 2026-10-18, including an explicit NASA download exception for originals above 25 MiB. No R2 activation is required.

The preceding local assessment downloaded six real NASA originals and generated ten derivatives per photo: AVIF and WebP at 480, 960, 1600 and 2400 px, a thumbnail and an Open Graph image. These figures report feasibility only, not final curation or visual approval of compression.

| Measurement | Result |
| --- | --- |
| Optimized files | 60 |
| Total optimized size | 5.23 MiB |
| Largest optimized file | 0.77 MiB |
| Originals within the Pages file limit | 5 of 6 |
| Oversized original | NHQ202604110008, 33,976,190 bytes (approximately 32.4 MiB); use external NASA download |
| Illustrative projection for 38 photos | Approximately 33.1 MiB and 380 optimized files |

The projection is not a measurement of the final selection. The file count excludes HTML, fonts, local originals and other assets, so deploy validation must count the complete artifact. The original detailed assessment and measurements were available in `/tmp/artemis-pages-evaluation/` during this session; temporary binaries and measurement files are not committed.

- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/): 20,000 files on Free and 25 MiB per file. This pipeline enforces 26,214,400 bytes and 20,000 files without upgrading services.
- [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/): static requests are free and unlimited when they do not invoke Functions.
- [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/): restore a previous production deployment, including its static media.

These conditions do not guarantee zero cost for the project. GitHub Actions, agent APIs and other Cloudflare products have separate limits and billing.

The oversized source is [NASA NHQ202604110008 original](https://images-assets.nasa.gov/image/NHQ202604110008/NHQ202604110008~orig.jpg). A local packaging smoke experiment used the six existing downloaded sources, 60 optimized files and five unchanged originals; the combined current-site artifact contained 106 files. Image-byte and original-length checks passed on a local fixture server. This was not a Cloudflare deployment or a final ingestion run.
