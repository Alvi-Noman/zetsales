FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/mainapp/package.json ./apps/mainapp/package.json

RUN pnpm install --no-frozen-lockfile

COPY apps/mainapp ./apps/mainapp

WORKDIR /app/apps/mainapp
RUN pnpm run build

FROM nginx:1.27-alpine

COPY apps/mainapp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mainapp/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
