# Feature: categories-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Build the `categories` NestJS module under `apps/api/src/modules/categories/`, mirroring the
canonical `products` module **exactly** (same 9-file structure, same Controller → Service →
Repository layering, same test approach). Categories form a **self-referential hierarchy**: each
category has an optional `parentId` (self-relation `CategoryHierarchy`) and many children. The
module exposes public read endpoints (flat list + nested tree + by-slug) and admin-only write
endpoints (create / update / delete) guarded by JWT + RBAC.

The defining domain complexity vs. products:

- **Tree shape**: a `/categories/tree` endpoint returns root categories with their children nested.
- **Cycle prevention**: `update` must reject setting `parentId` to self or to a descendant.
- **Referential safety on delete**: cannot delete a category that still has products assigned, nor
  one that still has children (would orphan rows). Both throw `ConflictException`.

## User Story

As a store administrator
I want to organize products into a hierarchy of categories
So that customers can browse the catalog by nested category and products are never orphaned.

## Problem Statement

The catalog currently has products but no way to group or navigate them. The `Category` Prisma model
and the `@repo/types` `Category` interface already exist, but there is no API surface to read or
manage categories, and no protection against creating cyclic hierarchies or orphaning products.

## Solution Statement

Implement a full categories module copied from the products pattern, adding hierarchy-specific
behaviour (tree assembly, cycle detection, delete guards) in the **service** layer and the
corresponding Prisma queries (`findRoots` with included children, `countProductsByCategoryId`,
`countChildrenById`) in the **repository** layer. Register the module in `app.module.ts`.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

Mirror these 1:1 — the categories files are structural copies with hierarchy logic swapped in:

- `apps/api/src/modules/products/products.controller.ts` — Why: exact controller shape — public
  `@Get()` / `@Get(':slug')`, admin `@Post`/`@Patch(':id')`/`@Delete(':id')` with
  `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` + `@ApiBearerAuth()`, response
  mapping via `ResponseDto.from(...)`, `@HttpCode` on create (201) and remove (204).
- `apps/api/src/modules/products/products.service.ts` — Why: service idioms — `slugify()` helper
  (copy verbatim, lines 19-26), CLS `requestId`, dot-namespaced Winston logs at operation
  boundaries, conflict/notfound throwing, the `patch` object built only from defined DTO fields
  (lines 104-109) to respect `exactOptionalPropertyTypes`.
- `apps/api/src/modules/products/products.repository.ts` — Why: repository idioms — `PrismaService`
  injection, `toEntity` mapping (lines 92-105), `findUnique`, internal `CreateData`/`UpdateData`
  interfaces. Note `$transaction` array form (lines 58-61) for combined queries.
- `apps/api/src/modules/products/products.module.ts` — Why: module wiring (imports `PrismaModule`,
  registers controller + service + repository).
- `apps/api/src/modules/products/dto/create-product.dto.ts` — Why: DTO pattern — `implements
Pick<Product, ...>` from `@repo/types`, `@ApiProperty`/`@ApiPropertyOptional` + class-validator on
  every field, `name!: string` definite-assignment, optional fields default to `null`.
- `apps/api/src/modules/products/dto/update-product.dto.ts` — Why: `PartialType` from
  `@nestjs/swagger` (NOT `@nestjs/mapped-types`).
- `apps/api/src/modules/products/dto/product-response.dto.ts` — Why: response DTO with static
  `from(entity)` mapper; dates → `.toISOString()`.
- `apps/api/src/modules/products/entities/product.entity.ts` — Why: entity `implements <Type>` from
  `@repo/types` with definite-assignment fields.
- `apps/api/src/modules/products/products.service.spec.ts` — Why: service test pattern — **direct
  instantiation** `new ProductsService(mockRepo, mockLogger, mockCls)` (NOT `Test.createTestingModule`),
  `jest.Mocked<Pick<Repository, ...>>`, `mockCls.getId` returns `'req-id'`.
- `apps/api/src/modules/products/products.controller.spec.ts` — Why: controller test pattern +
  the **RolesGuard test block** (lines 106-155) — copy the `makeContext(userRole?)` helper and the
  four guard assertions verbatim into the categories controller spec.
- `apps/api/test/factories/product.factory.ts` — Why: factory pattern (module-level `counter`,
  `Partial<T>` overrides, `String(n)` casts to satisfy strict lint).
