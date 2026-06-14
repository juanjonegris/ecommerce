# Feature: search-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

PostgreSQL Full-Text Search across the storefront's product catalog, with
the SearchService interface designed so a future Meilisearch swap (per
setup-guide §"Next steps") is a one-line module rebinding instead of a
caller rewrite. Three endpoints: `GET /search` (paginated, scored, with
`ts_headline` snippets), `GET /search/suggest` (cheap prefix autocomplete
for the storefront search bar), and `POST /search/reindex` (admin-only
audit hook — for the FTS-via-generated-column strategy this is a no-op,
but it exists so the future Meilisearch impl drops in without a new
endpoint). Backed by a generated `tsvector` column on `Product` so writes
update the index automatically — no BullMQ reindex queue needed at MVP
scope.

## User Story

As a STOREFRONT CUSTOMER
I want to type free-text into the search bar and see relevant products
ranked by match quality with highlighted snippets
So that I can find what I'm looking for without browsing categories.

(Secondary: as an ADMIN I want a one-click reindex so future provider
migrations have a knob to pull.)

## Problem Statement

Setup-guide §12.9 requires a `SearchService` interface + a
`PostgresFtsSearchService` implementation. The product table has no
search index today and no FTS infrastructure exists. The storefront's
search bar has no backing endpoint, so the golden path "type → results"
isn't wireable from the frontend yet. PRD §4 puts search inside the
storefront's golden path, and the white-label posture (PRD §5.3 — fork
per client) means the search backend must be swappable per fork by env
without code edits.

## Solution Statement

Mirror the canonical `products` 9-file structure PLUS the provider-port
pattern from `payments` / `newsletter` / `uploads`. Extend `Product` with
ONE `GENERATED ALWAYS AS … STORED tsvector` column + a GIN index +
a btree on `lower(name)` for the suggest path — all via a hand-rolled
migration (Prisma's DSL can't express `GENERATED ... STORED`). Define a
`SearchProviderAdapter` with two implementations: `PostgresFtsSearchProvider`
(uses `prisma.$queryRaw` with `websearch_to_tsquery` for Google-style
syntax, `setweight` so name (A) outranks description (B), and
`ts_headline` for `<mark>` snippets) and a deterministic `StubSearchProvider`
(empty results, for offline dev / unit tests). Service short-circuits
empty queries and silently truncates oversized ones. Reindex is a no-op
audit-log for postgres-fts — the generated column does the real work
automatically on every product write.

---

## ARCHITECTURAL DECISIONS

