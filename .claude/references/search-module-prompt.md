---
description: /planning prompt for the search domain module (Step 12.9 of setup guide — SearchService interface + PostgresFtsSearchService implementation).
---

# Search Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `search` module under apps/api/src/modules/search/.

Follow the `products` module structure exactly (controller / service / repository /
dto/ / entities/ / specs) AND the provider-port pattern from the `payments`,
`newsletter`, and `uploads` modules (`providers/<name>.provider.ts` + a
`*-provider.interface.ts` with a DI token). Read every file in
apps/api/src/modules/products/ first — this module SEARCHES across products
so the Product entity / repository / response shape is the source of truth.
Then read apps/api/src/modules/uploads/ (the most recent module — copy the
`selectStorageProvider` factory-function pattern in uploads.module.ts:34-49
and the OnModuleInit hook style; replace `ensureBucket` with whatever
postgres-fts needs at boot, if anything). Then read
apps/api/src/modules/newsletter/ for the second-most-recent CRUD + module
spec pattern, and apps/api/src/modules/payments/providers/payment-provider.interface.ts
for the canonical port shape.

NO new model is introduced. You will EXTEND the existing `Product` model
in apps/api/prisma/schema.prisma with ONE generated `tsvector` column +
ONE GIN index, and add ONE hand-rolled migration named
`add-product-search-vector` (Prisma's DSL can't express GENERATED ... STORED
yet so the migration is raw SQL — pattern: see the hand-rolled migrations
under apps/api/prisma/migrations/).

---

DOMAIN — what we are building:

A product full-text search backed by PostgreSQL FTS (Full-Text Search). The
storefront submits a free-text query → API returns a paginated, scored list
of matching products with optional snippet highlights for the result page.
Suggestions / autocomplete come from a cheaper prefix-match endpoint.

Customers consume two public endpoints:

1. `GET /search?q=…&page=&limit=&categoryId=` — paginated text search.
   Returns `{ data: SearchResultItem[], total, page, limit }` where each
   item embeds the matching `ProductResponseDto` plus a `score: number` and
   an optional `snippet: string` HTML fragment with `<mark>…</mark>` around
   matched terms (server-rendered via `ts_headline`).
2. `GET /search/suggest?q=…&limit=` — fast prefix autocomplete. Returns
   `{ suggestions: string[] }` of product names that start with the query.
   Uses a btree index on `lower(name)` with `ILIKE 'prefix%'` — no FTS,
   no GIN, no ranking.

Admins get one extra endpoint:

3. `POST /search/reindex` — for the generated-column FTS path this is a
   no-op-with-an-audit-log (the `tsvector` column auto-updates on every
   product write); the endpoint exists so a future swap to Meilisearch /
   manually-maintained tsvector slots in cleanly. Returns
   `{ provider, reindexed: number }`.

The local PostgreSQL DB is the source of truth — the provider abstraction
exists ONLY to make the future Meilisearch swap (setup-guide §"Next steps")
a one-line module rebinding instead of touching every caller. PRD §4 puts
search inside the storefront's golden path so we keep latency tight: the
SearchService NEVER joins more than is needed and NEVER over-fetches.

EXPLICITLY OUT OF SCOPE for this module:

- Searching anything other than products (PRD §4 — categories / orders /
  discounts / chat messages are not searchable from the storefront in MVP).
- Faceted filtering (price ranges, attributes, brand filters) beyond the
  one `categoryId` filter. Defer to a dedicated filtering module.
- Meilisearch / Elasticsearch / Typesense providers. The port exists so
  these swap cleanly later; implementing them is a separate ticket.
- Multilingual stemming variants (es + en columns). MVP uses a single
  tsvector column with the configurable `SEARCH_FTS_LANGUAGE` setting
  (default `simple` for accent-stripping locale-agnostic matches; forks
  with English-primary content swap to `english` via env). Per-locale
  tsvectors are a documented follow-up.
- Trigram fuzzy matching (`pg_trgm`) and "did-you-mean" spell suggest.
  Defer until customer behavior shows it's needed.
- Search analytics / popular-queries tracking. Defer.
- Synonym dictionaries, custom stopwords, custom thesauri. Defer.
- Admin search across orders / customers (admin uses its own filtered list
  endpoints — those already exist on the per-domain modules).
