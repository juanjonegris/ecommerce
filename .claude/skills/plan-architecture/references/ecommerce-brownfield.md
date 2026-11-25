# E-commerce brownfield checklist

Use this for all work in this monorepo (`apps/api`, `apps/web`, `packages/types`, infra). `CLAUDE.md`,
`.claude/rules/**` and `apps/web/CLAUDE.md` win if anything here is different.

Add these sections to `architecture.md`, after **Key decisions**. If one does not apply, write
"Not applicable — [reason]".

## Areas touched

List each area, and what changes there, in one line each:

- `apps/api`: which modules in `src/modules/<domain>/` are new or changed. A new module uses the `new-api-module`
  skill.
- `apps/web`: storefront or admin routes under `src/app/[locale]/`, and the Server Actions in `src/app/actions/`.
- `packages/types`: the shared request and response shapes (`<domain>.types.ts`).
- infra: env vars, Docker, CI.

## Data and storage

Add one row per data point the feature reads or writes.

| Data point         | Stored in                           | Read through                                 | Written by         |
| ------------------ | ----------------------------------- | -------------------------------------------- | ------------------ |
| e.g. product stock | PostgreSQL `Product.stock` (Prisma) | `ProductsRepository` → `GET /products/:slug` | admin product form |

Also list:

- Redis / BullMQ queues and jobs, new or reused (`src/queues/`, or a queue in the owning module like `newsletter/`).
- S3 / MinIO objects.
- Whether the Prisma schema changes. A schema change goes through the `schema-migration` skill, never
  `prisma migrate dev`.

## Provider ports and config

- New or changed ports (`providers/<name>-provider.interface.ts`), and what the stub adapter does when the key is
  empty.
- Env keys: the zod schema in `apps/api/src/config/configuration.ts`, and `.env.example`. A provider key defaults
  to `''`.

## Fork impact

The platform is fork-per-client: each client is a fork with its own deployment, and there is no `tenantId`.

- Does this belong in the white-label core (every client), or in one client's fork?
- Does it touch the fork points `apps/web/src/config/brand.ts` or `apps/web/src/app/globals.css`?
- What does merging it upstream mean for existing forks (new env keys, migrations, copy to translate)?

## Fixed rules to respect

From `CLAUDE.md` (hard constraints):

- `apps/api` layers go Controller → Service → Repository. Services never inject `PrismaService`.
- Every DTO field has a `class-validator` decorator and `@ApiProperty`.
- Shared shapes come only from `@repo/types`; never import across apps.
- `apps/web`: Server Components by default. Mutations are Server Actions validated with Zod.
- Every mutation is logged with a dot-namespaced event and `requestId` (`.claude/rules/backend/logging.md`).
- No `any`, and no escape hatches for type errors.

## Testing approach

- New services get unit tests built on `apps/api/test/factories/` (`.claude/rules/backend/testing.md`).
- New user-facing flows get, or update, a Playwright spec with `data-testid` selectors (`apps/web/e2e/`,
  `.claude/rules/frontend/e2e.md`).
- The gates are the ones `/validate` runs: format, lint, typecheck, test, build.

## Languages and audiences

- Every user-facing text has `es` and `en` messages (`apps/web/src/i18n/messages/`). `es` is the default locale.
- Audience: a storefront customer (guest or logged in), or a store owner/admin.