- **D1 — Generated `tsvector` column, NOT a trigger.** PostgreSQL 12+
  supports `GENERATED ALWAYS AS (… to_tsvector …) STORED`. Cleaner than
  triggers (which Prisma migrations don't preserve well across resets)
  and faster than computing the vector at search time. Generated at the
  DDL level with `'simple'` config so accent-stripping works for both
  `es` and `en` locales without per-locale columns; the search-time
  `websearch_to_tsquery` accepts a runtime-configurable
  `SEARCH_FTS_LANGUAGE` (default `simple`). Per-locale tsvectors are a
  documented follow-up.
- **D2 — `websearch_to_tsquery`, NOT `plainto_tsquery`.** Supports
  `"quoted phrases"` and `-exclusion` natively — Google-style. Accepts
  arbitrary user input without raising on bad operator syntax, so we
  bind the raw query directly via `$queryRaw` parameterization.
- **D3 — NO `SearchRepository` file.** This deliberately deviates from
  the canonical 9-file structure. The module's only persistence
  responsibility IS the FTS SQL, which lives INSIDE
  `PostgresFtsSearchProvider`. Adding a third tier (repository) would
  duplicate the provider's responsibility. The other 8 files of the
  canonical layout still apply.
- **D4 — Reindex is a no-op audit hook.** The generated column means
  product writes automatically update `searchVector`. Reindex exists so
  the future Meilisearch provider has a hook for its bulk-repopulate
  call; for postgres-fts it logs `search.provider.postgres_fts.reindex_audit`
  and returns `{ reindexed: <count of active products> }` for admin
  visibility. NO BullMQ queue is registered — kept out of the module to
  avoid wiring complexity the MVP doesn't need.
- **D5 — Service short-circuits empty queries.** Whitespace-only or
  empty `q` returns `{ data: [], total: 0, page, limit }` without
  touching Prisma. Saves a roundtrip on every search-bar state change
  the storefront emits before the user types.
- **D6 — Service truncates oversized queries silently.** `q.length >
SEARCH_MAX_QUERY_LENGTH` (default 200) is truncated, NOT rejected.
  Pasted URLs are common in search bars; rejecting with 400 creates more
  noise than it prevents.
- **D7 — Provider-scored order preserved during hydration.** The service
  fetches products via `findManyByIds(ids)` then re-sorts in JS to match
  the provider's order. Postgres ranks the result set; Prisma's `IN`
  doesn't guarantee order. Products that disappear between FTS rank and
  hydration (concurrent delete) are silently dropped — search can briefly
  outlive a delete; we do NOT 500.
- **D8 — Reindex restricted to ADMIN; STAFF blocked.** Other admin
  endpoints in this codebase allow STAFF (newsletter, uploads). Reindex
  is destructive-ish for non-MVP providers (full Meilisearch repopulate
  can take minutes) — restricting now matches the future blast radius.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/src/modules/products/` — canonical 9-file structure. Mirror
  naming + layer separation + Winston event style. The Product entity
  and `ProductResponseDto` are the response surface this module wraps.
- `apps/api/src/modules/uploads/uploads.module.ts:34-49` — exported
  `selectStorageProvider` factory function pattern + `BullModule` /
  `OnModuleInit` shape. Copy the factory-function pattern (without
  Bull/OnModuleInit — search has neither).
- `apps/api/src/modules/uploads/uploads.module.spec.ts` — exact shape
  of the factory-function spec (4 cases). Copy structure.
- `apps/api/src/modules/uploads/providers/storage-provider.interface.ts` —
  port + DI token shape. Mirror for `search-provider.interface.ts`.
- `apps/api/src/modules/uploads/providers/stub.provider.ts` — stub
  skeleton (Inject Logger + Cls via constructor, no-op methods, log
  every call).
- `apps/api/src/modules/newsletter/newsletter.module.spec.ts` — second
  reference for the factory-function spec.
- `apps/api/src/modules/payments/providers/payment-provider.interface.ts` —
  oldest reference for the port + DI-token convention.
- `apps/api/src/modules/products/products.controller.ts:39-52` — pagination
  - response-mapping shape (`PaginatedResponse<T>` + `.from(entity)`
    mapper per item). Mirror in `SearchController.search`.
- `apps/api/src/modules/products/dto/find-products-query.dto.ts` —
  `page` / `limit` query DTO with `@Type(() => Number)` + class-validator
  decorators. Mirror for `SearchQueryDto`.
- `apps/api/src/modules/products/products.repository.ts` — existing repo;
  needs ONE new method `findManyByIds`.
- `apps/api/src/modules/products/products.module.ts` — already exports
  `ProductsRepository` (verified — uploads precedent).
- `apps/api/src/modules/categories/categories.repository.ts:47-50` —
  `findById` already exists. Returns `CategoryEntity | null`.
- `apps/api/src/modules/categories/categories.module.ts` — does NOT
  currently export `CategoriesRepository`. Needs ONE-line `exports`
  addition.
- `apps/api/src/config/configuration.ts` — extend `ConfigSchema` with the
  4 new SEARCH\_\* keys.
- `apps/api/prisma/schema.prisma` — existing `Product` model to extend
  with `searchVector` + GIN index.
- `apps/api/prisma/migrations/20260613100000_add_product_image_storage_metadata/migration.sql` —
  most recent hand-rolled migration format. Mirror.
- `packages/types/src/product.types.ts` — existing `Product` interface
  the SearchResultItem generic defaults to.
- `packages/types/src/newsletter.types.ts:40-56` — `satisfies
z.ZodType<X>` shape for shared types.

### New Files to Create

Under `apps/api/src/modules/search/`: `search.module.ts`,
`search.controller.ts` + spec, `search.service.ts` + spec,
`search.module.spec.ts`; in `dto/`: `search-query.dto.ts`,
`suggest-query.dto.ts`, `search-result-item-response.dto.ts`,
`search-results-response.dto.ts`, `search-suggestion-response.dto.ts`,
`reindex-response.dto.ts`; in `providers/`:
`search-provider.interface.ts`, `postgres-fts.provider.ts` + spec,
`stub.provider.ts` + spec.

Plus: `apps/api/prisma/migrations/20260614000000_add_product_search_vector/migration.sql`
and `packages/types/src/search.types.ts`.

NO new entity file — the search module's only "entity" is the existing
`ProductEntity` from `apps/api/src/modules/products/entities/`. NO new
test factory — reuses `createMockProduct` and `createMockCategory`.

### Files to MODIFY

`apps/api/prisma/schema.prisma` (add `searchVector` + GIN index to
`Product`); `apps/api/src/config/configuration.ts` (4 new keys);
`apps/api/src/app.module.ts` (import alphabetically between Products
and Uploads); `.env.example` (4 new keys + comment block);
`packages/types/src/index.ts` (barrel re-export);
`apps/api/src/modules/products/products.repository.ts` (add `findManyByIds`);
`apps/api/src/modules/categories/categories.module.ts` (export
`CategoriesRepository`).

### Patterns to Follow

Naming kebab-case files / PascalCase classes / camelCase methods
(CLAUDE.md §4); layer separation Controller → Service → Provider — NO
Prisma in services, only in the provider's `$queryRaw` (D3); DTOs
implement `Pick<…>` from `@repo/types` + class-validator +
`@ApiProperty` (CLAUDE.md §7); structured Winston JSON with `requestId`
from CLS (CLAUDE.md §5), events `search.{component}.{verb}_{state}`;
exceptions `NotFoundException` / `BadRequestException`; **no raw SQL
outside the provider** (CLAUDE.md rule — provider's `$queryRaw` is the
ONLY allowed FTS path; add a brief comment justifying the deviation in
the file header).

---

## IMPLEMENTATION PLAN

1. **Foundation** — schema + migration; `@repo/types` extension; config +
   env; cross-module additions (`ProductsRepository.findManyByIds`,
   `CategoriesModule` export).
2. **Provider port** — interface + `stub.provider.ts` +
   `postgres-fts.provider.ts` with specs.
3. **Domain layer** — service (8 branches) + spec.
4. **Controller + module** — 3 endpoints, `selectSearchProvider` factory,
   register in `app.module.ts`, controller spec, module spec.
5. **Validation** — lint/typecheck/test green; manual smoke.

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom.

### Task 1 — UPDATE `apps/api/prisma/schema.prisma`

- **IMPLEMENT**: Add ONE field + ONE index to the EXISTING `Product`
  model. The `tsvector` type is unsupported in Prisma DSL — use the
  `Unsupported("tsvector")?` placeholder so Prisma keeps the column on
  introspection. Add `@@index([searchVector], type: Gin)` — this IS
  expressible in Prisma 5+.
- **PATTERN**: Existing Product model lines 72-91; add the field at the
  bottom of the field block and the index alongside the existing
  `@@index([slug])` / `@@index([isActive])` / `@@index([categoryId])`.
  Field: `searchVector Unsupported("tsvector")?`. Index:
  `@@index([searchVector], type: Gin)`.
- **GOTCHA**: The field MUST be optional (`?`) because `Unsupported` types
  can't be selected in client queries — Prisma omits them from the
  generated types. The optional marker satisfies the schema validator
  without surfacing the column to the typed client. NEVER reference
  `searchVector` from any Prisma `select` / `where` / `data` clause; it's
  ONLY queried via `$queryRaw` inside the provider.
- **VALIDATE**: Done at Task 2.

### Task 2 — CREATE migration `20260614000000_add_product_search_vector/migration.sql`

- **IMPLEMENT**: Hand-rolled SQL in order:
  (1) `ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
) STORED;`
  (2) `CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");`
  (3) `CREATE INDEX "Product_name_lower_idx" ON "Product" (lower("name"));`
