# Feature: cart-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Build the `cart` NestJS module under `apps/api/src/modules/cart/`, following the canonical `products`
module's **layer separation** (Controller → Service → Repository), logging convention, and test
approach. The defining difference: **the cart has NO Prisma model** — all state lives in **Redis**
(`ioredis`, already installed). The repository layer wraps the existing `RedisProvider` instead of
`PrismaService`.

A cart belongs either to a **guest** (`cart:guest:<sessionId>`, sessionId from the `x-cart-session`
header) or an **authenticated user** (`cart:user:<userId>`, from the JWT). Read/mutate endpoints
accept an **optional** JWT: present → user cart; absent → guest cart. After login the client calls
`POST /cart/merge` to fold the guest cart into the user cart.

## User Story

As a shopper (guest or logged-in)
I want my cart to persist across requests and survive logging in
So that I can add items before authenticating and not lose them at checkout.

## Problem Statement

The storefront already fires `POST /cart/items` (`apps/web/src/app/actions/cart.ts`) but there is no
backend cart endpoint. Carts must work for anonymous visitors, persist in Redis with TTLs, validate
products at add-time, and merge cleanly on login — without a database table.

## Solution Statement

Implement a Redis-backed cart module mirroring the products structure. A `CartRepository` wraps
`RedisProvider.client` (get/set/delete JSON blobs with TTL + a `buildKey` helper). `CartService`
holds all business rules (product validation via `ProductsRepository`, quantity rules, merge logic,
dot-namespaced logging). `CartController` resolves identity (user vs guest), echoes the
`X-Cart-Session` header for guests, and exposes 6 endpoints. New optional-auth plumbing
(`OptionalJwtAuthGuard` + `OptionalUser` decorator) lets the same routes serve both modes.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/src/modules/products/products.controller.ts` — Why: controller idioms — `@ApiTags`,
  `@ApiOperation`/`@ApiResponse`, `@UseGuards`, `ResponseDto.from(...)`, `@HttpCode`.
- `apps/api/src/modules/products/products.service.ts` (lines 28-78) — Why: DI of repo + logger +
  `ClsService`, dot-namespaced Winston logs (`<domain>.service.<verb>_<state>`) with `requestId =
this.cls.getId()`, throw idioms.
- `apps/api/src/modules/products/products.repository.ts` — Why: repository shape we mirror, BUT swap
  `PrismaService` for `RedisProvider`. Note `findById(id): Promise<ProductEntity | null>` (lines
  31-34) returns `{ ..., isActive, price (number), name, slug }` — used for add-time validation.
- `apps/api/src/modules/products/products.module.ts` — Why: module wiring. **MUST be edited** to
  `exports: [ProductsRepository]` so CartModule can inject it (see Task 9).
- `apps/api/src/modules/products/dto/create-product.dto.ts` — Why: DTO pattern (`@ApiProperty` +
  class-validator on every field, `!` definite assignment).
- `apps/api/src/modules/products/products.service.spec.ts` — Why: **service test pattern** — direct
  instantiation `new ProductsService(mockRepo, mockLogger, mockCls)`, `jest.Mocked<Pick<...>>`,
  `mockCls.getId` returns `'req-id'`, factory usage, `as unknown as` casts.
- `apps/api/src/modules/products/products.controller.spec.ts` (lines 1-104) — Why: controller test
  pattern (direct instantiation, `mockService`).
- `apps/api/src/modules/health/redis.provider.ts` — Why: **the Redis access pattern**. `RedisProvider`
  is `@Injectable`, exposes `readonly client: Redis` (ioredis). Token const `REDIS_CLIENT` exists but
  the **class** is what's provided/exported — inject `RedisProvider` and use `.client`.
- `apps/api/src/modules/health/health.module.ts` — Why: confirms `exports: [RedisProvider]`. CartModule
  imports `HealthModule` to get it.
- `apps/api/src/modules/auth/decorators/current-user.decorator.ts` — Why: `@CurrentUser()` **THROWS**
  when `req.user` is absent → CANNOT be used on optional-auth routes. We create `@OptionalUser()`
  modeled on it but returning `undefined` instead of throwing.
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` — Why: `JwtAuthGuard extends AuthGuard('jwt')`
  (used on `POST /cart/merge`). The `'jwt'` strategy is registered globally by AuthModule, so guards
  work without importing AuthModule (products uses the same guard without importing it).
