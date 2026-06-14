# Feature: production-docker-images

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Add production-grade, multi-stage `Dockerfile`s for `apps/api` (NestJS) and `apps/web` (Next.js 16), plus a `docker-compose.prod.yml` that orchestrates the two app images alongside Postgres, Redis, and MinIO. Source: setup-guide §14. Outcome: the entire stack is reproducibly buildable and bootable from a fresh clone with two commands. This is the deploy-time foundation for the white-label fork-per-client model — each fork ships as a pair of images.

## User Story

As a developer maintaining the white-label fork-per-client platform
I want a reproducible production Docker image for the API and the web app, plus a compose file that wires them with the supporting infra
So that any fork can be built and run on a real server (or evaluated locally in "as-deployed" form) without per-machine setup, and so deploy-time issues (Prisma binaries, standalone tracing, ESM/CJS resolution) surface during build rather than during a customer demo.

## Problem Statement

Today only the local dev loop works: databases run in `docker-compose.yml`, but the apps run on the host via `pnpm dev`. There is no way to:

1. Hand someone a buildable production image.
2. Verify the apps actually boot against compiled output in a clean Linux environment.
3. Catch container-only issues (missing Prisma musl engine, broken Next.js trace, leaked .env, secret in image layer) before they hit a server.

## Solution Statement

Build two multi-stage Dockerfiles using `turbo prune --docker` to keep image input minimal, then `pnpm deploy --prod` (api) and Next.js `output: 'standalone'` (web) to produce slim runner stages. Wire them in a separate `docker-compose.prod.yml` that uses isolated volumes and project name so it coexists with the dev compose. Migrations are operator-run via `docker compose run`, not on container boot — there is no automatic rollback path and a startup migration race is the kind of bug §14 must not introduce.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/package.json` (lines 8-22) — Why: defines `start:prod` (`node dist/main`) and the prisma scripts that hardwire `dotenv -e ../../.env --`. The runner CMD reuses `node dist/main` directly (NOT `pnpm start:prod`, which would require dotenv-cli in the runner).
- `apps/api/prisma.config.ts` (lines 1-29) — Why: Prisma 7 reads the connection URL from this file, NOT from `schema.prisma`. The file throws `DATABASE_URL is not set` at evaluation. Builder stage must set `DATABASE_URL=postgresql://stub:stub@stub:5432/stub` before `prisma generate` (generate doesn't connect; the value is unused but presence is required).
- `apps/api/prisma/schema.prisma` (lines 5-7) — Why: `generator client` block currently has no `binaryTargets`. Default is `["native"]`. Inside `node:20-alpine` (musl), "native" resolves to `linux-musl-openssl-3.0.x` — adequate as long as we ALWAYS generate in the same alpine base used for the runner. Plan keeps every stage on `node:20-alpine` to avoid mismatched engines.
- `apps/web/next.config.ts` (lines 1-8) — Why: current config is the next-intl plugin only. Must add `output: 'standalone'` AND `outputFileTracingRoot: path.join(__dirname, '../../')`. Without the root, Next.js trace misses workspace deps and the runtime crashes with "module not found" inside the container.
- `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` — Why: Next.js 16 standalone semantics. Standalone folder structure mirrors monorepo paths when `outputFileTracingRoot` is set, so `server.js` lives at `apps/web/.next/standalone/apps/web/server.js`. The runner Dockerfile must `cp -r public .next/standalone/apps/web/` and `cp -r .next/static .next/standalone/apps/web/.next/` manually.
- `packages/types/package.json` (lines 6-16) — Why: `@repo/types` is a _built CJS package_ (`main: ./dist/index.js`, `files: ["dist"]`). CLAUDE.md §3 explains the runtime ESM-resolution constraint. Image builds MUST run `^build` topologically (via turbo) so types `dist/` exists before api/web compilation. `pnpm deploy --prod` then carries that dist over.
- `docker-compose.yml` (lines 1-54) — Why: existing dev infra. Postgres on host 5433, Redis on 6380, MinIO on 9000/9001. New prod compose MUST NOT bind these ports (use `expose` only) to allow dev + prod to coexist. Volume names also differ to avoid stomping dev data.
- `apps/api/src/config/configuration.ts` (lines 1-86) — Why: canonical list of env vars + their stub-mode defaults. Used to derive the env block in `docker-compose.prod.yml`. Empty `STRIPE_SECRET_KEY` / `RESEND_API_KEY` / `MAILCHIMP_API_KEY` / `KLAVIYO_API_KEY` / `S3_ACCESS_KEY` all fall back to stubs — preserve so first boot works without real keys.
- `turbo.json` (lines 5-24) — Why: `build` has `dependsOn: ["^build"]` so `pnpm build` topologically builds `@repo/types` first. Dockerfile MUST invoke `pnpm build` (root, turbo-mediated), not `pnpm --filter @repo/api build` (bypasses turbo, crashes with ERR_MODULE_NOT_FOUND).
- `.github/workflows/ci.yml` (lines 270-282) — Why: CI's e2e job already proves `pnpm --filter @repo/api start:prod` runs against compiled output. Image runner reuses the same `node dist/main` entrypoint but skips dotenv-cli (env comes from Docker).