- **PATTERN**: `apps/api/prisma/migrations/20260613100000_add_product_image_storage_metadata/migration.sql`
  for the hand-rolled format + `-- AlterTable` / `-- CreateIndex`
  comments.
- **GOTCHA**: The generated column is `STORED` (not `VIRTUAL`) — required
  for indexing. `coalesce(…, '')` is mandatory because `to_tsvector(NULL)`
  returns NULL and would null out the whole generated value if either
  column is null. The `'simple'` config is fixed at DDL level (D1); the
  query-time language is configurable.
- **VALIDATE**: `pnpm --filter @repo/api prisma:generate` succeeds (the
  `Unsupported` placeholder compiles cleanly).

### Task 3 — CREATE `packages/types/src/search.types.ts`

- **IMPLEMENT**: Pure structural types + Zod schemas. Mirror
  `newsletter.types.ts:40-56` shape (`satisfies z.ZodType<X>`).

  ```ts
  import { z } from 'zod';
  import type { Product } from './product.types';

  export interface SearchResultItem<P = Product> {
    product: P;
    score: number;
    snippet: string | null;
  }

  export interface SearchSuggestion {
    name: string;
    slug: string;
  }

  export const SearchSuggestionSchema = z.object({
    name: z.string(),
    slug: z.string(),
  }) satisfies z.ZodType<SearchSuggestion>;
  ```

