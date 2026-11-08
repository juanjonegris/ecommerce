---
paths:
  - 'apps/api/prisma/**'
  - 'apps/api/prisma.config.ts'
  - 'apps/api/src/prisma/**/*.ts'
  - 'apps/api/src/**/*.repository.ts'
---

# Prisma and data access

- Prisma 7 with `@prisma/adapter-pg`; config in `apps/api/prisma.config.ts`, client wrapper in `src/prisma/prisma.service.ts` (global module).
- **Only repositories inject `PrismaService`.** The one exception is the search FTS provider (`src/modules/search/providers/postgres-fts.provider.ts`), which needs raw SQL.
- No raw SQL (`$queryRaw` / `$executeRaw`) unless Prisma cannot express it; add a comment saying why. Always use the tagged-template form so values are parameterized.
- Repositories map Prisma rows to `entities/` classes before returning; multi-write operations use `this.prisma.$transaction`.

## Migrations

- **Never run `prisma migrate dev`** (a hook blocks it). `Product.searchVector` is an `Unsupported("tsvector")` GENERATED column; `migrate dev` sees drift every run and emits a broken `ALTER TABLE ... DROP DEFAULT`.
- New schema change → follow the `schema-migration` skill: `pnpm --filter @repo/api prisma:migrate:create -- --name <name>`, review/hand-edit the SQL, then `prisma:deploy` and `prisma:generate`.
- Never edit a migration that has already been applied; add a new one. `prisma/migrations/` is excluded from Prettier.
- Demo data lives in `prisma/seed.ts` (`pnpm --filter @repo/api db:seed`); keep it idempotent.
