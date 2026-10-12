# CLAUDE.md — Artemis II bilingual site

Read this file in full before doing anything. Then read, in this order:

1. `docs/PLAN.md`: which stage we are on.
2. `docs/specs/README.md` and `docs/specs/product.md`: how specs work and what the site must do.
3. The spec of your stage, `docs/specs/stage-NN-*.md`: what you build and how it is accepted.
4. `docs/specs/design.md` and the Figma file, once Stage 01 is approved, for any visible change.
5. `PROMPT.md` (Hugo's original brief) for intent and tone.

## Workflow

This project is built by cloud agents, one stage at a time. The project owner (Hugo) approves each stage by merging its pull request. That merge does two things on its own:

1. Cloudflare Pages deploys `main` to production.
2. A Claude Code routine starts the next stage.

For that reason every stage must end in a PR that can be merged as is, with no hidden manual steps.

## Language of the project

Everything used to build the project is in English: Markdown docs, code, identifiers, file and folder names, branch names, PR titles, commit messages, and workflow terms ("stage", "pending", "in review", "approved"). Only the site's own content is bilingual (content collections, UI strings, localized URL slugs, alt text).

## Documentation language

All Markdown files in this repo (`CLAUDE.md`, `PROMPT.md`, everything in `docs/`, `CURATION.md`, any new `.md`) are written in **English only**. They are the single source of truth. Never create Spanish or bilingual copies of Markdown files. This applies to documentation, not to the site's bilingual content (content collections, UI strings).

## Spec-driven development

The approved spec is the contract. Details in `docs/specs/README.md`; the essentials:

- **Build only what the stage spec says.** Every acceptance criterion must be met; nothing outside the scope is added.
- **Spec one stage ahead.** At the end of stage N, write `docs/specs/stage-(N+1)-*.md` from `_template.md`, based on `PLAN.md` and `product.md`. It is approved when Hugo merges the PR. Writing the next spec is the only work on a future stage that is allowed.
- **Amend, don't drift.** If the spec turns out to be wrong or incomplete, change it in the same PR and list the change under "Spec changes". Never build something different without saying so.
- **Trace requirements.** Refer to requirement IDs (`GAL-05`, `PREF-02`…) in specs, test names and PRs. New or changed requirements go in `product.md`, called out in the PR.
- **Prove it.** From Stage 02 on, every acceptance criterion that can be automated has a Playwright test (`npm run test`), named after its criterion. The rest are listed in the PR as a manual checklist for Hugo.

## Design rules

- The approved Figma file (`FIGMA_FILE_URL`) and `docs/specs/design.md` define the look of the site. Implement against them; use the Figma connector to read frames and variables.
- Design tokens are Figma variables and CSS variables with the same names (`design.md` keeps the mapping). No hard-coded colors, spacing or font sizes in components.
- Edit the Figma file only through the connector's `use_figma` tool, and only the file in `FIGMA_FILE_URL`. Do not create new Figma files: one file, `FIGMA_FILE_URL`, holds the whole design. Inside that file you may create pages only in two cases: `Exploration` (alternatives compared before one is chosen) and `Archive` (rejected options). The approved pages are `Foundations`, `Components` and `Screens`; any change to them is listed under "Spec changes" in the PR. Do not use tools that spend Figma AI credits (`generate_image`, `weave_*`), do not touch Hugo's account library (shaders, generative plugins), and do not upload NASA images to Figma (use placeholders).
- If implementation needs a design change, update the Figma file and `design.md` in the same PR and list it under "Spec changes", with links to the changed frames.
- In "What to review", link each changed page to its Figma frame so Hugo can compare side by side.

## Rules for each stage

1. **One stage per session and per PR.** Take only the next pending stage in `docs/PLAN.md`. Do not get ahead on future stages, except for writing the next stage's spec.
2. **Never push to `main`.** Work on a branch whose name starts with `claude/` and open a PR against `main`. If the session does not assign a branch name, use `claude/stage-NN-short-name`. Do not rely on the exact branch name anywhere: tooling matches the `claude/` prefix only.
3. **If a stage PR is already open (any open PR from a `claude/` branch), do not start another.** Finish with no changes and explain why in the session summary.
4. **Before opening the PR:**
   - Run `npm run build`, and `npm run check` and `npm run test` once they exist, and make sure they pass.
   - Check every acceptance criterion of the stage spec and mark it in the PR.
   - Write the next stage's spec.
   - Update `docs/PLAN.md`: mark the stage as `in review`, link the PR, and note what is pending or changed.
5. **PR format**, in English, following `.github/pull_request_template.md`:
   - Title: `Stage NN: <name>`.
   - What was done, in short bullets.
   - Acceptance criteria: every criterion of the stage spec, checked, with how it was verified (test name or manual).
   - What to review: the concrete list of things Hugo must check in the Cloudflare preview (pages, what to look for, and the matching Figma frame).
   - Spec changes: amendments to this stage's spec, `product.md` or the design, or "None".
   - Next stage spec: link to it and a one-line summary.
   - Decisions made and why.
   - Sources consulted, if the stage includes data or text.
   - Pending items or risks.
6. **Review stages** (marked 🔍 for content and 🎨 for design in the plan): the PR contains only what is under review (lists, texts, sources, or the Figma design and `design.md`), not yet integrated into the site. Hugo approves by merging or asks for changes in comments.
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
- Package manager: npm, with `package-lock.json` in the repo. `build`, `check` and `test` scripts in `package.json` (CI uses them).
- Content collections with Zod schemas for photos, stories, chapters and sources.
- Media served from our own storage via `MEDIA_BASE_URL`. Never hotlink images on NASA servers (only "view original" links).
- Heavy images and binaries stay out of the repo: they go to R2. The repo only keeps metadata and, at most, very light thumbnails.
- Secrets only in environment variables. Never write keys, tokens or private endpoints in repo files, commits or PRs.
- `localStorage` always inside try/catch.
- Acceptance tests with Playwright against the static build; CI runs `check`, `build` and `test`.
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
| `FIGMA_FILE_URL` | URL of the project's Figma design file (not a secret) |

If a stage needs a variable that is not defined, stop and ask for it in the PR (rule 8).
