FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Monorepo roots
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/mainapp/package.json ./apps/mainapp/package.json

# Install deps
RUN pnpm install --no-frozen-lockfile

# Copy app source
COPY apps/mainapp ./apps/mainapp

# Expose Vite dev port
WORKDIR /app/apps/mainapp
EXPOSE 3000

CMD ["pnpm", "run", "dev", "--host"]