- **GOTCHA**: NO class-validator. NO `@ApiProperty`. Generic over
  `P = Product` so the API can specialize to `ProductResponseDto`
  internally without leaking decorators here. NO Zod schema for
  `SearchResultItem` (it's generic — Zod can't infer the parameter; skip).

### Task 4 — UPDATE `packages/types/src/index.ts`

- **IMPLEMENT**: Add `export * from './search.types';` alphabetically —
  between `./product.types` and `./user.types` (verify alphabetical
  ordering in the existing barrel).
- **VALIDATE**: `pnpm --filter @repo/types typecheck` green.

### Task 5 — UPDATE `apps/api/src/config/configuration.ts`

- **IMPLEMENT**: Append 4 keys to `ConfigSchema`:

  ```ts
  SEARCH_PROVIDER: z.enum(['postgres-fts', 'stub']).default('postgres-fts'),
  SEARCH_FTS_LANGUAGE: z.string().default('simple'),
  SEARCH_MAX_QUERY_LENGTH: z.coerce.number().int().min(20).max(2000).default(200),
  SEARCH_HIGHLIGHT_ENABLED: z.coerce.boolean().default(true),
  ```

- **PATTERN**: The Uploads block at the end of the file.
- **GOTCHA**: `SEARCH_FTS_LANGUAGE` is a free-form string (NOT a Zod
  enum) because Postgres FTS configs are extensible — a fork may install
  custom dictionaries. Validation happens at the SQL boundary, not
  here.

### Task 6 — UPDATE `.env.example`

- **IMPLEMENT**: Add the 4 keys at the end of the file (after the
  UPLOAD\_\* block) with a "# Search. SEARCH_PROVIDER picks the adapter
  (postgres-fts is the MVP; meilisearch later)." header comment.

### Task 7 — UPDATE `apps/api/src/modules/products/products.repository.ts`

- **IMPLEMENT**: Add ONE method:

  ```ts
  async findManyByIds(ids: string[]): Promise<ProductEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
    });
    return rows.map((r) => this.toEntity(r));
  }
  ```

- **GOTCHA**: NO order guarantee from Prisma `IN` — the search service
  re-sorts in JS to match the provider's ranked order (D7). The
  `isActive: true` filter is defense-in-depth — the FTS provider already
  filters by isActive but a brief race could surface a just-deactivated
  product; dropping it here keeps the customer from seeing it.

### Task 8 — UPDATE `apps/api/src/modules/categories/categories.module.ts`

- **IMPLEMENT**: Add `exports: [CategoriesRepository]` so SearchModule
  can inject it for the `categoryId` existence check.
- **GOTCHA**: One-line change; verify nothing else relied on the absence
  of the export (search by `imports.*CategoriesModule` to confirm no
  collision).

### Task 9 — CREATE `apps/api/src/modules/search/providers/search-provider.interface.ts`

- **IMPLEMENT**: Mirror the shape of `uploads/providers/storage-provider.interface.ts`
  exactly. Export `SearchInput`, `ProviderSearchResultItem`,
  `ProviderSearchResult`, `ProviderSuggestResult`, `SearchProviderAdapter`
  (`name: 'postgres-fts' | 'stub'`, three methods: `search`, `suggest`,
  `reindex`), and `SEARCH_PROVIDER = 'SEARCH_PROVIDER'` token.
- **PATTERN**: `uploads/providers/storage-provider.interface.ts`,
  `payments/providers/payment-provider.interface.ts`,
  `newsletter/providers/newsletter-provider.interface.ts`.
- **GOTCHA**: `SearchInput.locale` is informational only — the MVP impl
  ignores it. Document via a `/** … */` comment so a future Meilisearch
  impl knows it's available without re-reading the plan.

### Task 10 — CREATE `apps/api/src/modules/search/providers/stub.provider.ts`

