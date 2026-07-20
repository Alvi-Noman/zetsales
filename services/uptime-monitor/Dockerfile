FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Same approach as commerce-service's Alibaba importer: Playwright's own bundled Chromium needs
# glibc, so we use Alpine's system Chromium instead and skip Playwright's own download.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium-browser

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY services/uptime-monitor/package.json ./services/uptime-monitor/package.json

RUN pnpm install --no-frozen-lockfile

COPY services/uptime-monitor ./services/uptime-monitor

WORKDIR /app/services/uptime-monitor
RUN pnpm build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
