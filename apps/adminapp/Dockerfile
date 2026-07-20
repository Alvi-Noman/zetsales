FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/adminapp/package.json ./apps/adminapp/package.json

RUN pnpm install --no-frozen-lockfile

COPY apps/adminapp ./apps/adminapp

WORKDIR /app/apps/adminapp

# Vite bakes VITE_* vars into the built JS at build time, not read at container runtime — so
# this has to come in as a build arg, not an environment: entry in docker-compose.yml.
ARG VITE_ADMIN_API_TOKEN
ENV VITE_ADMIN_API_TOKEN=$VITE_ADMIN_API_TOKEN
RUN pnpm run build

FROM nginx:1.27-alpine

COPY apps/adminapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/adminapp/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
