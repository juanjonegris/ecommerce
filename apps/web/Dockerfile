# syntax=docker/dockerfile:1.7

# ---- Stage 1: base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---- Stage 2: pruner ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.7 prune @repo/web --docker

# ---- Stage 3: deps ----
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ---- Stage 4: builder ----
FROM base AS builder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./
# Topological build via turbo: @repo/types → @repo/web (next build)
RUN pnpm build
# Standalone trace doesn't auto-copy these — fold them into the standalone tree.
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

# ---- Stage 5: runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
USER node
EXPOSE 3000
# server.js lives at apps/web/server.js inside the standalone tree
# because outputFileTracingRoot is the monorepo root.
CMD ["node", "apps/web/server.js"]

LABEL org.opencontainers.image.title="ecommerce-web"
LABEL org.opencontainers.image.source="https://github.com/jjnegris/ecommerce"