- **IMPLEMENT**: `@Injectable() StubSearchProvider implements
SearchProviderAdapter`, `name = 'stub' as const`. Constructor injects
  `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger`, `ClsService cls`. All
  three methods are deterministic empty returns:
  `search` → `{ items: [], total: 0 }`, `suggest` →
  `{ suggestions: [] }`, `reindex` → `{ reindexed: 0 }`. Each method
  logs `search.provider.stub.<verb>_called` with `requestId`.
- **PATTERN**: `uploads/providers/stub.provider.ts`.
- **GOTCHA**: `void input` / `void prefix` / `void limit` on unused
  params (project ESLint config doesn't honor `_` prefix — uploads
  precedent).

### Task 11 — CREATE `apps/api/src/modules/search/providers/postgres-fts.provider.ts`

- **IMPLEMENT**: `@Injectable() PostgresFtsSearchProvider implements
SearchProviderAdapter`, `name = 'postgres-fts' as const`. Constructor
  injects `PrismaService`, `ConfigService`, `@Inject(WINSTON_MODULE_NEST_PROVIDER)
logger`, `ClsService cls`. Header comment notes that FTS SQL lives here
  (not in a repository) per plan D3.
  - `search(input)`: read `SEARCH_FTS_LANGUAGE` from config; build TWO
    `prisma.$queryRaw` calls inside `prisma.$transaction([dataQ, countQ])`.
    The full SQL is in `.claude/references/search-module-prompt.md` under
    "PROVIDER ABSTRACTION → postgres-fts.provider.ts"; use it verbatim with
    these param positions: `$1=SEARCH_FTS_LANGUAGE, $2=query, $3=categoryId
?? null, $4=limit, $5=(page-1)*limit`. Data query SELECTs
    `id, ts_rank(...) AS score, ts_headline(...) AS snippet` from
    `"Product"` WHERE `isActive=true AND (categoryId IS NULL OR matches)
AND searchVector @@ websearch_to_tsquery(...)` ORDER BY score DESC,
    createdAt DESC. Count query: `SELECT COUNT(*)::bigint AS count` with
    the same WHERE. Coerce `count` to `Number(rows[0]?.count ?? 0n)`.
    Returns `{ items: dataRows.map(r => ({ productId: r.id, score:
Number(r.score), snippet: r.snippet })), total }`.

  - `suggest(prefix, limit)`: single `$queryRaw` `SELECT name, slug FROM
"Product" WHERE isActive=true AND lower("name") LIKE lower($1) || '%'
ORDER BY name ASC LIMIT $2` → `{ suggestions: rows }`.

  - `reindex()`: NO writes. Count active products via
    `prisma.product.count({ where: { isActive: true } })`. Log
    `search.provider.postgres_fts.reindex_audit`. Return `{ reindexed: <count> }`.

- **PATTERN**: `newsletter/providers/mailchimp.provider.ts` for
  constructor + config-read + structured logging.
- **GOTCHA**: `Prisma.sql` tagged templates bind via `${…}` — never
  concatenate user input. Postgres returns `COUNT(*)` as `bigint` (JSON
  serializer throws on a raw bigint — coerce to `Number`). `ts_headline`
  returns the full text if no fragment overlap is found; UI ellipsizes.

### Task 12 — CREATE DTOs

All DTOs in `apps/api/src/modules/search/dto/`. Mirror `products/dto/`
for decorator style. Six files:

- **`search-query.dto.ts`** — `q` (`@IsString @MaxLength(200) @Transform
trim`), `page` (≥1, `@Type Number`), `limit` (1-50), `categoryId`
  (optional `@IsString`).
- **`suggest-query.dto.ts`** — `q` (`@IsString @MaxLength(50) @Transform
trim`), `limit` (1-10, default 8).
- **`search-suggestion-response.dto.ts`** — implements `SearchSuggestion`
  (`name`, `slug` each `@ApiProperty`). Static `from(entity)` mapper.
- **`search-result-item-response.dto.ts`** — `{ product:
ProductResponseDto; score: number; snippet: string | null }`. Static
  `from(item)` calls `ProductResponseDto.from(item.product)` and copies
  the other two fields.
- **`search-results-response.dto.ts`** — `{ data:
SearchResultItemResponseDto[]; total; page; limit }` (matches
  `PaginatedResponse<T>`).
- **`reindex-response.dto.ts`** — `{ provider: 'postgres-fts'|'stub';
reindexed: number }`.

