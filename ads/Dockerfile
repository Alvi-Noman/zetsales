FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Monorepo roots
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY ads/package.json ./ads/package.json

# Install deps
RUN pnpm install --no-frozen-lockfile

# Copy service source
COPY ads ./ads

# Build the service
WORKDIR /app/ads
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/server.js"]
