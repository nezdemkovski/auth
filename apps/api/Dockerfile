FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/login/package.json apps/login/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile --production --omit optional --omit peer

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/src ./apps/api/src
WORKDIR /app/apps/api
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
