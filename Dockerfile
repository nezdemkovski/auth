FROM oven/bun:1.3.14-alpine AS install
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/hosted/package.json apps/hosted/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS production-install
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/hosted/package.json apps/hosted/package.json
COPY packages/client-shared/package.json packages/client-shared/package.json
RUN bun install --frozen-lockfile --production --omit optional --omit peer

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-install /app/node_modules ./node_modules
COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/src apps/server/src
COPY apps/admin/dist apps/admin/dist
COPY apps/hosted/dist apps/hosted/dist
USER bun
EXPOSE 3000
CMD ["bun", "apps/server/src/index.ts"]