- `packages/types/src/category.types.ts` — Why: the **existing** `Category` interface to implement
  (DO NOT add decorators here). Fields: `id, name, slug, parentId: string | null, createdAt, updatedAt`.
- `packages/types/src/index.ts` — Why: confirms `category.types` is already re-exported (line 1) —
  no change needed.
- `apps/api/src/common/guards/roles.guard.ts` + `apps/api/src/common/decorators/roles.decorator.ts`
  — Why: the guard + `@Roles(...)` decorator the admin endpoints use.
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — Why: the auth guard import path used by
  protected endpoints (`@/modules/auth/guards/jwt-auth.guard`).
- `apps/api/prisma/schema.prisma` (lines 41-54) — Why: the `Category` model — **DO NOT MODIFY**.
  `slug @unique`, `parentId String?`, self-relation `CategoryHierarchy` with `onDelete: SetNull`,
  `children Category[]`, `products Product[]`, `@@index([parentId])`.

### New Files to Create

NestJS module (9 files, mirroring products):

- `apps/api/src/modules/categories/categories.module.ts`
- `apps/api/src/modules/categories/categories.controller.ts`
- `apps/api/src/modules/categories/categories.service.ts`
- `apps/api/src/modules/categories/categories.repository.ts`
- `apps/api/src/modules/categories/dto/create-category.dto.ts`
- `apps/api/src/modules/categories/dto/update-category.dto.ts`
- `apps/api/src/modules/categories/dto/category-response.dto.ts`
- `apps/api/src/modules/categories/entities/category.entity.ts`
- `apps/api/src/modules/categories/categories.controller.spec.ts`
- `apps/api/src/modules/categories/categories.service.spec.ts`

Test factory:

- `apps/api/test/factories/category.factory.ts`

### Patterns to Follow

