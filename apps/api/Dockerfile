# syntax=docker/dockerfile:1.7

# ---- Stage 1: base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---- Stage 2: pruner (carve out just @repo/api + its deps) ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.7 prune @repo/api --docker

# ---- Stage 3: deps (install lockfile-pinned deps only) ----
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ---- Stage 4: builder ----
FROM base AS builder
# `prisma generate` evaluates apps/api/prisma.config.ts which requires
# DATABASE_URL to be set (but never connects). Provide a dummy value.
ENV DATABASE_URL="postgresql://stub:stub@stub:5432/stub"
ENV NODE_ENV=production
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./
# Topological build via turbo: @repo/types → @repo/api
RUN pnpm build
# Generate Prisma client directly (bypass dotenv-cli wrapper)
RUN cd apps/api && pnpm exec prisma generate
# Produce a flat production node_modules tree for the runner
RUN pnpm deploy --filter=@repo/api --prod /prod/api
# Carry compiled api dist + prisma assets into the deploy tree
RUN cp -r apps/api/dist /prod/api/dist \
 && cp -r apps/api/prisma /prod/api/prisma

# ---- Stage 5: runner ----
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder --chown=node:node /prod/api ./
USER node
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]

LABEL org.opencontainers.image.title="ecommerce-api"
LABEL org.opencontainers.image.source="https://github.com/jjnegris/ecommerce"
