# syntax=docker/dockerfile:1
# Development and test images for the Artemis II site, built from the same lockfile as CI.
# Production is not served from Docker: the static build goes to Cloudflare Pages (docs/DELIVERY.md).
# Usage and targets: docs/DOCKER.md.

# Base images are build arguments so a registry mirror can be used (see docs/DOCKER.md).
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:1.29-alpine

# Dependencies, installed from package-lock.json only.
FROM ${NODE_IMAGE} AS deps
ENV ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Dev server with hot reload. Compose mounts the source over /app.
FROM deps AS dev
EXPOSE 4321
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Toolchain for checks and Playwright: the Chromium that matches the locked @playwright/test,
# with its system libraries. Also the base of the dev container (.devcontainer/).
FROM deps AS tools
# Fixed browser location: job containers of GitHub Actions run with another HOME, so the default
# ~/.cache/ms-playwright of this image would not be found there.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Git is not in the slim Node image; the dev container needs it for source control.
RUN apt-get update && apt-get install -y --no-install-recommends git jq \
 && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium

# Runs the same checks as CI on a copy of the source.
FROM tools AS test
COPY . .
CMD ["sh", "-c", "npm run check && npm run test"]

# Runner of the agent-run workflow (docs/MULTI-AGENT-PHASES.md, Phase 2): the CI toolchain plus the pinned agent CLIs.
# Built and published by the agent-runner-image workflow; the agent job pins the image by digest.
# agent-run.yml starts it with `docker run` as the runner's user (not root), with no added privileges and no Docker socket.
FROM tools AS agent-runner
ARG CODEX_VERSION=0.163.0
ARG CLAUDE_CODE_VERSION=2.1.302
ARG OPENCODE_VERSION=1.19.3
# The npm package is a loader; it pins the native binary as @github/copilot-linux-x64 at the same version.
ARG COPILOT_VERSION=1.0.92
# Antigravity CLI is a single binary outside npm. Google's install script follows a "latest" manifest; the image instead
# fetches this exact build and checks the sha512 that Google's manifest published for it on 2026-10-20.
ARG AGY_VERSION=1.4.3
ARG AGY_URL=https://storage.googleapis.com/antigravity-public/antigravity-cli/1.4.3-4577820882632704/linux-x64/cli_linux_x64.tar.gz
ARG AGY_SHA512=9b726b86280a56e8ffa84b3b3a1c00d19972833a1f6c0b21d85c5fc6e408af6492e4c61353cad9b500bee599af264c92cfc2ead1f5048ab9525328e1e4199c40
# bubblewrap and socat: the sandbox that Claude Code uses for shell commands on Linux.
# Codex uses the system CA store for its OpenAI HTTPS and WebSocket connections; the slim base
# removes ca-certificates after building Node, so the agent image must install it explicitly.
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap socat ca-certificates \
 && test -s /etc/ssl/certs/ca-certificates.crt \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g --no-audit --no-fund @openai/codex@${CODEX_VERSION} @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} opencode-ai@${OPENCODE_VERSION} \
    @github/copilot@${COPILOT_VERSION} \
 && test "$(opencode --version)" = "${OPENCODE_VERSION}" \
 && CI=true copilot --version | grep -qx "GitHub Copilot CLI ${COPILOT_VERSION}\."
# Root-owned launchers from the reviewed image; the agent cannot edit them or see runner folders.
COPY scripts/opencode-runner.ts /opt/artemis/opencode-runner.ts
COPY scripts/copilot-runner.ts /opt/artemis/copilot-runner.ts
# Node downloads (the slim base has no curl), sha512sum checks, and the root-owned binary is exposed as `agy`. The hash of
# the extracted binary is recorded so the next step can prove it was not replaced.
RUN node -e 'fetch(process.argv[1]).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }).then(b => require("fs").writeFileSync("/tmp/agy.tar.gz", Buffer.from(b)))' "$AGY_URL" \
 && echo "$AGY_SHA512  /tmp/agy.tar.gz" | sha512sum -c - \
 && mkdir -p /opt/agy && tar --no-same-owner -xzf /tmp/agy.tar.gz -C /opt/agy && rm /tmp/agy.tar.gz \
 && chmod 0755 /opt/agy/antigravity \
 && test "$(stat -c %U /opt/agy/antigravity)" = root \
 && ln -s /opt/agy/antigravity /usr/local/bin/agy \
 && sha512sum /opt/agy/antigravity > /opt/agy/antigravity.sha512
# The CLI starts a background updater that cannot be turned off (checked on 1.4.3). Without network it cannot fetch a
# newer build while the image is built; the version check runs in a throwaway home and the binary hash is checked again.
RUN --network=none test "$(HOME=$(mktemp -d) CI=true agy --version)" = "${AGY_VERSION}" \
 && sha512sum -c /opt/agy/antigravity.sha512
COPY scripts/antigravity-runner.ts /opt/artemis/antigravity-runner.ts

# Static build. MEDIA_BASE_URL defaults to the preview layout (media served from /media).
FROM deps AS build
ARG MEDIA_BASE_URL=/media
ENV MEDIA_BASE_URL=${MEDIA_BASE_URL}
# Link of the About page's contact button. Empty means the button points to its own section.
ARG CONTACT_URL=
ENV CONTACT_URL=${CONTACT_URL}
COPY . .
RUN npm run build

# Serves the build like a static host would.
FROM ${NGINX_IMAGE} AS preview
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
