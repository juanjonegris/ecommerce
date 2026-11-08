---
paths:
  - '/package.json'
  - 'apps/*/package.json'
  - 'packages/*/package.json'
  - 'packages/*/tsconfig.json'
  - 'apps/*/tsconfig*.json'
  - 'turbo.json'
  - '.github/**'
  - '**/Dockerfile'
  - 'docker-compose*.yml'
  - '.env*.example'
  - 'apps/web/next.config.ts'
---

# Build, CI, and Docker

## Workspace build flow

- `@repo/types` ships compiled CJS in `packages/types/dist/`; Node 22's runtime TS loader cannot resolve its extensionless imports from source.
  - API runtime and web app resolve it via `package.json` `exports` → `dist/`.
  - API typecheck uses a `paths` override in `apps/api/tsconfig.json` → `src/`.
  - Jest uses `moduleNameMapper` in `apps/api/package.json` → `src/`.
- Turbo's `^build` dependency on `build`, `dev`, `lint`, `typecheck`, `test` builds it first. That is why tasks go through root `pnpm <task>` / `pnpm dev --filter <pkg>`, not `pnpm --filter <pkg> <task>`.
- A new shared package mirrors `packages/types`: `main`/`types`/`exports` → `dist/`, `build: tsc`, `files: ["dist"]`, CommonJS + `declaration: true` tsconfig.

## Environment variables

A new env var must be added in all of: `apps/api/src/config/configuration.ts` (zod, with a default), `.env.example`, `.env.production.example`, the `env` arrays of every relevant task in `turbo.json`, and the `.env` write steps in `.github/workflows/ci.yml` if CI needs it. Provider keys default to empty so the stub adapters run.

## CI (`.github/workflows/ci.yml`)

Five required jobs: `lint`, `typecheck`, `test`, `e2e`, `build`. `test` and `e2e` use `postgres:16-alpine` + `redis:7-alpine` services and run `prisma:generate` → `prisma:deploy` → `db:seed`. Never `migrate dev` in CI. No secrets are required; optional provider secrets are listed in `README.md`.

## Production images

- `apps/api/Dockerfile` and `apps/web/Dockerfile` use `turbo prune --docker` and `node:20-alpine` runners.
- The API builder stage sets a dummy `DATABASE_URL` so `prisma generate` can load `prisma.config.ts`; it is never connected to.
- The web image depends on `output: 'standalone'` **and** `outputFileTracingRoot` in `apps/web/next.config.ts`; removing either makes the container crash with module-not-found for `@repo/types`.
- `docker-compose.prod.yml` uses project name `ecommerce-prod`, `_prod` volumes, a one-shot `migrate` service (`prisma migrate deploy`) that `api` waits on, and binds only ports 3000/3001.
