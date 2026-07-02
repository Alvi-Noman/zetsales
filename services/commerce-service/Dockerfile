FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Monorepo roots
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY services/commerce-service/package.json ./services/commerce-service/package.json

# Install deps
RUN pnpm install --no-frozen-lockfile

# Copy service source
COPY services/commerce-service ./services/commerce-service

# Build the service
WORKDIR /app/services/commerce-service
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/server.js"]