### Task 13 — CREATE `apps/api/src/modules/search/search.service.ts`

- **IMPLEMENT**: `@Injectable() SearchService`. Constructor injects
  `@Inject(SEARCH_PROVIDER) provider`, `ProductsRepository`,
  `CategoriesRepository`, `ConfigService`,
  `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger`, `ClsService cls`.
- Public methods:
  - `search(input)`: trim query; empty → log
    `search_short_circuit_empty` and return
    `{ data: [], total: 0, page: input.page, limit: input.limit }`;
    `query.length > maxQueryLength()` → truncate silently. If
    `categoryId` provided, call `categoriesRepository.findById` →
    NotFound on miss (log `category_filter_invalid`). Delegate to
    `provider.search`. Hydrate via
    `productsRepository.findManyByIds(items.map(i => i.productId))`,
    build a `Map<id, ProductEntity>`, then construct the result IN
    PROVIDER ORDER (D7) — products missing from the map (concurrent
    delete) are silently dropped. Log `search_succeeded` with
    `{ totalReturned, total, latencyMs }`. Return
    `{ data, total: providerResult.total, page, limit }`.
  - `suggest(prefix, limit?)`: trim, empty short-circuit, hard-cap limit
    at 10, delegate, return as-is.
  - `reindex()`: log `reindex_started`, delegate, log
    `reindex_succeeded`, return.
- **PATTERN**: `uploads.service.ts` for logging dot-namespaces + CLS /
  ConfigService injection.
- **GOTCHA**: NEVER imports `PrismaService`. Always include
  `requestId: this.cls.getId()`. `latencyMs = Date.now() - start` where
  `start = Date.now()` at the top of `search` (runtime production —
  fine, only Workflow scripts forbid it).

### Task 14 — CREATE `apps/api/src/modules/search/search.controller.ts`

- **IMPLEMENT**: `@ApiTags('search') @Controller('search')`. NO
  class-level guard (public endpoints reject it; admin endpoint applies
  its own).
  - `@Get()` `search(@Query() q: SearchQueryDto)` —
    `@Throttle({ default: { limit: 30, ttl: 60_000 } })`. Delegates to
    `service.search({ query: q.q, page: q.page ?? 1, limit: q.limit ??
20, ...(q.categoryId !== undefined ? { categoryId: q.categoryId } : {}) })`;
    maps `result.data` through `SearchResultItemResponseDto.from`.
  - `@Get('suggest')` `suggest(@Query() q: SuggestQueryDto)` —
    `@Throttle({ default: { limit: 60, ttl: 60_000 } })`. Delegates;
    maps through `SearchSuggestionResponseDto.from`. Returns
    `{ suggestions: [...] }`.
  - `@Post('reindex')` `@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) @ApiBearerAuth() @HttpCode(HttpStatus.OK)` —
    delegates to `service.reindex()`. Cast return as `Promise<ReindexResponseDto>`
    at the boundary (service types it loosely as `{ provider: string }`;
    runtime values are always `'postgres-fts'` | `'stub'`).
- **PATTERN**: `newsletter.controller.ts` for `@Throttle` + Roles combo;
  `products.controller.ts:39-52` for the paginated mapping shape.
- **GOTCHA**: Reindex uses `@Roles(UserRole.ADMIN)` ONLY (D8 — STAFF
  excluded, deviates from other admin endpoints). `@HttpCode(HttpStatus.OK)`
  on the POST so a 2xx isn't a 201.

### Task 15 — CREATE `apps/api/src/modules/search/search.module.ts`

- **IMPLEMENT**: Export `selectSearchProvider(config, prisma, logger,
cls): SearchProviderAdapter` — returns
  `new PostgresFtsSearchProvider(prisma, config, logger, cls)` when
  `SEARCH_PROVIDER === 'postgres-fts'` (or any value other than `'stub'`),
  else logs `search.module.stub_selected` and returns
  `new StubSearchProvider(logger, cls)`. Then `@Module` with:
  - **imports**: `[PrismaModule, ConfigModule, ProductsModule,
CategoriesModule]`.
  - **controllers**: `[SearchController]`.
  - **providers**: `SearchService`, the `SEARCH_PROVIDER` useFactory
    binding (inject `[ConfigService, PrismaService,
WINSTON_MODULE_NEST_PROVIDER, ClsService]`).
  - **exports**: `[SearchService]`.
  - NO `OnModuleInit` — postgres-fts has no boot-time side effect.
