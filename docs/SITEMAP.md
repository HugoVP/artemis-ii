# Site map (proposal)

Every page exists at `/es/…` and `/en/…`; the language selector takes you to the equivalent page. Section slugs:

| Section | ES | EN |
| --- | --- | --- |
| Home | `/es/` | `/en/` |
| The launch | `/es/despegue/` | `/en/launch/` |
| The mission | `/es/mision/` | `/en/mission/` |
| Why it matters | `/es/por-que-importa/` | `/en/why-it-matters/` |
| Gallery | `/es/galeria/` | `/en/gallery/` |
| Chapter | `/es/galeria/<chapter-slug>/` | `/en/gallery/<chapter-slug>/` |
| Photo | `/es/galeria/<chapter-slug>/<nasa-id>/` | `/en/gallery/<chapter-slug>/<nasa-id>/` |
| About | `/es/acerca/` | `/en/about/` |

Internal chapter IDs are English and used in code and content collections: `launch`, `outbound`, `far-side`, `eclipse`, `return`. Public URL slugs are localized site content: `/en/` uses the ID as is; `/es/` uses `despegue`, `rumbo-a-la-luna`, `lado-oculto`, `eclipse`, `regreso`. The same applies to the Spanish section slugs in the table above. The NASA photo ID is the same in both languages.

`/` redirects to `/es/` until Stage 04. From Stage 04 it first uses the saved language preference (`PREF-05`); only if there is none, on the first visit, it goes to `/en/` when the browser is set to English; otherwise it goes to `/es/`.

## Content per page

- **Home:** featured photo or video, welcome line, links to the other sections.
- **The launch:** summary of the liftoff (date and time, countdown, phases of ascent, what it meant), launch photos and the official video (loaded on demand).
- **The mission:** timeline (launch, translunar injection, far-side flyby, eclipse, return, splashdown), crew (Wiseman, Glover, Koch, Hansen), milestones and records.
- **Why it matters:** first human return to the Moon since Apollo 17 (1972), the Artemis program and what comes next.
- **Gallery:** chapters with the Mosaic/Gallery/Immersive views; the view is chosen with the top-bar control (visible only here).
- **Photo:** large image, story or caption, date, camera, NASA ID, link to the original, download, credit.
- **About:** sources, credits, NASA usage guidelines, full AI notice and contact.

## All pages

Top bar with navigation and preferences (theme, language, density); footer with NASA credit (no logo, no suggestion of endorsement) and short AI notice with a link; hreflang and Open Graph per language. No advertising.