- Storefront search UI / autocomplete dropdown / `/search` page in
  apps/web. The frontend integration is a separate ticket; this PR ships
  the API contract only.

---

SCHEMA (extend EXISTING Product model — ONE hand-rolled migration named
`add-product-search-vector`):

The Prisma schema CANNOT express `tsvector` or `GENERATED ALWAYS AS …
STORED`, so we add the column via raw SQL in the migration. The Prisma
schema needs only an `Unsupported("tsvector")` placeholder so subsequent
introspection / generation doesn't drop the column:

    model Product {
      // … existing fields untouched …
      searchVector Unsupported("tsvector")?
      // … existing relations untouched …

      @@index([searchVector], type: Gin)  // Prisma can express this
      // … existing indexes untouched …
    }

The migration SQL (verbatim shape):

    -- AlterTable — add the generated tsvector column
    ALTER TABLE "Product"
      ADD COLUMN "searchVector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'B')
      ) STORED;

    -- CreateIndex — GIN over the generated column
    CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

    -- CreateIndex — case-insensitive btree for the /suggest prefix-match endpoint
    CREATE INDEX "Product_name_lower_idx" ON "Product" (lower("name"));

`simple` is the FTS configuration name — keep it CONFIGURABLE via the
runtime SQL builder (the column is generated with `'simple'` at the
DDL level, but the search-time `to_tsquery(...)` call uses
`SEARCH_FTS_LANGUAGE` so a fork can switch to `'english'` without
re-migrating, accepting the asymmetric match cost). The plan should
explicitly justify keeping the generated column on `'simple'` vs adding a
second generated column per language — pick one and document the
trade-off.

Application-enforced invariants:

- Service NEVER returns soft-deleted products (`isActive=false`) — the WHERE
  clause must pin `isActive = true` even though the GIN index doesn't know
  about it. Postgres' planner combines the GIN match + the `isActive`
  filter cheaply.
- Search queries are PARAMETERIZED via `Prisma.sql` or `$queryRaw` — NEVER
  string-concatenated, ESPECIALLY for the `to_tsquery` payload (Postgres
  raises on bad operator syntax, so we use `plainto_tsquery` /
  `websearch_to_tsquery` which accept user input directly). The plan
  should pick ONE of `plainto_tsquery` / `websearch_to_tsquery` (we want
  `websearch_to_tsquery` — it supports quoted phrases and `-exclusion`).
- Empty / whitespace-only queries → service returns an empty page result
  WITHOUT hitting the DB. Saves a roundtrip for the storefront's
  uninstrumented search-bar state.
- `q.length > SEARCH_MAX_QUERY_LENGTH` (default 200) → service truncates
  to the cap silently (don't 400 — search UIs paste long things; the
  upstream tsquery handles ~1 MB without issue but truncating at 200 keeps
  log noise sane).

---

Shared types (packages/types/src/search.types.ts — NEW, add to barrel in
src/index.ts alphabetically AFTER `product.types`):

- export interface SearchResultItem<P = Product> {
  product: P;
  score: number;
  snippet: string | null;
  }
- export interface SearchSuggestion {
  name: string;
  slug: string;
  }
- The shared types stay structural — DO NOT import the NestJS
  ProductResponseDto into @repo/types. Generic over `P = Product` so the
  api can specialize to `ProductResponseDto` at its boundary without
  decorator leakage.
- Pure Zod schemas with `satisfies z.ZodType<X>` + inferred types only. No
  class-validator, no `@ApiProperty`. Mirror the shape of
  packages/types/src/newsletter.types.ts.

---

PROVIDER ABSTRACTION (apps/api/src/modules/search/providers/):

Define a port that any backend (Meilisearch, Typesense, Elasticsearch,
Algolia) can implement. Mirror payments/providers + uploads/providers
exactly — same file naming, same DI token approach.

