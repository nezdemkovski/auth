FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.4 prune @nezdemkovski/auth-api --docker

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS install
WORKDIR /app
COPY --from=prune /app/out/json/ ./
RUN bun install --frozen-lockfile --production --omit optional --omit peer

FROM install AS build
COPY --from=prune /app/out/full/ ./
RUN bun build packages/auth-contracts/src/index.ts --outdir packages/auth-contracts/dist --target browser --packages external
RUN bun build packages/foundation/platform-crypto/src/index.ts --outdir packages/foundation/platform-crypto/dist --target bun --packages external
RUN bun build packages/foundation/platform-database/src/index.ts --outdir packages/foundation/platform-database/dist --target bun --packages external
RUN bun build packages/domains/delivery/src/index.ts --outdir packages/domains/delivery/dist --target bun --packages external
RUN bun build packages/domains/observability/src/index.ts --outdir packages/domains/observability/dist --target bun --packages external
RUN bun build packages/domains/storage/src/index.ts --outdir packages/domains/storage/dist --target bun --packages external
RUN bun build packages/domains/billing/src/index.ts --outdir packages/domains/billing/dist --target bun --packages external

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=install /app/packages/foundation/platform-database/node_modules ./packages/foundation/platform-database/node_modules
COPY --from=install /app/packages/domains/delivery/node_modules ./packages/domains/delivery/node_modules
COPY --from=install /app/packages/domains/observability/node_modules ./packages/domains/observability/node_modules
COPY --from=install /app/packages/domains/storage/node_modules ./packages/domains/storage/node_modules
COPY --from=install /app/packages/domains/billing/node_modules ./packages/domains/billing/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/packages/auth-contracts/package.json ./packages/auth-contracts/package.json
COPY --from=build /app/packages/auth-contracts/dist ./packages/auth-contracts/dist
COPY --from=build /app/packages/domains/delivery/package.json ./packages/domains/delivery/package.json
COPY --from=build /app/packages/domains/delivery/dist ./packages/domains/delivery/dist
COPY --from=build /app/packages/foundation/platform-database/package.json ./packages/foundation/platform-database/package.json
COPY --from=build /app/packages/foundation/platform-database/dist ./packages/foundation/platform-database/dist
COPY --from=build /app/packages/foundation/platform-crypto/package.json ./packages/foundation/platform-crypto/package.json
COPY --from=build /app/packages/foundation/platform-crypto/dist ./packages/foundation/platform-crypto/dist
COPY --from=build /app/packages/domains/observability/package.json ./packages/domains/observability/package.json
COPY --from=build /app/packages/domains/observability/dist ./packages/domains/observability/dist
COPY --from=build /app/packages/domains/storage/package.json ./packages/domains/storage/package.json
COPY --from=build /app/packages/domains/storage/dist ./packages/domains/storage/dist
COPY --from=build /app/packages/domains/billing/package.json ./packages/domains/billing/package.json
COPY --from=build /app/packages/domains/billing/dist ./packages/domains/billing/dist
WORKDIR /app/apps/api
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