- `apps/api/src/modules/auth/entities/user.entity.ts` — Why: `UserEntity` has `id: string` (the
  `cart:user:<id>` key) and `role`.
- `apps/api/src/common/guards/roles.guard.ts` — Why: where the new `OptionalJwtAuthGuard` lives
  (sibling), and `Reflector`/guard test idioms reused in the controller spec.
- `apps/api/src/main.ts` — Why: NO global route prefix (routes at `/cart`), global `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`), Swagger at `/docs`, `.addBearerAuth()`.
- `apps/api/test/factories/product.factory.ts` — Why: factory pattern (module `counter`, `String(n)`
  casts) to mirror in `cart.factory.ts`.
- `apps/api/package.json` (lines 26-58) — Why: confirms `ioredis@^5.10.1` and `uuid@^14` + `@types/uuid`
  are installed — NO new dependency needed.

### New Files to Create

NestJS module (`apps/api/src/modules/cart/`):

- `cart.module.ts`, `cart.controller.ts`, `cart.service.ts`, `cart.repository.ts`
- `dto/add-to-cart.dto.ts`, `dto/update-cart-item.dto.ts`, `dto/merge-cart.dto.ts`,
  `dto/cart-response.dto.ts`
- `cart.controller.spec.ts`, `cart.service.spec.ts`

Shared types + plumbing + factory:

- `packages/types/src/cart.types.ts` — `CartItem`, `Cart` interfaces (no decorators)
- `apps/api/src/common/guards/optional-jwt-auth.guard.ts` — non-throwing JWT guard
- `apps/api/src/modules/auth/decorators/optional-user.decorator.ts` — `@OptionalUser()`
- `apps/api/test/factories/cart.factory.ts` — `createMockCart()`, `createMockCartItem()`

### Patterns to Follow

- **Naming**: kebab-case files, PascalCase classes, camelCase verb-first methods (CLAUDE.md §4).
- **Layer separation**: Controller = HTTP + identity resolution only; Service = all business rules;
  Repository = all Redis. **Service never touches `ioredis` directly** (CLAUDE.md §3).
- **DTOs**: `class-validator` + `@ApiProperty` on every field (§7). Global `ValidationPipe` has
  `forbidNonWhitelisted` — every accepted body field needs a validator decorator or the request 400s.
- **Logging**: `nest-winston` dot-namespaced `cart.service.<verb>_<state>`, always `requestId` (§5).
- **Errors**: `NotFoundException` (404), `BadRequestException` (400) (§7).

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (shared types + optional-auth plumbing)

Add `Cart`/`CartItem` to `@repo/types`. Create `OptionalJwtAuthGuard` and `@OptionalUser()` so the
controller can serve guest + auth on the same route. Export `ProductsRepository` from ProductsModule.

### Phase 2: Core Implementation (repository → service → controller → DTOs)

Redis repository (get/set/delete + buildKey), then service (validation, quantity rules, merge), then
controller (identity resolution, header echo, 6 routes), with DTOs alongside.

### Phase 3: Integration

Register `CartModule` in `app.module.ts` (imports `HealthModule` + `ProductsModule`).

### Phase 4: Testing & Validation

Factory + service spec (create/increment/validate/merge) + controller spec (routing, guest header,
guard rejection). Run the gate.

---

## STEP-BY-STEP TASKS

Execute in order, top to bottom.

### Task 1 — CREATE `packages/types/src/cart.types.ts`

- **IMPLEMENT**: Pure interfaces (no decorators, no Zod required):
  ```ts
  export interface CartItem {
    productId: string;
    name: string;
    slug: string;
    price: number;
    quantity: number;
  }
  export interface Cart {
    items: CartItem[];
  }
  ```
