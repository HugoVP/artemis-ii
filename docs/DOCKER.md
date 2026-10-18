# Docker

Docker gives every person and every agent the same environment: Node.js 22, the project's locked dependencies and the Chromium that matches the locked `@playwright/test`. It is a development and test tool. **Production does not run in Docker**: the site is static and Cloudflare Pages serves the build (`docs/DELIVERY.md`).

The files need the project from Stage 02 on (`package.json` and `package-lock.json`).

## Files

| File | What it is |
| --- | --- |
| `Dockerfile` | Multi-stage build with the targets below |
| `compose.yaml` | Shortcuts for the common tasks |
| `.dockerignore` | Keeps `node_modules`, builds, `.git` and `.env` files out of the image |
| `.devcontainer/devcontainer.json` | Dev container for VS Code and GitHub Codespaces, built from the `tools` target |

## Targets

| Target | Contains | Used for |
| --- | --- | --- |
| `deps` | Node 22 and `npm ci` from the lockfile | Base of the others |
| `dev` | `deps` and the Astro dev server on port 4321 | Working on the site with hot reload |
| `tools` | `deps` and Playwright's Chromium with its system libraries | Dev container; base of `test` |
| `test` | `tools` and a copy of the source | `npm run check` and `npm run test`, as CI runs them |
| `agent-runner` | `tools`, the pinned Codex and Claude Code CLIs, and bubblewrap and socat for Claude Code's sandbox | The `agent-run` workflow (`docs/agents/adding-an-agent.md`); built and published by its own workflow |
| `build` | `deps`, the source and `npm run build` | The static build in `/app/dist` |
| `preview` | nginx serving the build on port 80 | Looking at the build as a static host serves it |

## Common tasks

```sh
docker compose up dev                 # dev server on http://localhost:4321
docker compose run --rm --build test   # checks, build and Playwright tests
docker compose --profile preview up --build preview   # the build on http://localhost:8080
```

Without compose: `docker build --target test -t artemis:test . && docker run --rm --ipc=host artemis:test`.

`test` and `preview` copy the source into the image, so `--build` makes them use the current files. `dev` mounts the working tree and runs `npm ci` at every start, so a lockfile change is picked up without removing the `node_modules` volume.

## Configuration

- **Environment:** only the variables of `AGENTS.md` are meant for these containers. `MEDIA_BASE_URL` defaults to `/media` (the preview layout); `dev` passes both through only when they are set, without defaults, so a `.env` file still applies; `preview` takes them at build time. `CONTACT_URL` is also passed to the `preview` build, because the About page bakes it into the HTML. In the dev container, put these values in a `.env` file in the workspace: the container does not copy variables from the host, so an unset host variable can never override the file. Never put Cloudflare, R2, Notion, Linear or model API keys in an image or in `compose.yaml`; images can be shared, and build arguments stay in their history.
- **Base images:** `NODE_IMAGE` and `NGINX_IMAGE` are build arguments, so a registry mirror can replace Docker Hub when it rate-limits pulls, for example `NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim docker compose build`.
- **Shared memory:** Chromium needs more than Docker's default, so `test` uses `ipc: host` and the dev container passes `--ipc=host`.
- **Base image versions:** `node:22-bookworm-slim` follows the latest Node 22 release (the project needs 22.22.0 or later). Pinning by digest is a later hardening step, together with Dependabot for Docker in Stage 03.

## Dev container and Codespaces

Open the repository in VS Code with the Dev Containers extension, or create a GitHub Codespace: both build the `tools` target, run `npm ci` and forward port 4321. Then `npm run dev`, `npm run check` and `npm run test` work as on a local machine with the right versions.

## The agent runner

The `agent-runner` target is the image in which the pipeline runs an agent: the CI toolchain plus the pinned agent CLIs. It is not meant to be run by hand, because it needs a model key and a workspace prepared by `agent-run.yml`, which starts it with `docker run` as the runner's user, without the Docker socket and with `.git` read-only. The `agent-runner-image` workflow builds it on `main` and publishes it to GitHub Container Registry; the run pins it by digest. Details: `docs/agents/adding-an-agent.md`.
