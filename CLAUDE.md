# CLAUDE.md — Artemis II bilingual site

Read this file in full before doing anything. Then read `PROMPT.md` (what is being built) and `docs/PLAN.md` (which stage we are on).

## Workflow

This project is built by cloud agents, one stage at a time. The project owner (Hugo) approves each stage by merging its pull request. That merge does two things on its own:

1. Cloudflare Pages deploys `main` to production.
2. A Claude Code routine starts the next stage.

For that reason every stage must end in a PR that can be merged as is, with no hidden manual steps.

## Documentation language

All Markdown files in this repo (`CLAUDE.md`, `PROMPT.md`, everything in `docs/`, `CURATION.md`, any new `.md`) are written in **English only**. They are the single source of truth. Never create Spanish or bilingual copies of Markdown files. This applies to documentation, not to the site's bilingual content (content collections, UI strings) nor to PR text, which stays in Spanish.

## Rules for each stage

1. **One stage per session and per PR.** Take only the next pending stage in `docs/PLAN.md`. Do not get ahead on future stages.
2. **Never push to `main`.** Work on a branch `claude/etapa-NN-short-name` and open a PR against `main`.
3. **If a stage PR is already open, do not start another.** Finish with no changes and explain why in the session summary.
4. **Before opening the PR:**
   - Run `npm run build` (and `npm run check` once it exists) and make sure they pass.
   - Update `docs/PLAN.md`: mark the stage as `in review`, link the PR, and note what is pending or changed.
5. **PR format**, in Spanish:
   - Title: `Etapa NN: <name>`.
   - What was done, in short bullets.
   - What to review: the concrete list of things Hugo must check in the Cloudflare preview (pages and what to look for on each).
   - Decisions made and why.
   - Sources consulted, if the stage includes data or text.
   - Pending items or risks.
6. **Content review stages** (marked 🔍 in the plan): the PR contains only the content to review (lists, texts, sources), not yet integrated into the site. Hugo approves by merging or asks for changes in comments.
7. **If Hugo leaves comments on a PR**, address them on the same branch. Do not open another PR for the same thing.
8. **If you get blocked** (a missing credential, a domain blocked by the network, a decision not covered in the prompt), do not improvise: open the PR as a draft with what you did achieve and explain exactly what you need from Hugo.

## Content rules

- Every fact (dates, times, distances, records, firsts, names) is verified against official or reliable journalistic sources. Keep the link to each source next to the fact in the content collections. Do not write facts from memory.
- If something cannot be verified, leave it out and note it in the PR.
- Spanish and English written naturally, never as a literal translation.
- Sensitive stories (for example, Carroll crater) are told with respect and without dramatizing.
- Credits: "Crédito: NASA" / "Credit: NASA" with a link to the original. No NASA logos or insignia, no suggestion of NASA endorsement, no advertising.

## Technical rules

- Astro + TypeScript + Tailwind, 100% static site. React only for interactive islands.
- Package manager: npm, with `package-lock.json` in the repo. `build` and `check` scripts in `package.json` (CI uses them).
- Content collections with Zod schemas for photos, stories, chapters and sources.
- Media served from our own storage via `MEDIA_BASE_URL`. Never hotlink images on NASA servers (only "view original" links).
- Heavy images and binaries stay out of the repo: they go to R2. The repo only keeps metadata and, at most, very light thumbnails.
- Secrets only in environment variables. Never write keys, tokens or private endpoints in repo files, commits or PRs.
- `localStorage` always inside try/catch.
- Accessibility: sufficient contrast in both themes, visible focus, alt text in both languages.
- Mobile first.

## Expected environment variables

| Variable | Use |
| --- | --- |
| `MEDIA_BASE_URL` | Public URL of the media in R2 |
| `R2_ACCOUNT_ID` | Cloudflare account used to upload to R2 |
| `R2_ACCESS_KEY_ID` | R2 access key (project bucket only) |
| `R2_SECRET_ACCESS_KEY` | R2 secret |
| `R2_BUCKET` | Bucket name |
| `CONTACT_URL` | Link or email for the AI notice |

If a stage needs a variable that is not defined, stop and ask for it in the PR (rule 8).