search-provider.interface.ts — NEW:

    /** Verified, normalized search input passed to a provider. */
    export interface SearchInput {
      query: string;            // already trimmed + length-capped by the service
      page: number;             // 1-indexed
      limit: number;            // 1-50
      categoryId?: string;      // pre-validated against existing categories
      locale?: string;          // 'es' | 'en' — informational; current impl ignores
    }

    /** Provider-shaped result item — service maps into the public DTO. */
    export interface ProviderSearchResultItem {
      productId: string;
      score: number;
      snippet: string | null;
    }

    export interface ProviderSearchResult {
      items: ProviderSearchResultItem[];
      total: number;
    }

    export interface ProviderSuggestResult {
      suggestions: { name: string; slug: string }[];
    }

    /**
     * Search-provider port. Swap implementations (Meilisearch, Typesense, …)
     * by binding a different class to SEARCH_PROVIDER in SearchModule — no
     * caller changes required.
     */
    export interface SearchProviderAdapter {
      readonly name: 'postgres-fts' | 'stub';
      search(input: SearchInput): Promise<ProviderSearchResult>;
      suggest(prefix: string, limit: number): Promise<ProviderSuggestResult>;
      /** Bulk repopulate the provider's index. PostgresFts: no-op (the
       *  generated tsvector column updates automatically) + log audit.
       *  Returns `{ reindexed: <count> }` for visibility. */
      reindex(): Promise<{ reindexed: number }>;
    }

    /** DI token for the SearchProviderAdapter interface. */
    export const SEARCH_PROVIDER = 'SEARCH_PROVIDER';

Two implementations:

stub.provider.ts — used when `SEARCH_PROVIDER=stub`. Returns deterministic
empty results so the service unit-tests don't need a DB. Logs
`search.provider.stub.*` events. Mirrors
apps/api/src/modules/uploads/providers/stub.provider.ts.

postgres-fts.provider.ts — real implementation. Injects PrismaService +
ConfigService (for `SEARCH_FTS_LANGUAGE`) + logger + ClsService. Uses
`prisma.$queryRaw<{ id: string; score: number; snippet: string | null }[]>`
with a parameterized SQL template. Recommended query (planner to confirm):

    SELECT
      p.id,
      ts_rank(p."searchVector", websearch_to_tsquery($1, $2)) AS score,
      ts_headline(
        $1,
        coalesce(p."description", p."name"),
        websearch_to_tsquery($1, $2),
        'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MinWords=4,MaxWords=18'
      ) AS snippet
    FROM "Product" p
    WHERE p."isActive" = true
      AND ($3::text IS NULL OR p."categoryId" = $3)
      AND p."searchVector" @@ websearch_to_tsquery($1, $2)
    ORDER BY score DESC, p."createdAt" DESC
    LIMIT $4 OFFSET $5;

(`$1` = SEARCH_FTS_LANGUAGE, `$2` = query, `$3` = nullable categoryId,
`$4` = limit, `$5` = (page-1)_limit). A separate `COUNT(_) … WHERE
searchVector @@ websearch_to_tsquery(…)`query supplies`total`; run both
inside `prisma.$transaction([...])` so the storefront sees a consistent
total / page mapping.

For `suggest`:

    SELECT name, slug FROM "Product"
    WHERE "isActive" = true AND lower("name") LIKE lower($1) || '%'
    ORDER BY name ASC
    LIMIT $2;

`reindex()` for postgres-fts is a no-op that logs `search.provider.postgres_fts.reindex_audit`
and returns `{ reindexed: <count of isActive products> }` for visibility.
The generated column means real reindexing happens automatically on every
Product write.

search.module.ts binds SEARCH_PROVIDER via `useFactory` reading
`SEARCH_PROVIDER` from ConfigService — same pattern as
UploadsModule / NewsletterModule. EXTRACT the binding decision into a
named exported `selectSearchProvider` factory function so the module spec
can exercise it directly (uploads / newsletter precedent — see
uploads.module.ts:34-49).

Fallback chain:

- `SEARCH_PROVIDER=postgres-fts` (default) → PostgresFtsSearchProvider
- `SEARCH_PROVIDER=stub` → StubSearchProvider + log
  `search.module.stub_selected`

BOTH providers expose `name: 'postgres-fts' | 'stub'` so the service can
stamp `provider` in the `reindex` response.

---

REST API ENDPOINTS (controller — `/search`):