- **PATTERN**: `uploads.module.ts:34-49` (factory function) but WITHOUT
  the Bull/OnModuleInit blocks.
- **GOTCHA**: `PrismaService` must be in the factory's `inject` array
  because the postgres-fts provider needs it. Since the factory is
  building the provider, it can't depend on Nest's DI for sub-deps —
  pass them explicitly.

### Task 16 — UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: Add `import { SearchModule } from
'@/modules/search/search.module';` alphabetically (between
  `ProductsModule` and `UploadsModule`). Add `SearchModule` to the
  `imports` array in the same alphabetical slot.

### Task 17 — CREATE 5 spec files

Co-located `.spec.ts`. Mirror `uploads/*.spec.ts` for mock shapes
(`jest.Mocked<Pick<X, '…'>>`).

- **`providers/stub.provider.spec.ts`** (3 cases): `search` returns
  empty, `suggest` returns empty, `reindex` returns `{ reindexed: 0 }`.
- **`providers/postgres-fts.provider.spec.ts`** (6 cases): mock
  `prisma.$queryRaw` (resolve to row arrays) + `prisma.$transaction`
  (passthrough on array form) + `prisma.product.count` for reindex.
  Cover: search assembles `$transaction([dataQ, countQ])` and returns
  `{ items, total }` mapped from rows; search with `categoryId` passes
  the value through; search without `categoryId` passes `null`; suggest
  binds `lower($1) || '%'` and respects limit (assert raw SQL contains
  `LIKE lower($1)`); reindex returns `{ reindexed: count }` without
  writes (assert `$executeRaw` never called); reindex `count` coerces
  `bigint` to `Number`.
- **`search.service.spec.ts`** (10 cases): empty short-circuit (no
  provider call), whitespace short-circuit, oversized truncation (assert
  provider receives ≤ 200 chars), valid query happy path (hydration +
  order preservation — assert returned array matches provider's
  productId order), valid query with valid categoryId (categoriesRepository
  called), valid query with missing categoryId throws NotFoundException,
  product missing from hydration silently dropped, suggest empty
  short-circuit, suggest valid (limit hard-cap at 10), reindex delegates.
- **`search.controller.spec.ts`** (6 cases): GET /search returns
  paginated shape with `data.map` through `SearchResultItemResponseDto`
  (assert the embedded product matches `ProductResponseDto.from`);
  GET /search/suggest returns `{ suggestions: [...] }`; GET /search with
  empty q → service returns empty page (no special-case in controller);
  POST /reindex (non-admin) → 403; POST /reindex (admin) → calls
  service.reindex; POST /reindex (STAFF) → 403.
- **`search.module.spec.ts`** (2 cases): `selectSearchProvider` with
  `SEARCH_PROVIDER=postgres-fts` → `PostgresFtsSearchProvider`;
  `SEARCH_PROVIDER=stub` → `StubSearchProvider` + log
  `search.module.stub_selected`.
- **PATTERN**: `uploads/*.spec.ts`.
- **VALIDATE**: `pnpm --filter @repo/api test` green; coverage ≥ 80%.

---

## TESTING STRATEGY

**Unit (Backend):** services with mocked repositories + mocked provider
(`{ provide: SEARCH_PROVIDER, useValue: mockProvider as
SearchProviderAdapter }`); entity defaults from existing
`createMockProduct` / `createMockCategory` — NO new factory. Prisma is
mocked at the SDK level — no CI DB required. The `$queryRaw` tagged
template results are mocked at the resolved-value level (the SQL string
itself is verified via `expect(prisma.$queryRaw).toHaveBeenCalled()`
plus a substring check on the first call's first argument's `strings`
or `values`).

**E2E (Frontend):** out of scope for this PR — the storefront search-bar
integration is a separate ticket.

**Edge cases:** empty `q` short-circuits without DB roundtrip; oversized
`q` truncated silently; query with only stopwords returns empty (FTS
handles it); query with quoted phrase `"classic tee"` honors phrase
match; negation `tee -shirt` excludes results (websearch syntax);
hydration order matches provider score order even when Prisma returns
rows out of order; product deleted between FTS rank and hydration is
silently dropped (not 500); `categoryId` referring to a deleted category
→ NotFoundException; large concurrent `searchVector` updates
(generated-column writes) don't lock readers (Postgres MVCC).

---

## VALIDATION COMMANDS

Execute in order. Stop and fix on any Level 1 or 2 failure.

### Level 1 — Lint (REQUIRED hard gate)

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/types lint
```

### Level 2 — Type Check (REQUIRED hard gate)

```bash
pnpm --filter @repo/types typecheck
pnpm --filter @repo/api typecheck
pnpm --filter @repo/web typecheck   # confirm shared types don't break the frontend
```

### Level 3 — Unit Tests

```bash
pnpm --filter @repo/api test
```

Coverage must stay ≥ 80%:

```bash
pnpm --filter @repo/api test:cov
```

### Level 4 — Manual smoke (after Docker is up)

```bash
docker compose up -d postgres redis
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate -- --name add-product-search-vector
pnpm --filter @repo/api dev
```

Smoke commands from `.claude/references/search-module-prompt.md`
(GET /search basic, phrase, negation, categoryId; GET /search/suggest;
admin POST /reindex; non-admin → 401; stub-mode smoke).

### Level 5 — Visual

`open http://localhost:3001/docs` — `search` tag shows 3 endpoints
(GET /search and GET /search/suggest are anonymous; POST /search/reindex
requires bearer).

---

## ACCEPTANCE CRITERIA

- [ ] `Product` model gains `searchVector` + GIN index; migration applies
      cleanly on a seeded DB and the generated column populates without
      additional triggers.
- [ ] `selectSearchProvider` binds `PostgresFtsSearchProvider` by default,
      `StubSearchProvider` when `SEARCH_PROVIDER=stub` (verified in
      module spec).
- [ ] All 3 endpoints reachable; reindex requires ADMIN (STAFF → 403).
- [ ] `GET /search?q=…` returns scored + hydrated results with provider
      order preserved; `<mark>…</mark>` snippets appear when matches
      overlap text.
- [ ] Empty/whitespace `q` returns empty page without hitting Prisma.
- [ ] `categoryId` for a missing category → 404; valid → results filtered.
- [ ] Provider stays the ONLY caller of `$queryRaw` in this module —
      service / controller never touch raw SQL.
- [ ] `pnpm --filter @repo/api lint` / `typecheck` / `test` green with
      coverage ≥ 80%.

---

## NOTES

- **`Unsupported("tsvector")`**: Prisma 5+ stable. The `?` optional
  marker is REQUIRED — `Unsupported` types can't be selected/written
  through the typed client, and Prisma's validator rejects required
  ones. Optional + GIN index is the standard recipe.
- **`websearch_to_tsquery` vs `plainto_tsquery`**: chose websearch (D2)
  for Google-style operators and graceful handling of user typos /
  trailing operators. `plainto_tsquery` would be slightly faster but
  doesn't support quoted phrases.
- **No tenantId** — fork-per-client (PRD §5.3; MEMORY.md
  `whitelabel_strategy`).
- **No BullMQ queue** — the generated column means no reindex job is
  needed at MVP. A future Meilisearch provider WILL need one; introduce
  it then (in the provider's own module, newsletter precedent).
- **Risk:** `Unsupported` columns are invisible to the Prisma client.
  Any future code that needs to read `searchVector` directly (e.g. for
  debugging) will need a `$queryRaw`. Document this in the postgres-fts
  provider header.
- **Risk:** `ts_headline` runs ONCE PER ROW — on very large result sets
  this is the dominant cost. The hard `limit: 50` cap on `SearchQueryDto`
  keeps it bounded.
- **Risk:** STAFF historically gets admin endpoints in this codebase
  (newsletter / uploads). The plan deviates by restricting reindex to
  ADMIN only (D8) — call this out in the execution report so the team
  sees the diff intentionally.
- **Risk:** Two minimal cross-module prereqs (ProductsRepository.findManyByIds
  and CategoriesModule exporting CategoriesRepository) — verified
  necessary; both are one-line additions.

**Confidence Score**: 9/10. The provider abstraction + factory pattern
is now the third repetition (newsletter, uploads, search) so the wiring
is muscle memory. Main residual uncertainty is the exact `Prisma.sql`
template syntax for the cast `${input.categoryId ?? null}::text` —
Prisma's tagged template binds raw values, and the `::text` cast is
applied SQL-side. If the typecheck flags it, the fallback is to
construct the WHERE clause conditionally inside the provider (two
separate template literals chosen by `categoryId !== undefined`).