### New Files to Create

- `apps/api/Dockerfile` — multi-stage NestJS production image.
- `apps/web/Dockerfile` — multi-stage Next.js standalone production image.
- `.dockerignore` (root) — exclude node_modules, .next, dist, .turbo, \*.log, .env, .git, coverage, playwright-report, test-results.
- `docker-compose.prod.yml` (root) — production stack: api + web + postgres + redis + minio with healthchecks and isolated volumes.
- `.env.production.example` (root) — committed template for production env vars (real `.env.production` stays gitignored).

### Files to Modify

- `apps/web/next.config.ts` — add `output: 'standalone'` and `outputFileTracingRoot` to the config passed to `withNextIntl(...)`.
- `apps/api/prisma/schema.prisma` — add `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to the `generator client` block as a belt-and-suspenders measure (even though we generate inside alpine, this makes generate-on-host-and-copy workflows possible later).
- `.gitignore` (root) — add `.env.production` (the actual file, never committed).
- `CLAUDE.md` — add §12 "Production images" pointing at the new Dockerfiles + compose file + operator workflow (build, migrate, seed, up, down).

### Patterns to Follow

- **Multi-stage with `turbo prune --docker`**: keep build context minimal per image. Stage 1 (deps) operates on `out/json` only; stage 2 (builder) operates on `out/full`. This is the canonical Turborepo Docker pattern and matches the wording in the §14 prompt.
- **Honor turbo dependency graph**: builder stage runs `pnpm install --frozen-lockfile` THEN `pnpm build` from root — turbo handles `^build` topologically so `@repo/types` compiles to `dist/` before `@repo/api` or `@repo/web` builds. Never call `pnpm --filter` directly for `build` (CLAUDE.md §10.11).
- **API runtime as pruned production tree**: builder runs `pnpm deploy --filter=@repo/api --prod /prod/api` to produce a flat `node_modules` ready to ship. Runner copies `/prod/api` verbatim — no pnpm in the runner image.
- **Web runtime as Next.js standalone**: builder produces `.next/standalone/` with traced `node_modules`. Runner copies standalone + `.next/static` + `public`. No pnpm, no Next.js CLI in the runner.
- **Slim alpine throughout**: `node:20-alpine` for deps, builder, AND runner. Avoids Prisma engine binary mismatch (alpine is musl; Debian-slim is glibc) and minimizes runner size. Distroless rejected: Prisma binary needs `libstdc++` and `openssl` which distroless lacks.
- **No `.env` in image**: `.dockerignore` excludes `.env*`. Runtime env comes from `docker-compose.prod.yml` `environment:` block + `env_file: .env.production`. Builder gets a dummy `DATABASE_URL` set via Dockerfile `ENV` so `prisma generate` succeeds without a host `.env`.
- **Healthchecks + depends_on**: api waits for postgres healthy + redis healthy; web waits for api healthy. Avoids the classic "app starts before DB is ready" race.
- **Non-root user**: runner stage adds `node` user (already present in `node:20-alpine`) and `USER node` before `CMD`. Defense-in-depth; no functional difference for the MVP.
- **Tag images with build args**: `ARG APP_VERSION` accepted at top of each Dockerfile; passed through to `LABEL org.opencontainers.image.version` for future registry tagging. Default value `dev` if unset.

---

## IMPLEMENTATION PLAN

### Phase 1: Source edits (prerequisites for the Dockerfiles to work)

These small repo edits unblock everything else. None are runtime-affecting for the dev loop.

1. `apps/web/next.config.ts` — enable standalone + set monorepo trace root.
2. `apps/api/prisma/schema.prisma` — add explicit `binaryTargets`.
3. `.gitignore` — add `.env.production`.

### Phase 2: Docker artifacts

4. Root `.dockerignore`.
5. `apps/api/Dockerfile` (4 stages: base → deps → builder → runner).
6. `apps/web/Dockerfile` (4 stages: base → deps → builder → runner).

### Phase 3: Compose + env

7. Root `docker-compose.prod.yml` — api, web, postgres, redis, minio + migrate one-shot.
8. Root `.env.production.example` — committed template.

### Phase 4: Validation + docs

9. Build, boot, smoke-test (curl + browser).
10. Document in `CLAUDE.md` §12 (operator workflow, ports, env, gotchas).

---

## STEP-BY-STEP TASKS

Execute every task in order. Each is atomic and independently testable.

### Task 1 — UPDATE `apps/web/next.config.ts`

- **IMPLEMENT**: Add `output: 'standalone'` and `outputFileTracingRoot` to `nextConfig` so Next.js 16's standalone build traces files from the monorepo root (otherwise workspace deps like `@repo/types` and next-intl message catalogs are NOT included and the runtime crashes with module-not-found).
- **PATTERN**: `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` §"Caveats" — exact monorepo pattern.
- **IMPORTS**: Add `import path from 'node:path';` at top.
- **GOTCHA**: This config is consumed by `next build` only — `next dev` ignores `output`. No dev-loop regression.
- **CODE SHAPE**:
  ```ts
  const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname, '../../'),
  };
  ```
- **VALIDATE**: `pnpm --filter @repo/web build` produces `apps/web/.next/standalone/apps/web/server.js` (note nested path — that's correct for a monorepo with `outputFileTracingRoot`).

### Task 2 — UPDATE `apps/api/prisma/schema.prisma`

- **IMPLEMENT**: Add `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to the `generator client` block.
- **PATTERN**: standard Prisma binary target naming. `linux-musl-openssl-3.0.x` matches `node:20-alpine` (musl + OpenSSL 3).
- **GOTCHA**: After this change, `prisma generate` must be re-run locally for the host artifact to keep working. Belt-and-suspenders even though every Dockerfile stage runs inside alpine — protects against a future "generate on macOS host, copy into alpine image" workflow.
- **CODE SHAPE**:
  ```prisma
  generator client {
    provider      = "prisma-client-js"
    binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
  }
  ```
