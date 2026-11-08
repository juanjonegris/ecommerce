---
name: new-api-module
description: Scaffold a new NestJS domain module in apps/api by mirroring the products module (or payments for an external service behind a provider port). Use when adding a new backend domain, a new provider-backed integration, or a new set of REST endpoints that needs its own module.
argument-hint: '<domain-name> [plain|provider-port]'
---

# New API module: `$ARGUMENTS`

Build one module, end to end, then stop. Do not touch other modules except to register this one and to consume their exported services.

## 1. Read before writing

- Every file in `apps/api/src/modules/products/` (plain modules) — or `apps/api/src/modules/payments/` (provider-port: external service, stub fallback).
- `.claude/rules/backend/*.md` and `.claude/rules/data/prisma.md`.
- The shared types for the domain in `packages/types/src/` (create them first if missing).
- If anything about the domain's data model, endpoints, or auth is unclear, **ask** before scaffolding.

## 2. Scaffold (in this order)

1. **Shared types** — `packages/types/src/<domain>.types.ts`, export from `src/index.ts`.
2. **Schema** — if the module owns tables, run the `schema-migration` skill first.
3. **Entity** — `entities/<domain>.entity.ts`.
4. **DTOs** — `create-`, `update-`, `<domain>-response.dto.ts` (+ `find-<domain>-query.dto.ts` for lists).
5. **Repository** — Prisma queries + row → entity mapping.
6. **Provider port** (provider-port only) — `providers/<domain>-provider.interface.ts` (interface + DI token), `providers/<real>.provider.ts`, `providers/stub.provider.ts`; `useFactory` in the module selects stub when the key is empty; env vars per `.claude/rules/infra/build-ci-docker.md`.
7. **Service** — business logic, logging per `.claude/rules/backend/logging.md`.
8. **Controller** — guards, Swagger, `XResponseDto.from(...)`.
9. **Module** — wire providers; register in `apps/api/src/app.module.ts`.
10. **Tests** — `test/factories/<domain>.factory.ts`; `<domain>.service.spec.ts`, `<domain>.controller.spec.ts`; provider specs and `<domain>.module.spec.ts` for provider-port.

## 3. Verify (the feature is not done until all pass)

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Then hit the endpoints via Swagger at `http://localhost:3001/docs` (`pnpm dev --filter @repo/api`). Report what was verified and what was not.
