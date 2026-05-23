FROM oven/bun:1.3.14-alpine AS install
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/login/package.json apps/login/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps ./apps
COPY --from=install /app/packages ./packages
COPY . .
RUN bun run build:login

FROM caddy:2.11.3-alpine AS runtime
COPY apps/login/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/login/dist /srv/login
EXPOSE 8080