PUBLIC (throttled stricter — 30/min per IP via @Throttle to absorb typing
storms from the storefront search bar without giving the bucket away):

GET /search — Query: `?q=&page=&limit=&categoryId=`. Public.
Returns `{ data: SearchResultItemResponseDto[], total, page, limit }`.
Empty/whitespace-only `q` → returns `{ data: [], total: 0, page: 1,
limit: requested }` WITHOUT hitting Prisma.
@Throttle({ default: { limit: 30, ttl: 60_000 } })

GET /search/suggest — Query: `?q=&limit=`. Public. Returns `{ suggestions:
SearchSuggestionResponseDto[] }`. Empty `q` → empty array, no DB call.
Limit hard-capped at 10 server-side regardless of input.
@Throttle({ default: { limit: 60, ttl: 60_000 } })

ADMIN (JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN) — STAFF does NOT
get reindex; mirror the products admin endpoints):

POST /search/reindex — No body. Returns `{ provider: 'postgres-fts'|'stub',
reindexed: number }`. For postgres-fts this is an audit-log no-op.

All endpoints: @ApiTags('search'), @ApiOperation, @ApiResponse, plus
@ApiBearerAuth on the admin endpoint. The public endpoints do NOT need
@ApiHeader documentation — they're anonymous.

---

SERVICE RULES:

SearchService methods:

- `search({ query, page, limit, categoryId? })` — TRIMS the input
  (`query.trim()`), returns empty-page short-circuit on empty string,
  truncates to SEARCH_MAX_QUERY_LENGTH chars, optionally validates
  `categoryId` exists via CategoriesRepository (NotFound on miss — the
  storefront sometimes passes a stale categoryId; better to 404 than
  silently return zero). Delegates to provider.search. Maps each
  `ProviderSearchResultItem` into a public `SearchResultItem<ProductEntity>`
  by fetching the matching products (single `IN (…)` query) and preserving
  the provider's score order. Logs `search.service.search_started` +
  `_succeeded` with `{ query: <first 50 chars>, total, latencyMs }`.
- `suggest(prefix, limit?)` — TRIMS, empty short-circuit, hard-caps limit
  at 10. Delegates to provider.suggest. Maps to `SearchSuggestion[]`.
- `reindex()` — admin-only at the controller layer; service just delegates
  to provider.reindex. Returns `{ provider: provider.name, reindexed }`.
- NEVER imports PrismaService directly. All Prisma access goes through the
  provider (for FTS queries) or through CategoriesRepository (for the
  categoryId existence check) or through ProductsRepository (for the
  post-provider hydration `findManyByIds`).
- Injects ConfigService to read SEARCH_MAX_QUERY_LENGTH.
- Injects @Inject(SEARCH_PROVIDER), CategoriesRepository, ProductsRepository,
  logger, ClsService.

Logging dot-namespaces (mirror uploads.service.\* style):

- search.service.search_started / \_succeeded / \_short_circuit_empty
- search.service.suggest_started / \_succeeded / \_short_circuit_empty
- search.service.reindex_started / \_succeeded
- search.service.category_filter_invalid
- search.provider.postgres_fts.search_succeeded / \_failed
- search.provider.postgres_fts.suggest_succeeded
- search.provider.postgres_fts.reindex_audit
- search.provider.stub.\*
- search.module.stub_selected

SearchRepository — NONE. This module has no domain table of its own; the
"repository" responsibility belongs INSIDE the PostgresFtsSearchProvider
(it's the only thing that talks raw FTS SQL). The provider IS the
repository for this module's queries — keeping `$queryRaw` inside one file
is cleaner than introducing a third tier. (Document this deviation from
the canonical 9-file structure in the plan's Architectural Decisions
section. The other 8 files of the canonical layout still apply.)

ProductsRepository must expose `findManyByIds(ids: string[]): Promise<ProductEntity[]>`
— if it doesn't already, the plan should flag adding it (one-line minimal
change to apps/api/src/modules/products/products.repository.ts, plus
exporting `ProductsRepository` from ProductsModule if not already — verify
the existing exports; uploads already needed this and resolved it).

