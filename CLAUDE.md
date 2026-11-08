# CLAUDE.md

White-label e-commerce platform: a NestJS REST API (`apps/api`) and a Next.js app holding both the storefront and the admin dashboard (`apps/web`), in a pnpm + Turborepo monorepo. Solo developer working with AI agents. **Fork-per-client, not multi-tenant**: each client is a fork + its own deployment, so there is no `tenantId` anywhere. Product scope: `.agents/PRD.md`; architecture background: `mvp-tool-designs.md`.

Stack: TypeScript 5.9 (strict) · NestJS 11 · Prisma 7 + PostgreSQL 16 · Redis 7 + BullMQ · Socket.io · Next.js 16 + React 19.2 · Tailwind v4 + shadcn · next-intl · Jest · Playwright.

## Working principles

- **Ask instead of guessing.** If requirements, data shape, or a convention is unclear, stop and ask before writing code.
- **One feature at a time.** Start the next feature only after the current one passes end-to-end verification (see "Done means" at the bottom).
- **No drive-by refactors.** While implementing feature A, don't also refactor feature B. Note it and propose it separately.

## Hard constraints

1. **No `any`, and no escape hatches for type errors** — no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `// TODO: fix type` to get past a type problem. Fix the type. ESLint (`--max-warnings=0`) is the source of truth for style: explicit return types, `import type`, import order.
2. **Layers in `apps/api`: Controller → Service → Repository.** Services never inject `PrismaService`; controllers never hold business logic.
3. **Validate at boundaries.** Every DTO field has a `class-validator` decorator **and** `@ApiProperty`. Server Actions validate input with Zod.
4. **Shared types only via `@repo/types`.** Never import across apps with relative paths; never put decorators in `packages/types`.
5. **Run tasks through turbo**: `pnpm <task>` or `pnpm dev --filter @repo/api`. Never `pnpm --filter <pkg> dev|build|lint|typecheck` — it skips the `@repo/types` build and crashes with `ERR_MODULE_NOT_FOUND` (a hook warns).
6. **Never run `prisma migrate dev`** (a hook blocks it). Use the `schema-migration` skill.
7. **Every external service sits behind a port with a stub adapter.** The API must boot and pass CI with all provider keys empty.
8. **Server Components by default** in `apps/web`; `'use client'` only for hooks, events, or browser APIs.
9. **Check existing `package.json` files before adding a dependency.** New deps must be open source or have a meaningful free tier.
10. **Log every mutation** with a dot-namespaced event and `requestId`; never log secrets.

## Map

```
apps/api/                 NestJS API (port 3001, Swagger at /docs)
  src/main.ts             bootstrap: helmet, CORS, global ValidationPipe, filter, interceptor, rawBody
  src/app.module.ts       module registry — every domain module is imported here
  src/modules/<domain>/   one folder per domain; products/ is the canonical reference
  src/config/             env schema (zod) — provider keys default to '' → stub mode
  src/common/             guards, decorators, exception filter, logging interceptor
  src/prisma/             PrismaService (global)
  src/queues/, src/mail/  BullMQ email queue, MailService port (Resend / stub)
  prisma/                 schema.prisma, migrations/, seed.ts
  test/factories/         createMock<Entity>() test-data factories
apps/web/                 Next.js app (port 3000)
  src/app/[locale]/       all pages (storefront + admin/) under the locale segment
  src/app/actions/        Server Actions (mutations); admin/ for dashboard actions
  src/lib/                api.ts (storefront reads), admin/api.ts (admin reads), auth.ts
  src/config/brand.ts     white-label fork point #1 (name, contact, locales)
  src/app/globals.css     white-label fork point #2 (theme tokens)
  src/i18n/messages/      en.json + es.json
  e2e/                    Playwright: pages/ (page objects) + tests/
packages/types/           @repo/types — shared interfaces + Zod, built to dist/ (CJS)
packages/eslint-config/   shared ESLint flat configs (the enforced style rules)
packages/tsconfig/        tsconfig presets
.claude/                  rules/ (auto-loaded by path), skills/, commands/, plans/, archive/ (history, not rules)
```

`apps/docs`, `packages/ui`, and `packages/typescript-config` are unused Turborepo starter leftovers — don't build on them.

## Where new code goes

| New thing                      | Where / how                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Backend domain or integration  | `new-api-module` skill (mirrors `products/`, or `payments/` for a provider port)                   |
| Endpoint on an existing domain | that module's controller → service → repository; DTO in its `dto/`                                 |
| Schema change                  | `schema-migration` skill                                                                           |
| Shared request/response shape  | `packages/types/src/<domain>.types.ts`, exported from `index.ts`                                   |
| Storefront / admin page        | `apps/web/src/app/[locale]/...` Server Component; reads via `src/lib/api.ts` or `lib/admin/api.ts` |
| UI mutation                    | Server Action in `apps/web/src/app/actions/`                                                       |
| UI primitive                   | `npx shadcn@latest add <name>` (from `apps/web`)                                                   |
| Background job                 | processor + queue service in the owning module (see `newsletter/`)                                 |

## Commands

```bash
docker compose up -d                       # Postgres, Redis, MinIO
pnpm install
pnpm dev                                   # everything (builds @repo/types first)
pnpm dev --filter @repo/api                # API only
pnpm lint && pnpm typecheck && pnpm test   # the core gates (all turbo-mediated)
pnpm --filter @repo/api test -- <pattern>  # one Jest spec (safe without turbo)
pnpm --filter @repo/api prisma:deploy      # apply migrations
pnpm --filter @repo/api db:seed            # demo data
pnpm --filter @repo/web test:e2e           # Playwright (needs api + web running, seeded DB)
```

## Area rules and skills

Path-scoped rules in `.claude/rules/` load automatically when you read or edit a matching file. When planning work in an area you haven't opened yet, read the matching rule first:

- `backend/nestjs-modules.md`, `backend/logging.md`, `backend/dtos-contracts.md`, `backend/testing.md` — `apps/api`
- `data/prisma.md` — schema, migrations, repositories
- `frontend/nextjs.md`, `frontend/e2e.md` — `apps/web`
- `infra/build-ci-docker.md` — package.json, turbo, CI, Dockerfiles, env vars

Skills: `new-api-module`, `schema-migration`, `rules-check-drift`, `prime-codebase`. Commands: `/planning`, `/execute`, `/validate`, `/commit`, `/check-ignore-comments`.

## Done means

A feature is done only when all of these hold — report which ones you ran and which you could not:

1. `/validate` passes (format, lint, typecheck, tests, build, rules drift check).
2. New services have unit tests built on `test/factories/`; new user-facing flows have or update a Playwright spec with `data-testid` selectors.
3. The feature works end to end in the running app (API via Swagger at `/docs`, UI in the browser).
4. No changes outside the feature's scope.
