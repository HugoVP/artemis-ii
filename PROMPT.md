# Prompt: Artemis II site

I want to create a bilingual website (Spanish and English) about NASA's Artemis II mission: the launch, the mission and its significance, and a gallery of stories built from the photos the crew took. The idea is to invite people to relive the return of humans to the Moon.

## Technology

- Astro + TypeScript + Tailwind, 100% static site, deployed on Cloudflare Pages.
- No database: content lives in content collections with a typed schema.
- React components only where interactivity is needed (the preference controls, for example).

## Site sections

1. **Home:** a featured photo or video, a welcome line, and links to the other sections.
2. **The launch:** the liftoff of the SLS rocket with the Orion capsule from Kennedy Space Center. Summarize the event: date and time, how the countdown went, the phases of ascent, and what it meant to watch it. Include launch photos and NASA's official video.
3. **The mission:** a summary of the roughly 10-day journey, with a timeline (launch, translunar injection, far-side flyby, eclipse, return and splashdown), the crew (Reid Wiseman, Victor Glover, Christina Koch and Jeremy Hansen), and the mission's milestones and records.
4. **Why it matters:** the significance of returning to the Moon with humans for the first time since Apollo 17 in 1972, what it means for the Artemis program, and what comes next.
5. **Gallery:** the crew's photos, organized by mission chapters.
6. **About:** sources, credits, NASA usage guidelines, and the notice about the use of AI.

All data (dates, times, distances, records, firsts) is verified against official sources before publishing, with the link stored in the data. Do not take it from memory.

## Media: own storage

- Images do not depend on NASA's servers. They are downloaded once and served from our own storage.
- Write a script (for example, `scripts/ingest.ts`) that:
  1. Downloads the originals of the approved photos, including the launch ones.
  2. Generates optimized variants with sharp (AVIF and WebP at several widths, plus a thumbnail and a 1200×630 Open Graph image).
  3. Stores everything in a tidy structure organized by NASA ID.
  4. Is idempotent: if a photo is already processed, it is not downloaded again.
- Storage configurable with an environment variable (for example, `MEDIA_BASE_URL`):
  - Development: local file system, outside the bundle if it is heavy.
  - Production: Cloudflare R2. The script produces what gets uploaded; the upload itself is done by the pipeline (a trusted workflow with a pinned storage tool), so no project code ever runs with storage credentials.
- Keep the high-resolution original in our own storage so it can be offered as a download from the site.
- Each photo also stores the link to the original NASA resource, and it is shown on the page.
- Launch video: embed NASA's official video with a lightweight player that loads nothing from third parties until the user clicks. If useful, keep a few short clips or frames in our own storage to use as covers.

## Sources

- Artemis II collection of the Gateway to Astronaut Photography: https://eol.jsc.nasa.gov/Collections/Artemis/Artemis2/ (categories Earth, Moon and eclipse).
- PDS scientific archive: https://pds-imaging.jpl.nasa.gov/tools/atlas/archive-explorer?mission=artemis2
- Official NASA galleries, videos and notes about the launch, the lunar flyby and the return.

## Your role as curator

- You select the best photos: between 20 and 30 from the mission and between 5 and 8 from the launch. Look for visual impact, variety and historical value (the rocket on the pad, the liftoff, Earthset and Earthrise, the total eclipse with the corona, the Orientale basin, the Milky Way, the crew at the windows, the Earth rising, and the return).
- Briefly justify each choice in a `CURATION.md` file.
- Write a photo's story only when it is worth it. Example: near the Orientale basin, the crew named two craters Integrity, after the spacecraft, and Carroll, after the late wife of commander Reid Wiseman. Tell that kind of story with respect and without dramatizing.
- Every story must be based on official or reliable journalistic sources, with the link stored in the data. Do not invent facts, dates or quotes. If you cannot verify something, leave it out.
- The other photos get a short caption and a descriptive alt text.

## Bilingual

- Routes by language (`/es/` and `/en/`), with Spanish as the default language. Detect the browser language only on the first visit.
- All content (sections, stories, captions and alt texts) is written in both languages. The English must sound natural, not like a literal translation.
- Switching language takes you to the same page in the other language, not to the home page.
- hreflang and Open Graph tags per language.

## Display preferences

Controls in the top bar, accessible and remembered between visits (localStorage, with try/catch):

1. **Theme:** light / dark / follow system. Dark is the default, because space photos look best that way. No flash of the wrong theme on load.
2. **Language:** ES / EN.
3. **Site density**, which adjusts spacing, text size and content width across all pages:
   - Compacta / Compact: more information per screen.
   - Cómoda / Comfortable: the middle ground, the default.
   - Amplia / Spacious: more air and larger text, for unhurried reading.
4. **Gallery view**, independent of site density and visible only in galleries:
   - Mosaico / Mosaic: compact grid, many photos in view.
   - Galería / Gallery: the middle ground, photo with title.
   - Inmersiva / Immersive: one full-width photo with its story, to read like a narrative.

## Gallery structure

- Chapters by mission moment: the launch, toward the Moon, the far side, the eclipse and the return.
- A page per photo with the large image, the story or caption, the date, the camera if known, the original NASA ID, the link to the original, and the download from our own storage.
- Open Graph images per photo, so they look good when shared on WhatsApp.
- Sober design centered on the photo. Responsive and mobile first, because most people will see it on their phone.

## AI use notice

In the footer (short, with a link) and in full in "About", in both languages:

- **ES:** "Este sitio fue creado con ayuda de inteligencia artificial y con las mejores intenciones: compartir la emoción de esta misión. Si algún dato es incorrecto o algún contenido resulta ofensivo, nunca fue esa la intención. Agradecemos que nos lo hagas saber para corregirlo."
- **EN:** "This site was created with the help of artificial intelligence and with the best of intentions: to share the excitement of this mission. If any information is incorrect or any content feels offensive, that was never the intention. Please let us know so we can fix it."
- Include a contact link or email (leave it as a configurable variable).

## Licenses and credits

- Each photo and video carries "Crédito: NASA" / "Credit: NASA" and the link to the original.
- Do not use the NASA logo or insignia, and do not suggest that NASA endorses the site.
- Site with no advertising or product sales (photos with astronauts have commercial-use restrictions).
- If any photo is marked with third-party rights, exclude it.
- In "About", link NASA's usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/

## How we work

The project advances in stages, and each stage ends in a pull request. My approval is merging that PR. The full workflow rules are in `AGENTS.md`, the stage plan is in `docs/PLAN.md`, and delivery is described in `docs/DELIVERY.md`.

The project follows spec-driven development: every stage is built against an approved spec (see `docs/specs/README.md`).

Mandatory review points, each in its own PR:

1. The plan, the project structure and the site map.
2. The visual design in Figma, before any page is coded.
3. The list of candidate photos with their IDs, before downloading images in bulk.
4. The texts for The launch, The mission and Why it matters, with their sources, before integrating them into the site.

## Delivery and agents

- Real CI/CD with security built in: every pull request from this repository gets a preview (pull requests from forks are only built and checked), every approved stage goes to staging, and production only changes when I publish a release.
- Agents never hold deployment or storage credentials, and never merge, release or change settings.
- The process must not depend on one AI vendor: Claude Code today, and later OpenAI Codex or open models must be able to run the same stages with the same rules.

In the end, the static build must work in both languages, with the three density modes and the three gallery views.

**Do it with Astro and deploy on Cloudflare (Pages for the site, R2 for the media).**