- **PATTERN**: `packages/types/src/category.types.ts` (interface-only file).
- **VALIDATE**: `pnpm --filter @repo/api typecheck` (after Task 2 re-export).

### Task 2 — UPDATE `packages/types/src/index.ts`

- **IMPLEMENT**: Add `export * from './cart.types';` in alphabetical position (before
  `./category.types`).
- **GOTCHA**: Jest maps `@repo/types` → `packages/types/src/index.ts` (see api package.json
  `moduleNameMapper`), so the new export is picked up in tests with no build step.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 3 — CREATE `apps/api/src/common/guards/optional-jwt-auth.guard.ts`

- **IMPLEMENT**: `OptionalJwtAuthGuard extends AuthGuard('jwt')` overriding `handleRequest` so a
  missing/invalid token does NOT throw — it returns `undefined`, letting the request proceed as guest:
  ```ts
  @Injectable()
  export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    handleRequest<TUser = UserEntity>(_err: unknown, user: TUser | false): TUser | undefined {
      return user || undefined;
    }
  }
  ```
- **PATTERN**: `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` (extends `AuthGuard('jwt')`).
- **IMPORTS**: `Injectable` from `@nestjs/common`; `AuthGuard` from `@nestjs/passport`; `type UserEntity`
  from `@/modules/auth/entities/user.entity`.
- **GOTCHA**: The base `handleRequest` signature is `(err, user, info, context, status)`; override with
  a generic to satisfy strict typing. Returning a falsy user as `undefined` (not `false`) keeps
  `req.user` cleanly absent. The `'jwt'` strategy must exist globally — it does (AuthModule registers
  it; guard needs no module import).
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 4 — CREATE `apps/api/src/modules/auth/decorators/optional-user.decorator.ts`

- **IMPLEMENT**: `@OptionalUser()` param decorator returning `UserEntity | undefined` WITHOUT throwing:
  ```ts
  export const OptionalUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): UserEntity | undefined => {
      const req = ctx.switchToHttp().getRequest<Request & { user?: UserEntity }>();
      return req.user;
    },
  );
  ```
- **PATTERN**: `current-user.decorator.ts` (same shape, minus the throw).
- **IMPORTS**: `createParamDecorator, type ExecutionContext` from `@nestjs/common`; `type Request` from
  `express`; `type UserEntity` from `../entities/user.entity`.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 5 — CREATE `apps/api/src/modules/cart/cart.repository.ts`

- **IMPLEMENT**: `@Injectable() CartRepository` injecting `RedisProvider`. No Prisma.
  - `private get redis(): Redis { return this.provider.client; }` (or use `this.provider.client`
    inline).
  - `buildKey(type: 'guest' | 'user', id: string): string` → `` `cart:${type}:${id}` ``.
  - `async getCart(key: string): Promise<Cart | null>` → `const raw = await
this.provider.client.get(key); return raw ? (JSON.parse(raw) as Cart) : null;`
  - `async setCart(key: string, cart: Cart, ttlSeconds: number): Promise<void>` → `await
this.provider.client.set(key, JSON.stringify(cart), 'EX', ttlSeconds);`
  - `async deleteCart(key: string): Promise<void>` → `await this.provider.client.del(key);`
- **PATTERN**: `products.repository.ts` constructor-injection shape (swap dependency).
- **IMPORTS**: `Injectable` from `@nestjs/common`; `type Redis` from `ioredis` (type-only, if used);
  `RedisProvider` from `@/modules/health/redis.provider`; `type { Cart } from '@repo/types'`.
- **GOTCHA**: ioredis `set` with TTL uses the variadic `set(key, value, 'EX', seconds)` overload — keep
  `'EX'` a string literal. `JSON.parse` returns `any`; cast to `Cart` (acceptable here; the data shape
  is owned by this module). Do not add error handling for malformed JSON beyond the cast for MVP.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 6 — CREATE `apps/api/src/modules/cart/cart.service.ts`