- **Naming**: kebab-case files, PascalCase classes, camelCase verb-first methods (CLAUDE.md §4).
- **Layer separation**: Controller routes only; Service holds all hierarchy logic; Repository holds
  all Prisma. **Service never imports `PrismaService`** (CLAUDE.md §3, AI rule #3).
- **DTOs implement `@repo/types`** + both `class-validator` and `@ApiProperty` on every field (§7).
- **Logging**: `nest-winston` structured JSON, dot-namespaced `category.service.<verb>_<state>`,
  always include `requestId` from `this.cls.getId()` (§5).
- **Errors**: `NotFoundException` (404), `ConflictException` (409), `BadRequestException` (400) (§7).
- **`exactOptionalPropertyTypes`**: build update `patch` objects by conditional assignment, never
  pass `undefined` explicitly (mirror products.service lines 104-109).

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (types + entity + DTOs)

`@repo/types` `Category` already exists — no change. Create the entity implementing it, then the
three DTOs. The tree needs a children-bearing response shape (see Task 4 — `CategoryTreeResponseDto`).

### Phase 2: Core Implementation (repository → service → controller)

Repository first (pure Prisma), then service (hierarchy rules), then controller (routing). This
order lets each layer's spec mock the layer below.

### Phase 3: Integration

Register `CategoriesModule` in `app.module.ts` (import + add to `imports` array, alphabetical with
existing `@/modules/...` imports).

### Phase 4: Testing & Validation

Factory + service spec (NotFound, dup-slug Conflict, products-assigned Conflict, children-exist
Conflict, self-parent BadRequest, descendant-cycle BadRequest) + controller spec (routing + RolesGuard
block). Run the validation gate.

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom.

### Task 1 — CREATE `apps/api/src/modules/categories/entities/category.entity.ts`

- **IMPLEMENT**: `CategoryEntity implements Category` with definite-assignment fields `id, name,
slug, parentId: string | null, createdAt: Date, updatedAt: Date`. Add an OPTIONAL
  `children?: CategoryEntity[]` field (NOT part of the `Category` interface — extra field is allowed)
  to carry nested children for the tree endpoint.
- **PATTERN**: `apps/api/src/modules/products/entities/product.entity.ts`.
- **IMPORTS**: `import type { Category } from '@repo/types';`
- **GOTCHA**: `children` must be optional (`?`) so flat `findAll` rows that don't load it still
  satisfy the type. Do not make `CategoryEntity` require `children`.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 2 — CREATE `apps/api/src/modules/categories/dto/create-category.dto.ts`

- **IMPLEMENT**: `CreateCategoryDto implements Pick<Category, 'name'>`. Field `name!: string` with
  `@ApiProperty({ example: 'Electronics', maxLength: 100 })` + `@IsString() @IsNotEmpty()
@MaxLength(100)`. Field `parentId?: string` with `@ApiPropertyOptional({ example: 'cat_abc123' })`
  - `@IsOptional() @IsString()`. Do NOT default `parentId` to `null` (it's `string | undefined`,
    not in the `Pick`); leave it undefined when omitted.
- **PATTERN**: `dto/create-product.dto.ts`.
- **IMPORTS**: `ApiProperty, ApiPropertyOptional` from `@nestjs/swagger`; `IsNotEmpty, IsOptional,
IsString, MaxLength` from `class-validator`; `import type { Category } from '@repo/types'`.
- **GOTCHA**: `Pick<Category, 'name'>` only — `parentId` is an extra optional input field, so the
  class implements just `name`. Keep `name` definite (`!`).
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 3 — CREATE `apps/api/src/modules/categories/dto/update-category.dto.ts`

- **IMPLEMENT**: `export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}`.
- **PATTERN**: `dto/update-product.dto.ts`.
- **IMPORTS**: `PartialType` from `@nestjs/swagger` (NOT `@nestjs/mapped-types`); `CreateCategoryDto`.
- **GOTCHA**: `PartialType` makes both `name` and `parentId` optional — `update` can change parent.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 4 — CREATE `apps/api/src/modules/categories/dto/category-response.dto.ts`

- **IMPLEMENT**: Two classes in this file:
  1. `CategoryResponseDto` — fields `id, name, slug` (`@ApiProperty`), `parentId: string | null`
     (`@ApiProperty({ nullable: true })`), `createdAt`/`updatedAt` as ISO strings (`@ApiProperty`).
     Static `from(entity: Category): CategoryResponseDto` mapper; dates → `.toISOString()`.
  2. `CategoryTreeResponseDto extends CategoryResponseDto` — adds
     `@ApiProperty({ type: () => [CategoryTreeResponseDto] }) children!: CategoryTreeResponseDto[]`.
     Static `fromTree(entity: CategoryEntity): CategoryTreeResponseDto` — maps base fields then
     `dto.children = (entity.children ?? []).map(c => CategoryTreeResponseDto.fromTree(c))`.
- **PATTERN**: `dto/product-response.dto.ts` (the static `from` mapper + ISO date conversion).
- **IMPORTS**: `ApiProperty` from `@nestjs/swagger`; `import type { Category } from '@repo/types'`;
  `import type { CategoryEntity } from '../entities/category.entity'`.
- **GOTCHA**: `from()` takes the `Category` interface (works for flat rows). `fromTree()` takes
  `CategoryEntity` because it reads the extra `children` field. Use `() => [CategoryTreeResponseDto]`
  lazy type in `@ApiProperty` so Swagger renders the recursive shape without a circular-ref crash.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 5 — CREATE `apps/api/src/modules/categories/categories.repository.ts`

- **IMPLEMENT**: `@Injectable() CategoriesRepository` injecting `PrismaService`. Internal
  `CreateData { name; slug; parentId: string | null }` and `UpdateData { name?; slug?; parentId? }`
  interfaces. Methods:
  - `findAll(): Promise<CategoryEntity[]>` — `prisma.category.findMany({ orderBy: { name: 'asc' } })`,
    map each via `toEntity`.
  - `findRoots(): Promise<CategoryEntity[]>` — `findMany({ where: { parentId: null }, include:
{ children: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } })`; map via
    `toEntityWithChildren`.
  - `findBySlug(slug): Promise<CategoryEntity | null>` — `findUnique({ where: { slug } })`.
  - `findById(id): Promise<CategoryEntity | null>` — `findUnique({ where: { id } })`.
  - `create(data: CreateData): Promise<CategoryEntity>`.
  - `update(id, data: UpdateData): Promise<CategoryEntity>`.
  - `delete(id): Promise<void>` — `await prisma.category.delete({ where: { id } })` (hard delete;
    categories have no `isActive` column — this is NOT a soft delete like products).
  - `countProductsByCategoryId(id): Promise<number>` — `prisma.product.count({ where:
{ categoryId: id } })`.
  - `countChildrenById(id): Promise<number>` — `prisma.category.count({ where: { parentId: id } })`.
  - Private `toEntity(row: PrismaCategory): CategoryEntity` and `toEntityWithChildren(row: PrismaCategory
& { children: PrismaCategory[] }): CategoryEntity` (sets `e.children = row.children.map(toEntity)`).
- **PATTERN**: `products.repository.ts` (`toEntity` mapping, `CreateData`/`UpdateData`,
  `PrismaService` injection).
- **IMPORTS**: `Injectable` from `@nestjs/common`; `import type { Category as PrismaCategory } from
'@prisma/client'`; `PrismaService` from `@/prisma/prisma.service`; `CategoryEntity` from
  `./entities/category.entity`.
- **GOTCHA**: Category has NO `isActive` — `delete` is a real Prisma `delete`. `parentId` in
  `toEntity` is `row.parentId` (already `string | null`). For `include: { children }`, the Prisma
  return type is `Category & { children: Category[] }` — type the helper accordingly. Run
  `prisma:generate` first if `@prisma/client` types are missing (see Task 11 gotcha).
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 6 — CREATE `apps/api/src/modules/categories/categories.service.ts`

- **IMPLEMENT**: `@Injectable() CategoriesService` injecting `CategoriesRepository`,
  `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger: LoggerService`, `cls: ClsService`. Copy the
  `slugify()` free function verbatim from products.service (lines 19-26). Methods:
  - `findAll(): Promise<CategoryEntity[]>` → `repository.findAll()`.
  - `findTree(): Promise<CategoryEntity[]>` → `repository.findRoots()` (children already nested).
  - `findBySlug(slug): Promise<CategoryEntity>` → throw `NotFoundException(\`Category "${slug}" not
    found\`)` if null.
  - `create(dto): Promise<CategoryEntity>` — log `category.service.create_started`; `slug =
slugify(dto.name)`; if `repository.findBySlug(slug)` exists throw `ConflictException`; if
    `dto.parentId` provided, verify parent exists via `repository.findById` else throw
    `NotFoundException(\`Parent category "${dto.parentId}" not found\`)`; create with `parentId:
    dto.parentId ?? null`; log `create_succeeded`with`categoryId`.
  - `update(id, dto): Promise<CategoryEntity>` — log `update_started`; load `current` via `findById`
    (throw `NotFoundException` if null); if `dto.name` changed, regenerate slug + uniqueness check
    (mirror products.service lines 93-102); if `dto.parentId !== undefined`, run **cycle guard**
    (see GOTCHA): reject self (`dto.parentId === id` → `BadRequestException('A category cannot be its
own parent')`), verify the new parent exists, and walk the new parent's ancestor chain — if `id`
    appears, throw `BadRequestException('Cannot move a category under one of its own descendants')`.
    Build `patch` by conditional assignment (only defined fields); call `repository.update`; log
    `update_succeeded`.
  - `remove(id): Promise<void>` — log `remove_started`; load via `findById` (throw `NotFoundException`);
    if `repository.countProductsByCategoryId(id) > 0` throw `ConflictException('Cannot delete a
category that has products assigned')`; if `repository.countChildrenById(id) > 0` throw
    `ConflictException('Cannot delete a category that has children; delete the children first')`;
    `repository.delete(id)`; log `remove_succeeded`.
  - Private `async assertNoCycle(categoryId: string, newParentId: string): Promise<void>` — walk up:
    `let cursor: string | null = newParentId; while (cursor) { if (cursor === categoryId) throw new
BadRequestException(...); const node = await this.repository.findById(cursor); cursor = node?.parentId
?? null; }`. (Also serves the existence check via the first `findById`.)
- **PATTERN**: `products.service.ts` — logging, CLS, slugify, conditional `patch`, throw idioms.
- **IMPORTS**: `BadRequestException, ConflictException, Inject, Injectable, LoggerService,
NotFoundException` from `@nestjs/common`; `WINSTON_MODULE_NEST_PROVIDER` from `nest-winston`;
  `ClsService` from `nestjs-cls`; type-only DTO + entity imports; `CategoriesRepository`.
- **GOTCHA**: NEVER import `PrismaService` here. The cycle walk has a natural termination (root's
  `parentId` is null); a malformed pre-existing cycle in data could loop — acceptable for MVP since
  `assertNoCycle` is the only writer and it prevents creating them. `parentId` patch value when
  clearing to root: if `dto.parentId` is explicitly provided as a falsy-but-defined value, decide
  policy — for MVP treat any provided `dto.parentId` string as a set; clearing-to-root is out of
  scope unless `dto.parentId === null` is sent (PartialType allows undefined, not null, so clearing
  is not exposed). Document this in NOTES.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 7 — CREATE `apps/api/src/modules/categories/categories.controller.ts`

- **IMPLEMENT**: `@ApiTags('categories') @Controller('categories')`, constructor injects
  `CategoriesService`. Endpoints:
  - `@Get() findAll(): Promise<CategoryResponseDto[]>` → `(await service.findAll()).map(c =>
CategoryResponseDto.from(c))`. `@ApiOperation` "List all categories (flat)".
  - `@Get('tree') findTree(): Promise<CategoryTreeResponseDto[]>` → `(await service.findTree()).map(c =>
CategoryTreeResponseDto.fromTree(c))`. **Declare BEFORE `@Get(':slug')`** so `tree` isn't captured
    as a slug param.
  - `@Get(':slug') findOne(@Param('slug') slug): Promise<CategoryResponseDto>` →
    `CategoryResponseDto.from(await service.findBySlug(slug))`.
  - `@Post()` admin — `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
@HttpCode(HttpStatus.CREATED)`; body `CreateCategoryDto` → `CategoryResponseDto.from(await
service.create(dto))`.
  - `@Patch(':id')` admin — same guards; `CategoryResponseDto.from(await service.update(id, dto))`.
  - `@Delete(':id')` admin — same guards + `@HttpCode(HttpStatus.NO_CONTENT)`; `await
service.remove(id)` returns void.
  - Add `@ApiResponse` codes mirroring products (200/201/204/401/403/404/409 as appropriate; add
    `409` on POST and DELETE, `400` on PATCH for the cycle error).
- **PATTERN**: `products.controller.ts` (verbatim guard/decorator stack + response mapping).
- **IMPORTS**: `Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards`
  from `@nestjs/common`; `ApiBearerAuth, ApiOperation, ApiResponse, ApiTags` from `@nestjs/swagger`;
  `UserRole` from `@prisma/client`; `Roles` from `@/common/decorators/roles.decorator`; `RolesGuard`
  from `@/common/guards/roles.guard`; `JwtAuthGuard` from `@/modules/auth/guards/jwt-auth.guard`;
  local DTOs + service.
- **GOTCHA**: **Route ordering** — `tree` is a static segment that MUST be registered before the
  `:slug` dynamic route, otherwise `/categories/tree` resolves to `findBySlug('tree')`. No `@Query`
  DTO needed (flat list is unpaginated per domain rules).
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 8 — CREATE `apps/api/src/modules/categories/categories.module.ts`

- **IMPLEMENT**: `@Module({ imports: [PrismaModule], controllers: [CategoriesController], providers:
[CategoriesService, CategoriesRepository] })`.
- **PATTERN**: `products.module.ts` (1:1).
- **IMPORTS**: `Module` from `@nestjs/common`; `PrismaModule` from `@/prisma/prisma.module`; local
  controller / service / repository.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 9 — UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: Add `import { CategoriesModule } from '@/modules/categories/categories.module';`
  in the `@/modules/...` import group (alphabetical — after `auth`, before `health`). Add
  `CategoriesModule` to the `imports` array (place near `ProductsModule`, keep readable grouping).
- **PATTERN**: existing `ProductsModule` registration (lines 12, 34).
- **GOTCHA**: import-x/order lint is strict — keep the monorepo-internal `@/...` imports sorted; run
  lint and let `--fix` reorder if needed.
- **VALIDATE**: `pnpm --filter @repo/api lint`

### Task 10 — CREATE `apps/api/test/factories/category.factory.ts`

- **IMPLEMENT**: `createMockCategory(overrides: Partial<Category> = {}): Category` with module-level
  `let counter = 0`, `const n = ++counter`, returning `{ id: \`category-${String(n)}\`, name: \`Test
  Category ${String(n)}\`, slug: \`test-category-${String(n)}\`, parentId: null, createdAt: new
  Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides }`.
- **PATTERN**: `apps/api/test/factories/product.factory.ts` (1:1 structure).
- **IMPORTS**: `import type { Category } from '@repo/types';`
- **GOTCHA**: Use `String(n)` in template literals — strict lint forbids implicit number→string.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 11 — CREATE `apps/api/src/modules/categories/categories.service.spec.ts`

- **IMPLEMENT**: Direct-instantiation pattern. `mockRepo: jest.Mocked<Pick<CategoriesRepository,
'findAll' | 'findRoots' | 'findBySlug' | 'findById' | 'create' | 'update' | 'delete' |
'countProductsByCategoryId' | 'countChildrenById'>>` with all `jest.fn()`. `mockLogger = { log,
error, warn }`, `mockCls = { getId: () => 'req-id' }`. `beforeEach` → `new CategoriesService(...)`,
  `jest.clearAllMocks()`, reset `mockCls.getId`. Required test cases:
  - `findBySlug` throws `NotFoundException` when repo returns null.
  - `create` throws `ConflictException` on duplicate slug (`findBySlug` returns existing).
  - `create` generates slug from name (assert `repo.create` called with `slug: 'test-category'`).
  - `remove` throws `ConflictException` when `countProductsByCategoryId` > 0 (mock `findById` →
    category, `countProductsByCategoryId` → 1).
  - `remove` throws `ConflictException` when `countChildrenById` > 0 (products count 0, children 1).
  - `update` throws `BadRequestException` on self-parent (`dto.parentId === id`).
  - `update` throws `BadRequestException` on descendant cycle: `findById(id)` → category `c1`;
    set `dto.parentId = 'c2'`; mock the ancestor walk so `findById('c2')` → `{ ...c2, parentId: 'c1' }`
    making `c1` an ancestor of `c2` → cycle. Verify `repo.update` NOT called.
  - (Optional) `findTree` delegates to `repo.findRoots`.
- **PATTERN**: `products.service.spec.ts` (mock setup + direct instantiation + assertion style).
- **IMPORTS**: `BadRequestException, ConflictException, NotFoundException` from `@nestjs/common`;
  `type LoggerService` from `@nestjs/common`; `type ClsService` from `nestjs-cls`; `createMockCategory`
  from `../../../test/factories/category.factory`; local types + `CategoriesService`.
- **GOTCHA**: If typecheck/tests fail with `@prisma/client has no exported member` errors, the Prisma
  client isn't generated locally — run `pnpm --filter @repo/api prisma:generate` once (this is a
  known pre-existing local-env step, not a code defect). Cast factory results with `as unknown as
CategoryEntity` when feeding repo mocks (products.spec does the same).
- **VALIDATE**: `pnpm --filter @repo/api test`