CategoriesRepository must expose `findById(id): Promise<CategoryEntity | null>`
— verify it exists; if not, the plan should flag adding it as a minimal
change.

---

CONFIG (apps/api/src/config/configuration.ts — extend ConfigSchema):

    SEARCH_PROVIDER:           z.enum(['postgres-fts','stub']).default('postgres-fts'),
    SEARCH_FTS_LANGUAGE:       z.string().default('simple'),
    SEARCH_MAX_QUERY_LENGTH:   z.coerce.number().int().min(20).max(2000).default(200),
    SEARCH_HIGHLIGHT_ENABLED:  z.coerce.boolean().default(true),

(`SEARCH_FTS_LANGUAGE` is a free-form string because Postgres' FTS configs
are extensible — typical values: `'simple'`, `'english'`, `'spanish'`.
Validate at the SQL boundary, NOT in the Zod schema, since a fork may
install custom dictionaries.)

Update `.env.example` with all four keys + comments matching the existing
RESEND_API_KEY / STRIPE_SECRET_KEY / newsletter style. Header comment:
`# Search. SEARCH_PROVIDER picks the adapter (postgres-fts is the MVP; meilisearch later).`

---

DEPENDENCIES to install in apps/api:

NONE. Postgres FTS is built into PostgreSQL — no extension needed for
`tsvector` / `ts_rank` / `websearch_to_tsquery`. We deliberately avoid
`pg_trgm` (used only for fuzzy/typo search, deferred).

Verify Prisma 7 supports `Unsupported("tsvector")` + `@@index(..., type:
Gin)` — both have shipped since Prisma 4 (preview) and 5 (stable). The
plan should call this out in the GOTCHA section and link the relevant
Prisma docs snippet from memory if appropriate.

---

DTOs:

SearchQueryDto (public):
@ApiProperty({ example: 'wireless headphones', maxLength: 200 })
@IsString() @MaxLength(200) @Transform(({ value }) => String(value).trim()) q: string;
@ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
@IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
@ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50, default: 20 })
@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
@ApiPropertyOptional({ example: 'cat_abc123' })
@IsOptional() @IsString() categoryId?: string;

SuggestQueryDto (public):
@ApiProperty({ example: 'wir', maxLength: 50 })
@IsString() @MaxLength(50) @Transform(({ value }) => String(value).trim()) q: string;
@ApiPropertyOptional({ example: 8, minimum: 1, maximum: 10, default: 8 })
@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) limit?: number;

ReindexResponseDto:
{ provider: 'postgres-fts' | 'stub'; reindexed: number }

SearchResultItemResponseDto (outbound):
{ product: ProductResponseDto; score: number; snippet: string | null }

- Static `from(item: { product: ProductEntity; score: number; snippet: string | null }): SearchResultItemResponseDto`
  that wraps `ProductResponseDto.from(item.product)` and copies score +
  snippet.

SearchSuggestionResponseDto:
{ name: string; slug: string }

SearchResultsResponseDto:
{ data: SearchResultItemResponseDto[]; total: number; page: number; limit: number }

- Pagination shape matches PaginatedResponse<T> from @repo/types.

---

TESTS (co-located .spec.ts):

There is NO new test factory — search reuses
`apps/api/test/factories/product.factory.ts` (`createMockProduct`) and
`category.factory.ts` (`createMockCategory`).

Provider tests:

- `providers/stub.provider.spec.ts` (3 cases):
  - search returns empty result
  - suggest returns empty array
  - reindex returns `{ reindexed: 0 }`

- `providers/postgres-fts.provider.spec.ts` (6 cases) — mock PrismaService's
  `$queryRaw` + `$transaction` via `jest.Mocked<Pick<PrismaService,
'$queryRaw' | '$transaction'>>`. Cover:
  - search assembles a `$transaction([dataQuery, countQuery])` and returns
    `{ items, total }` mapped from the raw rows
  - search short-circuits ONLY in the service layer — provider always
    queries (assert raw SQL contains `websearch_to_tsquery` and
    `ts_headline`)
  - search WITH categoryId binds the parameter
  - search WITHOUT categoryId binds null
  - suggest binds `lower($1) || '%'` and respects the limit
  - reindex returns `{ reindexed: count(isActive=true) }` without writes
    (assert no `$executeRaw` calls)