- **IMPLEMENT**: `@Injectable() CartService` injecting `CartRepository`, `ProductsRepository`,
  `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger: LoggerService`, `ClsService`. Define and export an
  identity type used across service/controller:
  ```ts
  export interface CartIdentity {
    type: 'guest' | 'user';
    id: string;
  }
  ```
  Constants: `const GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;` `const USER_TTL_SECONDS = 30 * 24 * 60 * 60;`
  Private helpers: `keyFor(identity)` → `this.repository.buildKey(identity.type, identity.id)`;
  `ttlFor(identity)` → guest vs user TTL.
  Methods (all log `cart.service.<verb>_started`/`_succeeded` with `requestId` + identity):
  - `getCart(identity): Promise<Cart>` → `(await repo.getCart(key)) ?? { items: [] }`.
  - `addItem(identity, dto: AddToCartDto): Promise<Cart>` — validate product:
    `const product = await this.products.findById(dto.productId);` if `!product` →
    `NotFoundException(\`Product "${dto.productId}" not found\`)`; if `!product.isActive`→`BadRequestException('Product is not available')`. Load cart (or empty). Find existing item by
`productId`: if present, `item.quantity += dto.quantity`; else push `{ productId, name:
    product.name, slug: product.slug, price: product.price, quantity: dto.quantity }`(price snapshot).`repo.setCart(key, cart, ttl)`; return cart.
  - `updateQuantity(identity, productId, quantity): Promise<Cart>` — if `quantity < 1` →
    `BadRequestException('Quantity must be at least 1')`. Load cart; find item; if missing →
    `NotFoundException(\`Item "${productId}" not in cart\`)`; set `item.quantity = quantity`; save;
    return.
  - `removeItem(identity, productId): Promise<Cart>` — load; if no item with that `productId` →
    `NotFoundException`; `cart.items = cart.items.filter(i => i.productId !== productId)`; save; return.
  - `clear(identity): Promise<Cart>` — `repo.deleteCart(key)`; return `{ items: [] }`.
  - `merge(user: UserEntity, sessionId: string): Promise<Cart>` — `userIdentity = { type: 'user', id:
user.id }`, `guestKey = repo.buildKey('guest', sessionId)`. Load guest cart (`?? {items:[]}`) and
    user cart (`?? {items:[]}`). For each guest item: find match in user cart by `productId` →
    sum quantities; else push. `repo.setCart(userKey, userCart, USER_TTL)`; `repo.deleteCart(guestKey)`;
    return merged user cart. Log `cart.service.merge_succeeded` with counts.
- **PATTERN**: `products.service.ts` (logging, CLS, throw idioms, validation-before-write ordering).
- **IMPORTS**: `BadRequestException, Inject, Injectable, LoggerService, NotFoundException` from
  `@nestjs/common`; `WINSTON_MODULE_NEST_PROVIDER` from `nest-winston`; `ClsService` from `nestjs-cls`;
  `type { Cart } from '@repo/types'`; `ProductsRepository` from
  `@/modules/products/products.repository`; `type UserEntity` from
  `@/modules/auth/entities/user.entity`; local DTO types + `CartRepository`.
- **GOTCHA**: NEVER import `RedisProvider`/`ioredis` here. `ProductsRepository.findById` already maps
  Decimal→`number`, so `product.price` is a plain number for the snapshot. Validate the product BEFORE
  loading/mutating the cart so a bad add never partially writes.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 7 — CREATE the four DTOs in `apps/api/src/modules/cart/dto/`