### Task 12 — CREATE `apps/api/src/modules/categories/categories.controller.spec.ts`

- **IMPLEMENT**: `mockService` with `findAll, findTree, findBySlug, create, update, remove` jest.fns.
  Direct instantiation `new CategoriesController(mockService as unknown as CategoriesService)`. Cases:
  - `findAll` delegates + maps to response DTOs (assert `createdAt` is a `string`).
  - `findTree` delegates to `service.findTree` and returns tree DTOs with `children` arrays.
  - `findOne` delegates with the slug.
  - `create` / `update` / `remove` delegate with correct args.
  - **Append the `RolesGuard` describe block verbatim** from `products.controller.spec.ts`
    (lines 106-155) — `makeContext(userRole?)`, allows-no-roles, allows-admin, forbids-non-admin,
    unauthorized-when-no-user. This satisfies "admin guard rejects non-admin".
- **PATTERN**: `products.controller.spec.ts`.
- **IMPORTS**: same as products controller spec (`ExecutionContext`, `ForbiddenException`,
  `UnauthorizedException`, `Reflector`, `UserRole`, `RolesGuard`, `createMockCategory`, local types).
- **VALIDATE**: `pnpm --filter @repo/api test`

---

## TESTING STRATEGY

### Unit Tests (Backend)