- **VALIDATE**: `pnpm --filter @repo/api prisma:generate` succeeds and `apps/api/node_modules/.prisma/client/` contains both the host binary AND `query_engine-linux-musl-openssl-3.0.x.node`.

### Task 3 — UPDATE root `.gitignore`

- **IMPLEMENT**: Append `.env.production` on its own line (the example file `.env.production.example` IS committed).
- **VALIDATE**: `git check-ignore .env.production` returns 0.

### Task 4 — CREATE root `.dockerignore`

- **IMPLEMENT**: Exclude everything the Docker daemon shouldn't see to keep build context small and prevent secrets leaking into layers.
- **CONTENT** (one entry per line):
  ```
  **/node_modules
  **/.next
  **/dist
  **/.turbo
  **/coverage
  **/.git
  **/.gitignore
  **/.eslintcache
  **/.prettiercache
  **/playwright-report
  **/test-results
  **/*.log
  .env
  .env.*
  !.env.production.example
  .DS_Store
  Thumbs.db
  README.md
  CLAUDE.md
  PRD.md
  .github
  .claude
  ```
- **GOTCHA**: `!.env.production.example` UN-ignores the example template so it can be referenced if needed. The actual `.env.production` is excluded by the `.env.*` line above it.
- **VALIDATE**: After creating, `docker buildx build --no-cache -f apps/api/Dockerfile -t test-ctx-size .` and observe "transferring context" size < ~5MB.

### Task 5 — CREATE `apps/api/Dockerfile`