- **`add-to-cart.dto.ts`**: `AddToCartDto` — `productId!: string` (`@ApiProperty` + `@IsString()
@IsNotEmpty()`); `quantity!: number` (`@ApiProperty({ example: 1, minimum: 1 })` + `@IsInt() @Min(1)`).
- **`update-cart-item.dto.ts`**: `UpdateCartItemDto` — `quantity!: number` (`@ApiProperty` + `@IsInt()
@Min(1)`).
- **`merge-cart.dto.ts`**: `MergeCartDto` — `sessionId!: string` (`@ApiProperty` + `@IsString()
@IsNotEmpty()`).
- **`cart-response.dto.ts`**: two classes —
  - `CartItemDto implements CartItem` with `@ApiProperty` on `productId, name, slug, price, quantity`.
  - `CartResponseDto` with `@ApiProperty({ type: [CartItemDto] }) items!: CartItemDto[]` and
    `@ApiPropertyOptional() sessionId?: string`. Static `from(cart: Cart, sessionId?: string):
CartResponseDto` — copies `items` (cast/assign — items are plain objects matching `CartItemDto`)
    and sets `sessionId` only when provided (conditional assignment for `exactOptionalPropertyTypes`).
- **PATTERN**: `dto/create-product.dto.ts` + `dto/product-response.dto.ts`.
- **IMPORTS**: `ApiProperty, ApiPropertyOptional` from `@nestjs/swagger`; `IsInt, IsNotEmpty, IsString,
Min` from `class-validator`; `type { Cart, CartItem } from '@repo/types'`.
- **GOTCHA**: `forbidNonWhitelisted` is global — do not add fields without validators. In
  `CartResponseDto.from`, assign `dto.items = cart.items` (the runtime objects already match the DTO
  field shape); only set `dto.sessionId` inside an `if (sessionId !== undefined)` block.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 8 — CREATE `apps/api/src/modules/cart/cart.controller.ts`

- **IMPLEMENT**: `@ApiTags('cart') @Controller('cart')`, inject `CartService`. Private helper resolves
  identity and echoes the guest header:
  ```ts
  private resolve(
    user: UserEntity | undefined,
    sessionHeader: string | undefined,
    res: Response,
  ): CartIdentity {
    if (user) return { type: 'user', id: user.id };
    const sessionId = sessionHeader ?? randomUUID();
    res.setHeader('X-Cart-Session', sessionId);
    return { type: 'guest', id: sessionId };
  }
  ```
  Every endpoint takes `@OptionalUser() user`, `@Headers('x-cart-session') session?: string`,
  `@Res({ passthrough: true }) res: Response`, uses `@UseGuards(OptionalJwtAuthGuard)`, builds
  identity, calls the service, and returns `CartResponseDto.from(cart, identity.type === 'guest' ?
identity.id : undefined)`. Endpoints:
  - `@Get()` `getCart` — 200.
  - `@Post('items')` `addItem(@Body() dto: AddToCartDto, ...)` — `@HttpCode(200)` (mutating an existing
    resource; returns the cart). 200/400/404.
  - `@Patch('items/:productId')` `updateItem(@Param('productId') productId, @Body() dto:
UpdateCartItemDto, ...)` — 200/400/404.
  - `@Delete('items/:productId')` `removeItem(@Param('productId') productId, ...)` — 200/404.
  - `@Delete()` `clear` — 200.
  - `@Post('merge')` `merge` — `@UseGuards(JwtAuthGuard)` (NOT optional), `@ApiBearerAuth()`,
    `@CurrentUser() user: UserEntity`, `@Body() dto: MergeCartDto`. Returns merged user cart (no guest
    header). 200/401.
  - `@ApiTags`, `@ApiOperation`, `@ApiResponse` on every endpoint; `@ApiHeader({ name: 'x-cart-session',
required: false })` on the optional-auth endpoints documents the guest header.
- **PATTERN**: `products.controller.ts` (decorator stack, response mapping).
- **IMPORTS**: `Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Res, UseGuards`
  from `@nestjs/common`; `ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags` from
  `@nestjs/swagger`; `type { Response } from 'express'`; `randomUUID` from `node:crypto`;
  `OptionalJwtAuthGuard` from `@/common/guards/optional-jwt-auth.guard`; `JwtAuthGuard` from
  `@/modules/auth/guards/jwt-auth.guard`; `CurrentUser` from
  `@/modules/auth/decorators/current-user.decorator`; `OptionalUser` from
  `@/modules/auth/decorators/optional-user.decorator`; `type UserEntity`; local DTOs + `CartService` +
  `CartIdentity`.
