# Setup (Hugo, one time only)

With this, the project is ready to advance on its own, stage by stage, with your approval at each one.

## How it works

```
Routine starts a stage ─► the agent works in the cloud ─► opens a PR
        ▲                                                     │
        │                                     you review the Cloudflare preview
        │                                                     │
        └──── you merge the PR (your approval) ◄──────────────┘
                     │
                     └─► Cloudflare deploys main to production
```

- **Approve** = merge the PR.
- **Request changes** = comment on the PR. With Auto-fix on, the agent handles them on the same branch.
- **Pause the project** = turn off the routine with its switch.

## 1. GitHub

1. Create a private repo, for example `HugoVP/artemis-ii`.
2. Upload all the files in this folder to `main` (including `.github/`).
3. Install the Claude GitHub App on the repo: https://github.com/apps/claude
4. In **Settings → Rules → Rulesets**, create a rule for `main`:
   - Require a pull request before merging.
   - Require the `CI / build` check to pass.
   - Block force push and deletion.

## 2. Cloudflare

1. Create the account at https://dash.cloudflare.com
2. **R2:** create a bucket (for example, `artemis-ii-media`) and enable public access with an `r2.dev` subdomain or, better, a custom domain later.
3. **R2 token:** in R2 → Manage API tokens, create a token with read and write permission **only on that bucket**. Save the Access Key ID and the Secret.
4. **Pages:** Workers & Pages → Create → Pages → Connect to Git → choose the repo.
   - Framework preset: Astro
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables: `MEDIA_BASE_URL` and `CONTACT_URL`
   - With this, every PR gets a preview URL and every merge to `main` deploys production.

   The first build will fail until the project exists (Stage 02). That is normal.

## 3. Claude Code cloud environment

At claude.ai/code, create an environment called `artemis-ii`:

- **Network access:** Custom, with "Also include default list of common package managers" turned on, and these domains:
  - `eol.jsc.nasa.gov`
  - `pds-imaging.jpl.nasa.gov`
  - `www.nasa.gov`
  - `images.nasa.gov`
  - `images-api.nasa.gov`
  - `images-assets.nasa.gov`
  - `<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com`

  If a stage is blocked by a domain, the agent will say so in the PR and you add it here.
- **Environment variables:** `MEDIA_BASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `CONTACT_URL`, `FIGMA_FILE_URL`.
- **Setup script:**
  ```
  if [ -f package.json ]; then npm ci; fi
  ```

## 4. Figma

The design stage (Stage 01) is done in Figma and approved like any other stage.

1. Connect Figma in claude.ai → Settings → Connectors (sign in with the Figma account that owns the design).
2. In Figma, create an empty design file for the project, for example "Artemis II — site", in a team or project where your account can edit.
3. Copy the file URL and add it to the `artemis-ii` environment as `FIGMA_FILE_URL`.
4. In the routine, add the **Figma** connector (see `docs/ROUTINE.md`).

To review the design: open the file, check the Foundations, Components and Screens pages, and leave comments on the PR (or in Figma, mentioning them in the PR). Merging the PR approves the design.

## 5. The routine

Create it at claude.ai/code/routines with the configuration and prompt from `docs/ROUTINE.md`.

## 6. Start

1. In the routine, press **Run now**. This launches Stage 00 (the plan).
2. When the PR arrives, turn on **Auto-fix** from the session.
3. Review the plan, comment if you want changes, and merge when you like it.
4. From then on, each merge starts the next stage on its own.

## Keep in mind

- Routines are in preview and use up your usage limit, just like a normal session.
- A green status in the run list only means there was no infrastructure error. What counts is the PR and its preview.
- Everything the agents do on GitHub appears under your user.
- Anyone who uses that environment can see its variables. Keep the environment for this project only.