- **IMPLEMENT**: 4 stages — `base` (shared setup), `deps` (lockfile-only install), `builder` (full build + prisma generate + pnpm deploy), `runner` (slim runtime).
- **PATTERN**: turbo prune --docker pattern from Turborepo's official Docker guide; `pnpm deploy --prod` for flat runner node_modules.
- **GOTCHAS**:
  - `dotenv -e ../../.env --` in `prisma:generate` script will fail without an .env file. Bypass by running `pnpm exec prisma generate` directly (NOT via the `prisma:generate` script) with `DATABASE_URL=stub://build` set as a builder-stage `ENV`.
  - Prisma generate must run AFTER `pnpm build` (because the build emits `apps/api/dist/` referenced by nothing — but generate writes to `node_modules/.prisma/client/`). Order matters for `pnpm deploy` to include the generated client in the runner tree.
  - `pnpm deploy --filter=@repo/api --prod /prod/api` produces a flat node_modules. Must also copy `apps/api/prisma/` (schema + migrations) to the runner since Prisma client reads schema location at runtime.
  - Don't copy `apps/api/.env` (excluded by .dockerignore anyway).
- **CONTENT**:

  ```dockerfile
  # syntax=docker/dockerfile:1.7

  # ---- Stage 1: base ----
  FROM node:20-alpine AS base
  RUN apk add --no-cache libc6-compat openssl
  RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
  WORKDIR /app

  # ---- Stage 2: pruner (carve out just @repo/api + deps) ----
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
  ENV DATABASE_URL="postgresql://stub:stub@stub:5432/stub"
  ENV NODE_ENV=production
  COPY --from=deps /app/ ./
  COPY --from=pruner /app/out/full/ ./
  # Topological build via turbo (@repo/types first, then @repo/api)
  RUN pnpm build
  # Generate Prisma client (bypass dotenv-cli wrapper since no .env in container)
  RUN cd apps/api && pnpm exec prisma generate
  # Produce flat production node_modules for runner
  RUN pnpm deploy --filter=@repo/api --prod /prod/api
  # Carry over compiled api dist + prisma assets into the deploy tree
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
  ```

- **VALIDATE**: `docker build -f apps/api/Dockerfile -t ecommerce-api:dev .` succeeds. `docker images ecommerce-api:dev` reports size < 350MB (alpine + node_modules + prisma binary realistic target; 250MB is aspirational).

### Task 6 — CREATE `apps/web/Dockerfile`

- **IMPLEMENT**: 4 stages mirroring api, but runner copies the Next.js standalone output instead of a pnpm-deploy tree.
- **PATTERN**: `vercel/next.js/examples/with-docker` adapted for monorepo with `outputFileTracingRoot`.
- **GOTCHAS**:
  - Standalone server.js path is NESTED at `apps/web/.next/standalone/apps/web/server.js` because `outputFileTracingRoot` is the monorepo root. Runner WORKDIR must reflect this.
  - `.next/static` and `public/` are NOT auto-copied into standalone — must `cp -r` them manually in builder stage.
  - Next.js standalone server reads `HOSTNAME` env to choose bind interface. Must set `HOSTNAME=0.0.0.0` in runner or it defaults to `localhost` and container is unreachable.
  - `next-intl` plugin pulls i18n message files from `src/i18n/`. The trace should pick them up automatically since they're imported from app code, but verify after first build.
- **CONTENT**:

  ```dockerfile
  # syntax=docker/dockerfile:1.7

  FROM node:20-alpine AS base
  RUN apk add --no-cache libc6-compat
  RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
  WORKDIR /app

  FROM base AS pruner
  COPY . .
  RUN pnpm dlx turbo@2.9.7 prune @repo/web --docker

  FROM base AS deps
  COPY --from=pruner /app/out/json/ ./
  COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
  RUN pnpm install --frozen-lockfile

  FROM base AS builder
  ENV NODE_ENV=production
  ENV NEXT_TELEMETRY_DISABLED=1
  COPY --from=deps /app/ ./
  COPY --from=pruner /app/out/full/ ./
  # Build @repo/types first (turbo handles ^build), then next build
  RUN pnpm build
  # Standalone trace doesn't auto-copy these — do it now so they ride into runner
  RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
   && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  ENV NEXT_TELEMETRY_DISABLED=1
  ENV PORT=3000
  ENV HOSTNAME=0.0.0.0
  COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
  USER node
  EXPOSE 3000
  # WORKDIR after copy: standalone server.js is at /app/apps/web/server.js
  CMD ["node", "apps/web/server.js"]

  LABEL org.opencontainers.image.title="ecommerce-web"
  LABEL org.opencontainers.image.source="https://github.com/jjnegris/ecommerce"
  ```