- **GOTCHA**: Use `randomUUID()` from `node:crypto` (zero-dep, already available) rather than the
  `uuid` package — simpler and avoids an import-interop gotcha; both satisfy "uuid v4". `@Res({
passthrough: true })` is REQUIRED so returning the DTO still works while setting a header (without
  `passthrough` Nest expects you to call `res.send` yourself). On the merge route do NOT inject `res`
  for a guest header — there's no guest there.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 9 — UPDATE `apps/api/src/modules/products/products.module.ts`

- **IMPLEMENT**: Add `exports: [ProductsRepository]` to the `@Module` so `CartModule` can inject it.
- **GOTCHA**: Keep `providers` unchanged; just add the `exports` array. Without this, Nest throws a
  "can't resolve ProductsRepository" DI error at boot for CartService.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 10 — CREATE `apps/api/src/modules/cart/cart.module.ts`

- **IMPLEMENT**: `@Module({ imports: [HealthModule, ProductsModule], controllers: [CartController],
providers: [CartService, CartRepository] })`.
- **IMPORTS**: `HealthModule` from `@/modules/health/health.module`; `ProductsModule` from
  `@/modules/products/products.module`; local controller/service/repository.
- **GOTCHA**: `HealthModule` exports `RedisProvider`; `ProductsModule` (after Task 9) exports
  `ProductsRepository`. Both imports are required.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 11 — UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: `import { CartModule } from '@/modules/cart/cart.module';` (alphabetical in the
  `@/modules/...` group — after `auth`/`categories`, before `health`) and add `CartModule` to the
  `imports` array.
- **PATTERN**: existing `CategoriesModule`/`ProductsModule` registration.
- **GOTCHA**: import-x/order is strict — let `lint --fix` reorder if needed.
- **VALIDATE**: `pnpm --filter @repo/api lint`

### Task 12 — CREATE `apps/api/test/factories/cart.factory.ts`

- **IMPLEMENT**: `createMockCartItem(overrides: Partial<CartItem> = {}): CartItem` (module `counter`,
  `String(n)` in template literals) returning `{ productId: \`product-${String(n)}\`, name: \`Test
  Product ${String(n)}\`, slug: \`test-product-${String(n)}\`, price: 29.99, quantity: 1, ...overrides
  }`. `createMockCart(overrides: Partial<Cart> = {}): Cart`returning`{ items: [], ...overrides }`.
- **PATTERN**: `apps/api/test/factories/product.factory.ts`.
- **IMPORTS**: `type { Cart, CartItem } from '@repo/types'`.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### Task 13 — CREATE `apps/api/src/modules/cart/cart.service.spec.ts`

- **IMPLEMENT**: Direct instantiation. `mockCartRepo: jest.Mocked<Pick<CartRepository, 'buildKey' |
'getCart' | 'setCart' | 'deleteCart'>>` (have `buildKey` return `` `cart:${t}:${id}` ``).
  `mockProductsRepo: jest.Mocked<Pick<ProductsRepository, 'findById'>>`. `mockLogger`, `mockCls`
  (`getId → 'req-id'`). `beforeEach` → `new CartService(mockCartRepo, mockProductsRepo, mockLogger,
mockCls)`, `jest.clearAllMocks()`, reset getId + buildKey. Use factories. Required cases:
  - `addItem` creates a new cart when none exists: `getCart → null`, `findById → active product`;
    assert `setCart` called with a cart whose `items[0]` matches productId + snapshot + quantity.
  - `addItem` increments quantity when item already present: `getCart → cart with that productId qty
2`, add qty 3 → assert saved qty 5.
  - `addItem` throws `NotFoundException` for unknown product (`findById → null`); `setCart` not called.
  - `addItem` throws `BadRequestException` for inactive product (`findById → { isActive: false }`);
    `setCart` not called.
  - `updateQuantity` throws `BadRequestException` for quantity < 1 (no repo calls needed).
  - `updateQuantity` throws `NotFoundException` when item not in cart.
  - `mergeCart` sums quantities on conflict and deletes guest cart: guest cart `[{p1, qty2}]`, user
    cart `[{p1, qty1},{p2,qty5}]` → user `p1` becomes 3, `p2` stays 5; assert `setCart(userKey, ...)`
    and `deleteCart(guestKey)` called.
