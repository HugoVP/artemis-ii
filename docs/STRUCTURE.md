# Project structure (proposal)

```
artemis-ii/
├── AGENTS.md                  rules for every AI agent (single source)
├── CLAUDE.md                  pointer to AGENTS.md for Claude Code
├── REVIEW.md                  short copy of the code review rules (read by Copilot code review)
├── PROMPT.md                  Hugo's original brief
├── CURATION.md                photo selection (Stage 05)
├── astro.config.mjs  tailwind.config.*  tsconfig.json
├── package.json  package-lock.json
├── Dockerfile  compose.yaml  .dockerignore   development and test images (docs/DOCKER.md)
├── .devcontainer/             dev container for VS Code and Codespaces
├── .github/
│   ├── workflows/             ci, security, preview-build, deploy-preview, deploy-staging, deploy-production, media, dast (Stage 03)
│   ├── dependabot.yml         dependency updates (Stage 03)
│   └── pull_request_template.md
├── docs/
│   ├── PLAN.md  DELIVERY.md  SETUP.md  STRUCTURE.md  SITEMAP.md  DOCKER.md
│   ├── agents/                how to run stages with any agent
│   ├── specs/                 product spec, design spec, one spec per stage
│   └── content-review/        text drafts (Stage 08)
├── tests/                     Playwright acceptance and smoke tests, named after spec criteria (Stage 02)
├── scripts/
│   └── ingest.ts              local mode for agents, credential-free build mode for the pipeline; uploads are done by `media.yml` (Stage 06)
├── public/
│   └── _headers               security headers (Stage 03); plus favicon and very light thumbnails
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
    ├── styles/                tokens.css (from Figma variables), global.css
    └── pages/
        ├── index.astro        redirects to /es/
        ├── es/  …             pages in Spanish
        └── en/  …             pages in English
```

## Decisions

- **Routes by language folder** (`pages/es`, `pages/en`) with Spanish as the default; slugs are localized per `SITEMAP.md`, and the language selector maps each page to its equivalent.
- **Bilingual Zod schemas:** each text field is `{ es, en }`; sources are linked by ID from photos and stories, and each fact carries `sourceIds`.
- **Media outside the repo:** `MEDIA_BASE_URL` points to the bucket of each environment (`docs/DELIVERY.md`) or to a git-ignored local folder. Path: `<MEDIA_BASE_URL>/photos/<nasa-id>/<hash>/{original.ext, 640.avif, 1280.webp, thumb.webp, og.jpg…}`, where `<hash>` identifies the content (see "Media flow" in `docs/DELIVERY.md`); `media.ts` reads the hash from the photo's metadata.
- **Configuration per environment** comes from build-time variables set by the pipeline; nothing environment-specific is committed.
- **React islands** only for preferences and, if needed, the gallery viewer.
- **No secrets in the repo;** `.env.example` only with variable names.
- **Design tokens** come from the Figma variables documented in `docs/specs/design.md`, generated as CSS variables in `src/styles/tokens.css` with the same names, and exposed to Tailwind.
- **Specs and tests side by side:** each acceptance criterion `AC-n` of `stage-NN` that can be automated has its test in `tests/stage-NN.spec.ts`, so a failing test points straight at the requirement it protects. Criteria checked by a person (for example the Figma design in Stage 01) are marked `manual` in the spec and listed in the PR checklist instead.