- **VALIDATE**: `docker build -f apps/web/Dockerfile -t ecommerce-web:dev .` succeeds. `docker images ecommerce-web:dev` size < 250MB (standalone is genuinely lean).

### Task 7 — CREATE root `docker-compose.prod.yml`

- **IMPLEMENT**: Five services + one one-shot migrate runner. Postgres/Redis/MinIO do NOT bind to host (`expose` only) so dev compose can stay up. App ports DO bind (3000/3001) so the operator can curl from the host.
- **PATTERN**: standard docker-compose v3-style services with healthchecks; one-shot `migrate` service using `restart: "no"` + `depends_on: postgres healthy`.
- **GOTCHAS**:
  - The migrate one-shot uses the same `ecommerce-api` image but overrides CMD to run `pnpm exec prisma migrate deploy`. Since the runner image doesn't have pnpm, the override is `node node_modules/prisma/build/index.js migrate deploy` — OR we put a tiny shim. Cleanest: install `prisma` as a dependency (it already is, line 54 of apps/api/package.json), then CMD is `node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma`.
  - Set `DATABASE_URL` directly (no .env file fallback in the container — `prisma.config.ts` will pick it up from `process.env`).
  - Volume names use `_prod` suffix to NEVER conflict with dev volumes.
  - Operator must use `-p ecommerce-prod` flag (or `name:` top-level in compose) for project isolation.
- **CONTENT**:

  ```yaml
  name: ecommerce-prod

  services:
    postgres:
      image: postgres:16-alpine
      env_file: .env.production
      volumes:
        - postgres_prod_data:/var/lib/postgresql/data
      expose:
        - '5432'
      healthcheck:
        test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-ecommerce}']
        interval: 5s
        timeout: 5s
        retries: 10
      restart: unless-stopped

    redis:
      image: redis:7-alpine
      expose:
        - '6379'
      volumes:
        - redis_prod_data:/data
      healthcheck:
        test: ['CMD', 'redis-cli', 'ping']
        interval: 5s
        timeout: 3s
        retries: 10
      restart: unless-stopped

    minio:
      image: minio/minio:latest
      command: server /data --console-address ":9001"
      env_file: .env.production
      expose:
        - '9000'
        - '9001'
      volumes:
        - minio_prod_data:/data
      healthcheck:
        test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
        interval: 10s
        timeout: 5s
        retries: 10
      restart: unless-stopped

    migrate:
      build:
        context: .
        dockerfile: apps/api/Dockerfile
      image: ecommerce-api:latest
      env_file: .env.production
      depends_on:
        postgres:
          condition: service_healthy
      command: ['node_modules/.bin/prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma']
      restart: 'no'

    api:
      build:
        context: .
        dockerfile: apps/api/Dockerfile
      image: ecommerce-api:latest
      env_file: .env.production
      ports:
        - '3001:3001'
      depends_on:
        postgres:
          condition: service_healthy
        redis:
          condition: service_healthy
        migrate:
          condition: service_completed_successfully
      healthcheck:
        test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/health']
        interval: 10s
        timeout: 5s
        retries: 5
      restart: unless-stopped

    web:
      build:
        context: .
        dockerfile: apps/web/Dockerfile
      image: ecommerce-web:latest
      env_file: .env.production
      ports:
        - '3000:3000'
      depends_on:
        api:
          condition: service_healthy
      restart: unless-stopped

  volumes:
    postgres_prod_data:
    redis_prod_data:
    minio_prod_data:
  ```

- **GOTCHA on healthcheck**: alpine `node` image doesn't ship `curl` by default; `wget` is available in busybox. Used `wget -qO-` for the api healthcheck.
- **VALIDATE**: `docker compose -f docker-compose.prod.yml config` parses cleanly. `docker compose -f docker-compose.prod.yml build` builds all three image-based services (postgres/redis/minio pull from registry).

### Task 8 — CREATE root `.env.production.example`