- **PATTERN**: `products.service.spec.ts`.
- **IMPORTS**: `BadRequestException, NotFoundException, type LoggerService` from `@nestjs/common`;
  `type ClsService` from `nestjs-cls`; `createMockCart, createMockCartItem` from
  `../../../test/factories/cart.factory`; local types + `CartService`.
- **GOTCHA**: For the product-validation cases, the `findById` mock needs an object with at least
  `{ id, name, slug, price, isActive }` — build it inline or via `createMockProduct` from the product
  factory (import it). Cast mock returns with `as unknown as` where types are partial.
- **VALIDATE**: `pnpm --filter @repo/api test`

### Task 14 — CREATE `apps/api/src/modules/cart/cart.controller.spec.ts`

- **IMPLEMENT**: `mockService` (all 6 methods as `jest.fn`). Direct instantiation. Build a fake
  `Response` `{ setHeader: jest.fn() } as unknown as Response`. Cases:
  - `getCart` (guest, no session header): pass `user = undefined`, `session = undefined` → assert
    `res.setHeader` called with `'X-Cart-Session'` + a string, and the returned DTO's `sessionId`
    equals the value passed to `setHeader`.
  - `getCart` (guest, with session header): pass `session = 'sess-1'` → `setHeader` called with
    `'X-Cart-Session', 'sess-1'`; DTO `sessionId === 'sess-1'`.
  - `getCart` (authenticated): pass a `user` → `setHeader` NOT called; DTO `sessionId` undefined;
    service called (identity resolved to user — assert via the service mock arg if exposed).
  - `addItem` delegates to `service.addItem` with the dto.
  - `merge` delegates to `service.merge(user, dto.sessionId)`.
  - **Guard rejection block**: `new JwtAuthGuard().handleRequest(null, false, undefined)` throws
    `UnauthorizedException` (the guard guarding `/cart/merge` rejects unauthenticated), and
    `new OptionalJwtAuthGuard().handleRequest(null, false)` returns `undefined` (other routes fall
    through to guest).
- **PATTERN**: `products.controller.spec.ts` (controller + guard describe blocks).
- **IMPORTS**: `UnauthorizedException` from `@nestjs/common`; `type { Response } from 'express'`;
  `JwtAuthGuard`; `OptionalJwtAuthGuard`; `createMockCart`; local DTOs/types + `CartController` +
  `type CartService`; `type UserEntity`.
- **GOTCHA**: `handleRequest` on `AuthGuard('jwt')` is synchronous and inherited — calling it on a
  bare `new JwtAuthGuard()` works without passport context. `randomUUID()` produces a real UUID in the
  controller — assert with `expect.any(String)` / equality against the echoed value, not a fixed string.
- **VALIDATE**: `pnpm --filter @repo/api test`

---

## TESTING STRATEGY

### Unit Tests (Backend)

Jest, co-located `*.spec.ts`, direct instantiation (NOT `Test.createTestingModule`). Mock
`CartRepository` and `ProductsRepository` with `jest.Mocked<Pick<...>>`; mock logger + CLS as plain
objects. Use `createMockCart` / `createMockCartItem` (+ `createMockProduct` for validation). The
documented gate is `pnpm --filter @repo/api test`.

### E2E Tests (Frontend)

None — backend-only task. The storefront already calls `POST /cart/items`; no web changes here.

### Edge Cases (covered by specs)

- Add to empty cart vs. add existing (increment). Unknown product → 404. Inactive product → 400.
- `updateQuantity` < 1 → 400; item absent → 404. `removeItem` absent → 404.
- Merge sums on conflict, preserves non-conflicting items, deletes guest cart.
- Guest with no header → server generates + echoes `X-Cart-Session`. Guest with header → echoes same.
- Authenticated request ignores `x-cart-session` and uses the user cart. Merge requires auth (401).

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

