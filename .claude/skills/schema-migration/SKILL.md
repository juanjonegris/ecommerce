---
name: schema-migration
description: Create and apply a Prisma schema migration safely in apps/api. Use whenever apps/api/prisma/schema.prisma changes (new model, column, index, enum). Never use `prisma migrate dev` directly in this repo.
argument-hint: '<migration-name>'
---

# Schema migration: `$ARGUMENTS`

`prisma migrate dev` is blocked by a hook here: the `Product.searchVector` column is `Unsupported("tsvector")` and GENERATED in Postgres, so Prisma sees drift on every run and emits a broken `ALTER TABLE "Product" ALTER COLUMN "searchVector" DROP DEFAULT`.

## Steps

1. **Infra up** — `docker compose up -d` (Postgres on the dev compose).
2. **Edit** `apps/api/prisma/schema.prisma`. Keep naming consistent with existing models; add `@@index` for every foreign key and every column you filter or sort on.
3. **Create the migration without applying it:**
   ```bash
   pnpm --filter @repo/api prisma:migrate:create -- --name $ARGUMENTS
   ```
   If Prisma asks to reset the database because of drift, stop and ask the user — never accept a reset.
4. **Review the generated SQL** in `apps/api/prisma/migrations/<timestamp>_$ARGUMENTS/migration.sql`:
   - Delete any statement touching `searchVector` (`DROP DEFAULT`, `DROP COLUMN`, type changes).
   - Check data-destructive statements (`DROP`, `ALTER ... TYPE`, `NOT NULL` without default on a populated table) and ask before keeping them.
   - Raw additions Prisma can't express (generated columns, GIN indexes, triggers) go here, with a SQL comment saying why — see `20260614000000_add_product_search_vector`.
5. **Apply and regenerate:**
   ```bash
   pnpm --filter @repo/api prisma:deploy
   pnpm --filter @repo/api prisma:generate
   ```
6. **Seed** — update `apps/api/prisma/seed.ts` if the new tables need demo data (keep upserts idempotent), then `pnpm --filter @repo/api db:seed`.
7. **Verify** — `pnpm typecheck` and `pnpm test`. CI applies migrations with `prisma:deploy` on a fresh database, so the migration must apply cleanly from zero.

Never edit a migration that has already been applied anywhere; write a new one.