- **IMPLEMENT**: Committed template. Operator copies to `.env.production` (gitignored) and fills real values.
- **CONTENT**: Same shape as the CI `.env` heredoc, but production-flavored. All provider keys empty by default so the stack boots in stub mode on first try.

  ```env
  # Copy this file to .env.production and fill values.
  # Empty provider keys = stub mode (safe for first boot).

  NODE_ENV=production

  # Postgres (the postgres service reads these to initialize)
  POSTGRES_USER=ecommerce
  POSTGRES_PASSWORD=change-me-in-real-deploy
  POSTGRES_DB=ecommerce

  # Connection URLs (point at compose service names, not localhost)
  DATABASE_URL=postgresql://ecommerce:change-me-in-real-deploy@postgres:5432/ecommerce
  REDIS_URL=redis://redis:6379

  # JWT — replace these in real deploys
  JWT_SECRET=change-me-32-char-minimum-in-real-deploy
  JWT_REFRESH_SECRET=change-me-32-char-minimum-in-real-deploy-too

  # Inter-service URLs (compose internal DNS)
  API_URL=http://api:3001
  PUBLIC_WEB_URL=http://localhost:3000
  CORS_ORIGINS=http://localhost:3000

  # Providers — leave empty for stub mode
  STRIPE_SECRET_KEY=
  STRIPE_WEBHOOK_SECRET=
  RESEND_API_KEY=
  MAILCHIMP_API_KEY=
  MAILCHIMP_AUDIENCE_ID=
  KLAVIYO_API_KEY=
  KLAVIYO_LIST_ID=

  # Object storage — MinIO defaults
  MINIO_ROOT_USER=minioadmin
  MINIO_ROOT_PASSWORD=minioadmin
  S3_ENDPOINT=http://minio:9000
  S3_ACCESS_KEY=
  S3_SECRET_KEY=
  S3_BUCKET=ecommerce-prod

  # Newsletter + Search
  NEWSLETTER_PROVIDER=stub
  SEARCH_PROVIDER=postgres-fts
  SEARCH_FTS_LANGUAGE=simple
  ```

- **VALIDATE**: `git status` shows `.env.production.example` as new (NOT `.env.production`).

### Task 9 — UPDATE `CLAUDE.md` with §12 "Production images"

- **IMPLEMENT**: Append a short section documenting the operator workflow.
- **CONTENT SKETCH**:

  ````markdown
  ## 12. Production images

  Two production Dockerfiles live in `apps/api/Dockerfile` and `apps/web/Dockerfile`. They use `turbo prune --docker` for minimal build context and ship slim runner stages.

  | Image           | Base             | Runner stage                                   | Approx size |
  | --------------- | ---------------- | ---------------------------------------------- | ----------- |
  | `ecommerce-api` | `node:20-alpine` | `pnpm deploy --prod` flat tree + Prisma client | ~300MB      |
  | `ecommerce-web` | `node:20-alpine` | Next.js `output: 'standalone'` traced bundle   | ~180MB      |

  **Operator workflow** (from a fresh clone):

  ```bash
  cp .env.production.example .env.production   # then edit secrets
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml up -d
  # First boot: the migrate one-shot runs prisma migrate deploy.
  # Optional seed for demo data:
  docker compose -f docker-compose.prod.yml run --rm api node_modules/.bin/ts-node prisma/seed.ts
  ```
  ````

  **Coexistence with dev compose**: prod uses project name `ecommerce-prod` (set in `docker-compose.prod.yml`) and `_prod`-suffixed volumes. DB/Redis/MinIO are NOT bound to host ports — only api (3001) and web (3000) are. Dev compose can stay running.

  **Why migrate is a one-shot, not on-boot**: there's no automatic rollback if a migration partially applies during a multi-replica rollout. Operator-run migrations keep that boundary explicit.

  **Stub mode preserved**: empty provider keys in `.env.production` cause `apps/api/src/config/configuration.ts` to fall back to stub adapters — same property as CI. First boot works without real Stripe/Resend/Mailchimp keys.

  ```

  ```

- **VALIDATE**: `pnpm format:check` accepts the new section.

### Task 10 — VALIDATE end-to-end

Sequential validation (each command depends on the previous):