> The API package filter is `@repo/api` (the prompt's `--filter api` also resolves via Turborepo).

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm --filter @repo/api lint
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm --filter @repo/api prisma:generate   # once, if @prisma/client types are missing
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
docker compose up -d redis           # cart state requires Redis
pnpm --filter @repo/api db:seed      # need a real productId for add-item
pnpm --filter @repo/api dev          # :3001

# Guest flow — first call returns a generated X-Cart-Session header:
curl -s -D - http://localhost:3001/cart
curl -s -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' \
  -H 'x-cart-session: test-session-1' \
  -d '{"productId":"<id-from-seed>","quantity":2}'
curl -s http://localhost:3001/cart -H 'x-cart-session: test-session-1'   # shows the item
# open http://localhost:3001/docs → "cart" section with all 6 endpoints; merge shows the padlock.
```

---

## ACCEPTANCE CRITERIA

- [ ] All 10 module files + 4 supporting files (types, guard, decorator, factory) created.
- [ ] 6 endpoints present; reads/mutations optional-auth, `/cart/merge` requires JWT.
- [ ] Guest responses always carry `X-Cart-Session`; absent header → server generates one.
- [ ] Cart state in Redis only (no Prisma model); repository wraps `RedisProvider.client`; service
      never touches ioredis.
- [ ] Add validates product (404 unknown / 400 inactive) and snapshots name/slug/price.
- [ ] TTLs applied: guest 7d, user 30d (refreshed on every write).
- [ ] Merge sums conflicts and deletes the guest cart.
- [ ] `ProductsModule` exports `ProductsRepository`; `CartModule` registered in `app.module.ts`.
- [ ] `lint` + `typecheck` clean; `test` passes with all listed cases.
- [ ] Swagger `/docs` shows the cart section with all endpoints.

---

## NOTES

- **No Prisma model for cart** — intentional. Redis is the source of truth; carts are ephemeral
  (TTL-bounded). The `RedisProvider` is configured with `lazyConnect: true`, so the connection opens on
  first command — no boot dependency on Redis being up, but Level 5 manual testing needs it running.
- **Optional auth** is the one genuinely novel piece: the stock `JwtAuthGuard` 401s on a missing token,
  and `@CurrentUser()` throws. `OptionalJwtAuthGuard` + `@OptionalUser()` are the minimal additions
  that let one route serve both modes; they live in `common/`/`auth/` because the orders module will
  likely reuse them.
- **`randomUUID()` vs `uuid` package** — both are available; the plan uses Node's built-in
  `crypto.randomUUID()` to avoid an extra import and any ESM/CJS interop friction. If you prefer the
  `uuid` package (installed), `import { v4 as uuidv4 } from 'uuid'` is equivalent.
- **Identity resolution lives in the controller** (it's an HTTP concern — reading headers + JWT +
  setting a response header). The service receives a clean `CartIdentity` and owns key-building (via
  repo) + TTL selection + all mutation rules — keeping layer separation intact.
- **Concurrency**: read-modify-write on a JSON blob is not atomic; two simultaneous adds to the same
  cart could race. Acceptable for a single-user cart at MVP scale; note it for later (a Redis
  `WATCH`/Lua script or per-item hash fields would harden it). Flagged, not solved here.
- **Coverage threshold** (80%) is enforced only by `test:cov`, not the `test` gate; the repo currently
  sits below it for pre-existing reasons unrelated to this module.

**Confidence Score**: 8/10 — the structure mirrors products cleanly and all integration points are
verified (Redis provider, optional-auth, ProductsRepository export). The −2 reflects the two areas
with the most room for first-pass friction: the `@Res({ passthrough: true })` + header-echo wiring and
the optional-guard generic typing under strict ESLint, both of which are spelled out but easy to trip on.

**Next step**: Run `/execute plans/cart-module.md` to implement this feature.
