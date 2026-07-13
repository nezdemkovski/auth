FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.4 prune @nezdemkovski/auth-admin --docker

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS install
WORKDIR /app
COPY --from=prune /app/out/json/ ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build
WORKDIR /app
COPY --from=install /app/ ./
COPY --from=prune /app/turbo.json /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=prune /app/out/full/ ./
RUN bun run build:admin

FROM caddy:2.11.3-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794 AS runtime
RUN cp /usr/bin/caddy /usr/bin/caddy-unprivileged
COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/dist /srv/admin
CMD ["/usr/bin/caddy-unprivileged", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
EXPOSE 8080
