FROM oven/bun:1.3.14-alpine AS install
WORKDIR /app
COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile --production --omit optional --omit peer

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY apps/api/package.json apps/api/bun.lock ./
COPY apps/api/src ./src
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
