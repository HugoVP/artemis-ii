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
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium

# Runs the same checks as CI on a copy of the source.
FROM tools AS test
COPY . .
CMD ["sh", "-c", "npm run check && npm run test"]

# Runner of the agent-run workflow (docs/MULTI-AGENT-PHASES.md, Phase 2): the CI toolchain plus the pinned agent CLI.
# Built and published by the agent-runner-image workflow; the agent job pins the image by digest.
# It runs as root inside a throwaway container: the container, not a user account, is the isolation.
FROM tools AS agent-runner
ARG CODEX_VERSION=0.163.0
RUN npm install -g --no-audit --no-fund @openai/codex@${CODEX_VERSION}

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