```bash
# 1. Source edits compile cleanly
pnpm lint
pnpm typecheck

# 2. Local prisma generate produces both engine binaries
pnpm --filter @repo/api prisma:generate
ls apps/api/node_modules/.prisma/client/ | grep -E 'query_engine|libquery'

# 3. Web standalone build works
pnpm --filter @repo/web build
ls apps/web/.next/standalone/apps/web/server.js

# 4. Compose file is syntactically valid
docker compose -f docker-compose.prod.yml config > /dev/null

# 5. Build both images
docker compose -f docker-compose.prod.yml build

# 6. Inspect sizes
docker images ecommerce-api:latest ecommerce-web:latest

# 7. Prepare env + boot
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml up -d

# 8. Wait for healthy, then smoke
docker compose -f docker-compose.prod.yml ps     # api + web healthy
curl -sf http://localhost:3001/health            # 200 {"status":"ok"}
curl -sf http://localhost:3000/en/products | head -50   # SSR HTML, no error

# 9. Optional seed + storefront check in a browser
docker compose -f docker-compose.prod.yml run --rm api node_modules/.bin/ts-node prisma/seed.ts
# visit http://localhost:3000/en/products in a browser

# 10. Tear down
docker compose -f docker-compose.prod.yml down
```

---

## TESTING STRATEGY

### Unit Tests (Backend)

Not applicable — Dockerfiles and compose YAML have no unit tests. The implicit test is: does the image build, does the service boot, does `/health` return 200.

### E2E Tests (Frontend)

Not added by this section. The Playwright suite already exercises the storefront and admin against `pnpm dev`; running it against the compose stack is out of scope for §14. (Could be a future §14.5 — point Playwright `baseURL` at `http://localhost:3000` while the compose stack is up, but the §14 prompt does not ask for it.)

### Edge Cases — Verify Manually

- **Both compose stacks running simultaneously**: bring up dev compose (`docker compose up -d`) AND prod compose (`docker compose -f docker-compose.prod.yml up -d`). Both must stay healthy. Dev exposes 5433/6380/9000/9001 to host; prod exposes only 3000/3001. No port clash.
- **Cold build from fresh clone**: `git clone <fork-url> tmp-fork && cd tmp-fork && docker compose -f docker-compose.prod.yml build` succeeds without any host-side `pnpm install` or `prisma generate` first.
- **Provider keys absent**: with `.env.production` keeping all provider keys empty, hitting POST `/cart/checkout` (or similar) should route to the stub payment provider rather than crash. Verify api logs show `stub_payment_provider.charge_succeeded` instead of a Stripe 401.
- **Migrate idempotency**: run `docker compose -f docker-compose.prod.yml up -d` twice in a row. Second run's `migrate` service must exit 0 with "no pending migrations" — not error.
- **Image layer leak audit**: `docker history ecommerce-api:latest` MUST NOT show any layer containing `.env`, `JWT_SECRET=`, or `STRIPE_SECRET_KEY=`. Build-stage `ENV DATABASE_URL=stub://...` is acceptable (visible in builder, but builder is not the final image — the runner stage starts `FROM node:20-alpine` afresh).
- **Standalone trace completeness**: `docker run --rm ecommerce-web:latest node -e "require('fs').readdirSync('/app/apps/web/node_modules').slice(0,20)"` should list dependencies including `next`, `react`, `next-intl`. If `next-intl` is missing, the `outputFileTracingIncludes` config needs adjustment (add `src/i18n/**/*` to the global trace).

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm lint
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm typecheck
```

### Level 3: Prettier (added in §13 CI)

```bash
pnpm format:check
```

### Level 4: Unit Tests (regression check)

```bash
pnpm --filter @repo/api test
```

### Level 5: Docker build

```bash
docker compose -f docker-compose.prod.yml build
```

### Level 6: Boot + smoke

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml up -d
sleep 30   # wait for healthchecks
docker compose -f docker-compose.prod.yml ps
curl -sf http://localhost:3001/health
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/en/products
docker compose -f docker-compose.prod.yml down
```

### Level 7: Manual Validation

- Browser: open `http://localhost:3000/en/products`. Storefront renders seeded products (after running `db:seed` one-shot).
- Browser: open `http://localhost:3001/docs`. Swagger UI loads with the products module visible.
- Image sizes: `docker images | grep ecommerce`. Confirm both < 350MB (target).

---

## ACCEPTANCE CRITERIA