Jest, co-located `*.spec.ts`, direct instantiation (NOT `Test.createTestingModule`) to match the
products pattern. Mock the repository with `jest.Mocked<Pick<...>>`; mock logger + CLS as plain
objects. Use `createMockCategory()` from the factory — never hardcode category objects inline.
Coverage threshold is 80% but is only enforced by `test:cov`; the documented gate is
`pnpm --filter @repo/api test`.

### E2E Tests (Frontend)

None for this backend-only task. No Playwright work — the storefront category UI is a later step.

### Edge Cases (must be covered by service spec)

- Duplicate slug on create → 409.
- Update renaming to a slug owned by a different category → 409 (mirror products update test).
- Delete with assigned products → 409.
- Delete with existing children → 409.
- Set parent to self → 400.
- Set parent to a descendant (cycle) → 400.
- `findBySlug` / `findById` missing → 404.
- Create with non-existent `parentId` → 404.

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

> Note: the project's pnpm filter name for the API is `@repo/api` (the prompt's `--filter api` also
> resolves via Turborepo, but prefer `@repo/api` to match how this repo is run).

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm --filter @repo/api lint
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm --filter @repo/api prisma:generate   # run once if @prisma/client types are missing
pnpm --filter @repo/api typecheck
```

### Level 3: Unit Tests (backend)

```bash
pnpm --filter @repo/api test
```

### Level 4: E2E Tests (frontend)

N/A for this task.

### Level 5: Manual Validation

```bash
docker compose up -d            # Postgres + Redis
pnpm --filter @repo/api prisma:migrate   # ensure Category table exists
pnpm --filter @repo/api dev     # starts on :3001
curl http://localhost:3001/categories          # → [] (or seeded flat list)
curl http://localhost:3001/categories/tree      # → [] (root categories w/ nested children)
# open http://localhost:3001/docs → confirm a "categories" section with all 6 endpoints,
#   admin endpoints showing the bearer-auth padlock.
```

Admin write endpoints require a JWT with `ADMIN` role — obtain via the auth module's login, then
`curl -X POST .../categories -H "Authorization: Bearer <token>" -d '{"name":"Electronics"}'`.

---

## ACCEPTANCE CRITERIA

- [ ] All 11 module files + factory created, mirroring the products structure.
- [ ] `GET /categories` (flat), `GET /categories/tree` (nested), `GET /categories/:slug`,
      `POST`, `PATCH /:id`, `DELETE /:id` all present; writes guarded by JWT + ADMIN.
- [ ] Service holds all hierarchy logic; repository holds all Prisma; service does NOT import
      `PrismaService`.
- [ ] Delete blocked (409) when products assigned OR children exist.
- [ ] Update blocked (400) on self-parent and descendant-cycle.
- [ ] `CategoriesModule` registered in `app.module.ts`.
- [ ] `pnpm --filter @repo/api lint` and `typecheck` pass clean.
- [ ] `pnpm --filter @repo/api test` passes; all listed edge cases covered.
- [ ] Swagger `/docs` shows the categories section with all endpoints.
- [ ] No regressions in existing product/auth tests.

---

## NOTES

- **`prisma/schema.prisma` is NOT modified** — the `Category` model already exists. Only
  `prisma:generate` (and `prisma:migrate` if the local DB predates the model) may be needed.
- **Hard delete vs soft delete**: products soft-delete via `isActive=false`; categories have no
  `isActive` column, so `remove` is a real Prisma `delete`. This is intentional and the delete guards
  (products/children checks) are what protect referential integrity.
- **Clearing parent to root is out of scope**: `PartialType` exposes `parentId?: string` (undefined
  when omitted), so the API cannot send `parentId: null` to detach a category to root. If that
  becomes a requirement, add an explicit nullable field + validator later. The cycle guard only runs
  when `dto.parentId !== undefined`.
- **Tree depth**: domain rules say "children nested one level deep". `findRoots` uses
  `include: { children: true }` which yields exactly one level. `CategoryTreeResponseDto.fromTree` is
  written recursively so it still renders correctly if deeper nesting is added later, but the query
  only loads one level — grandchildren are not fetched.
- **Slug source**: `CreateCategoryDto` validates `name` at max 100, while `@repo/types`
  `CategorySchema` allows max 200. The DTO is the API contract (stricter); no conflict at runtime.
- **Cycle-walk safety**: `assertNoCycle` terminates at a null `parentId`. Because it is the only path
  that sets a parent and it rejects cycles, the data can never contain a cycle for it to loop on.

**Confidence Score**: 9/10 — the pattern is fully specified by the products module; the only novel
logic (tree assembly + cycle detection) is small, localized to the service/repository, and fully
unit-tested. The −1 is residual risk in Prisma's `include` return typing under
`exactOptionalPropertyTypes` (handled by the `toEntityWithChildren` helper signature).

**Next step**: Run `/execute plans/categories-module.md` to implement this feature.
