FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Monorepo roots
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY services/messaging-service/package.json ./services/messaging-service/package.json

# Install deps
RUN pnpm install --no-frozen-lockfile

# Copy service source
COPY services/messaging-service ./services/messaging-service

# Build the service
WORKDIR /app/services/messaging-service
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "dist/server.js"]
