FROM oven/bun:1.3.14-alpine AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json vite.login.config.ts ./
COPY src ./src
RUN bun run build:login

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