search.service.spec.ts (every branch):

- search(empty string) — short-circuits, returns empty page, provider NOT
  called
- search(whitespace) — short-circuits as above
- search(long string > 200 chars) — truncates silently to 200; provider
  receives the truncated query
- search(valid query) — provider called, returns items, service hydrates
  via productsRepository.findManyByIds and preserves provider order
- search(valid query, valid categoryId) — categoriesRepository.findById
  hit, query proceeds
- search(valid query, missing categoryId) — categoriesRepository.findById
  returns null → NotFoundException
- search — products that don't exist in the IN-query result are silently
  dropped (eventual consistency — the search index can briefly outlive a
  delete; we do NOT 500)
- suggest(empty) — short-circuits
- suggest(valid) — provider called, limit hard-capped at 10
- reindex — delegates to provider, returns `{ provider: 'postgres-fts',
reindexed: <n> }`

search.controller.spec.ts:

- GET /search returns paginated shape; SearchResultItemResponseDto
  embeds ProductResponseDto (assert deep)
- GET /search/suggest returns `{ suggestions: [...] }`
- GET /search empty q → 200 with empty `data` (no service call)
- POST /search/reindex (non-admin) → 403
- POST /search/reindex (admin) → calls service.reindex
- POST /search/reindex (STAFF) → 403 (only ADMIN gets reindex)

search.module.spec.ts (mirror uploads.module.spec.ts pattern):

- `selectSearchProvider` factory:
  - SEARCH_PROVIDER=postgres-fts → PostgresFtsSearchProvider
  - SEARCH_PROVIDER=stub → StubSearchProvider + log
    `search.module.stub_selected`
- onModuleInit is NOT exercised (postgres-fts has no boot-time side effect
  in the MVP; if the plan introduces one, add a case)

Register SearchModule in apps/api/src/app.module.ts alphabetically: after
ProductsModule and before UploadsModule (P-r-o-d, S-e-a-r-c-h, U-p-l-o-a-d-s
→ insert between Products and Uploads).

---

VALIDATE after implementation:

docker compose up -d postgres redis
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate -- --name add-product-search-vector
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api lint
pnpm --filter @repo/api test
pnpm --filter @repo/api dev

# End-to-end smoke — anonymous search

curl -s 'http://localhost:3001/search?q=headphones&limit=5'

# Expect: { data: [{ product: {...}, score: <number>, snippet: '<mark>...' }],

# total: <n>, page: 1, limit: 5 }

# Score must be a number > 0 for a matching seed product.

# Multi-word + websearch syntax

curl -s 'http://localhost:3001/search?q=%22classic+tee%22'
curl -s 'http://localhost:3001/search?q=tee+-shirt'

# Expect: phrase search and negative-term search both behave as the

# storefront would expect from a Google-style box.

# CategoryId filter

CAT=$(curl -s http://localhost:3001/categories | jq -r '.[0].id')
curl -s "http://localhost:3001/search?q=tee&categoryId=$CAT"

# Expect: only that category's matches.

# Empty query short-circuit

curl -s 'http://localhost:3001/search?q='

# Expect: { data: [], total: 0, page: 1, limit: 20 }; check API logs

# show search.service.search_short_circuit_empty (no Prisma query).

# Suggest

curl -s 'http://localhost:3001/search/suggest?q=wir'

# Expect: { suggestions: [{ name: 'Wireless Headphones', slug: 'wireless-headphones' }, ...] }

# Admin reindex

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

curl -s -X POST http://localhost:3001/search/reindex \
 -H "Authorization: Bearer $TOKEN"

# Expect: { provider: 'postgres-fts', reindexed: <count of active products> }

# RBAC

curl -s -X POST http://localhost:3001/search/reindex

# Expect: 401

# Stub-mode smoke — set SEARCH_PROVIDER=stub in .env, restart API:

curl -s 'http://localhost:3001/search?q=headphones'

# Expect: { data: [], total: 0, page: 1, limit: 20 }; logs show

# search.module.stub_selected at boot.

open http://localhost:3001/docs # /search section shows 3 endpoints
