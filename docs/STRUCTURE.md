# Project structure (proposal)

```
artemis-ii/
├── CLAUDE.md  PROMPT.md  CURATION.md (Stage 03)
├── astro.config.mjs  tailwind.config.*  tsconfig.json
├── package.json  package-lock.json
├── .github/workflows/ci.yml
├── docs/                      PLAN, SETUP, ROUTINE, STRUCTURE, SITEMAP
│   └── content-review/        text drafts (Stage 06)
├── scripts/
│   └── ingest.ts              download + sharp + upload to R2 (Stage 04)
├── public/                    only favicon and very light thumbnails
└── src/
    ├── content/
    │   ├── config.ts          Zod schemas
    │   ├── photos/            one file per photo (metadata, ES/EN)
    │   ├── stories/           photo stories (ES/EN, with sources)
    │   ├── chapters/          mission chapters
    │   └── sources/           sources with title, URL and date accessed
    ├── i18n/                  UI texts es/en and route utilities
    ├── lib/                   media.ts (MEDIA_BASE_URL), dates, helpers
    ├── layouts/               Base.astro
    ├── components/            static .astro; React islands in components/islands/
    ├── styles/                global.css, theme and density variables
    └── pages/
        ├── index.astro        redirects to /es/
        ├── es/  …             pages in Spanish
        └── en/  …             pages in English
```

## Decisions

- **Routes by language folder** (`pages/es`, `pages/en`) with Spanish as the default; the slugs are the same in both languages so you can switch language on the same page, except for section names (see `SITEMAP.md`).
- **Bilingual Zod schemas:** each text field is `{ es, en }`; sources are linked by ID from photos and stories, and each fact carries `sourceIds`.
- **Media outside the repo:** `MEDIA_BASE_URL` points to R2 (production) or to a local folder ignored by git (development). Path: `<MEDIA_BASE_URL>/<nasa-id>/{original.ext, 640.avif, 1280.webp, thumb.webp, og.jpg…}`.
- **React islands** only for preferences and, if needed, the gallery viewer.
- **No secrets in the repo;** `.env.example` only with variable names.
