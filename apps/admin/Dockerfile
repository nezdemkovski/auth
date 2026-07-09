FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS install
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/login/package.json apps/login/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps ./apps
COPY --from=install /app/packages ./packages
COPY . .
RUN bun run build:admin

FROM caddy:2.11.3-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794 AS runtime
RUN cp /usr/bin/caddy /usr/bin/caddy-unprivileged
COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/dist /srv/admin
ENTRYPOINT ["/usr/bin/caddy-unprivileged"]
EXPOSE 8080
