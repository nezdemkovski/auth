FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS install
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/login/package.json apps/login/package.json
COPY packages/auth-contracts/package.json packages/auth-contracts/package.json
COPY packages/auth-integration/package.json packages/auth-integration/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/reference-product/package.json apps/reference-product/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps ./apps
COPY --from=install /app/packages ./packages
COPY . .
RUN bun run build:login

FROM caddy:2.11.3-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794 AS runtime
RUN cp /usr/bin/caddy /usr/bin/caddy-unprivileged
COPY apps/login/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/login/dist /srv/login
CMD ["/usr/bin/caddy-unprivileged", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
EXPOSE 8080