- [ ] `apps/api/Dockerfile` and `apps/web/Dockerfile` exist and are 4-stage multi-stage builds using `turbo prune --docker`.
- [ ] Root `.dockerignore` exists and excludes `.env*` (except `.env.production.example`).
- [ ] `docker-compose.prod.yml` orchestrates api + web + postgres + redis + minio + migrate one-shot with healthchecks and isolated `_prod` volumes.
- [ ] `apps/web/next.config.ts` has `output: 'standalone'` AND `outputFileTracingRoot: path.join(__dirname, '../../')`.
- [ ] `apps/api/prisma/schema.prisma` has `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`.
- [ ] `.env.production.example` is committed; `.env.production` is gitignored.
- [ ] `pnpm lint && pnpm typecheck` still pass (no regression from source edits).
- [ ] `docker compose -f docker-compose.prod.yml build` succeeds from a clean state.
- [ ] `docker compose -f docker-compose.prod.yml up -d` brings api/web to healthy state.
- [ ] `curl http://localhost:3001/health` returns 200.
- [ ] `curl http://localhost:3000/en/products` returns 200 with rendered HTML.
- [ ] CLAUDE.md §12 documents operator workflow, port mapping, coexistence with dev compose, and stub-mode preservation.

---

## NOTES

### Design decisions resolved

- **alpine vs slim** → **alpine throughout**. Smaller, and we control the Prisma binary target via `binaryTargets = ["linux-musl-openssl-3.0.x"]`. Slim would add ~60MB per image and force a different binary target.
- **migrations on boot vs one-shot** → **one-shot service**. Boot-time migrations have no rollback path; the one-shot service with `restart: "no"` + `service_completed_successfully` dependency makes the order deterministic and the failure mode loud.
- **shared vs separate DB volumes** → **separate**, suffixed `_prod`. Dev compose owns `postgres_data` (no suffix). Prod owns `postgres_prod_data`. Operator can run both simultaneously without data corruption.
- **DB/Redis port binding** → **expose only, no host bind**. Dev compose already binds 5433/6380/9000/9001. Prod must not clash. Web (3000) and api (3001) bind to host because the operator needs to curl them; everything else is internal.
- **Seed in compose** → **NOT automatic**. Documented as a `docker compose run --rm api node_modules/.bin/ts-node prisma/seed.ts` one-shot. Auto-seeding production-flavored compose is a footgun.

### Open risks (flag during execute)

- Prisma 7 + `@prisma/adapter-pg` might require additional engine flags inside alpine. If runtime throws `PrismaClientInitializationError`, fall back to `prisma-client` (Prisma 7's new generator) or pin a specific engine type. Pre-check `apps/api/node_modules/.prisma/client/` after generate to confirm `.so.node` binary presence.
- Next.js 16 standalone monorepo trace occasionally misses transitive `next-intl` message files. If web container fails with "missing locale messages", add `outputFileTracingIncludes` global include for `apps/web/src/i18n/**/*` (referenced in the standalone docs and called out in Task 6 gotchas).
- `pnpm deploy --filter=@repo/api --prod` requires pnpm 9+ which the base layer installs via corepack. Verify `corepack prepare pnpm@9.0.0 --activate` succeeds on the alpine runner (it does, but pinning to exact version 9.0.0 matches `package.json` `packageManager`).

### Out of scope (per the §14 prompt)

- Pushing images to a registry (GHCR, Docker Hub).
- Cloud deploy targets (Fly.io, Railway, Render, K8s manifests).
- Secret management (Vault, SOPS, Doppler).
- Multi-arch builds (`buildx` for arm64). Local dev on x86_64 only for now.
- Production observability (OpenTelemetry, GlitchTip) — those are §15+ in the guide.

**Confidence Score**: **7.5/10** for one-pass success.

Confidence is below 9 because three things have non-trivial first-try failure modes: (1) Prisma 7 + alpine binary target — if the runtime can't find the musl engine, the api container will crash on first query (not on boot); (2) Next.js 16 standalone trace in a monorepo with next-intl — if a message catalog is missed, the storefront 500s on a localized route; (3) the migrate one-shot must exit cleanly even when there are no pending migrations — verify on a second `up -d`. Each has a documented recovery in this plan, so a fix-forward iteration is bounded.
