# Feature: orders-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Build the `orders` NestJS module under `apps/api/src/modules/orders/`, following the canonical
`products` module structure (controller → service → repository, DTOs, entities, co-located specs).
Orders turn a Redis-backed cart into a persisted, all-or-nothing purchase: it validates stock,
snapshots prices, decrements inventory, clears the cart, and enqueues a confirmation email — all
inside a single Prisma transaction for the write path. It also exposes order listing/detail with
RBAC (customers see their own; ADMIN sees all) and an admin-driven status lifecycle.

## User Story

As a shopper (guest or authenticated)
I want to place an order from my current cart and track its status
So that I can complete a purchase and follow it from PENDING through to DELIVERED.

As an ADMIN
I want to list all orders and advance their status
So that I can fulfil and manage the order pipeline.

## Problem Statement

The cart (Redis) and inventory (Postgres) exist, but there is no way to convert a cart into a durable
order, reserve stock atomically, or manage an order's lifecycle. Without a transaction, a partial
failure (order created but stock not decremented, or vice versa) would corrupt inventory.

## Solution Statement

A new `orders` module. The repository owns a Prisma `$transaction` that creates the `Order` + its
`OrderItem`s and decrements `Product.stock` atomically. The service orchestrates cart resolution,
product/stock validation, total calculation from cart **price snapshots**, post-commit cart clearing,
and email enqueue. A `VALID_TRANSITIONS` map plus role/ownership checks govern the status lifecycle.
Auth is optional on create (guests allowed) and required on list/detail/status/cancel.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/src/modules/products/products.service.ts` — Why: canonical service shape (constructor DI
  of repository + `WINSTON_MODULE_NEST_PROVIDER` logger + `ClsService`; `requestId = this.cls.getId()`;
  dot-namespaced `*_started`/`*_succeeded` logs; throws Nest exceptions). Copy this skeleton.
- `apps/api/src/modules/products/products.repository.ts` (lines 41-105) — Why: pagination via
  `$transaction([findMany, count])`, `toEntity` mapping with `Number(row.price)` for Decimal→number.
- `apps/api/src/modules/products/products.controller.ts` — Why: `@ApiTags`/`@ApiOperation`/`@ApiResponse`,
  admin guard combo `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` + `@ApiBearerAuth()`,
  `@HttpCode`, and the `Dto.from(entity)` response-mapping convention.
- `apps/api/src/modules/products/dto/find-products-query.dto.ts` — Why: query-DTO convention is a
  **plain class-validator class** (`@Type(() => Number) @IsInt @Min @Max`, `@IsOptional`), NOT a Zod
  schema. Mirror this for `FindOrdersQueryDto` (see GOTCHA on PaginationParamsSchema).
- `apps/api/src/modules/products/dto/product-response.dto.ts` — Why: response DTO with `@ApiProperty`
  on every field and a static `from(entity)` that converts `Date → toISOString()`.
- `apps/api/src/modules/products/products.service.spec.ts` — Why: test idiom — direct instantiation
  `new Service(mockRepo as unknown as Repo, mockLogger as unknown as LoggerService, mockCls as unknown as ClsService)`,
  `jest.Mocked<Pick<Repo, ...>>`, `mockCls.getId.mockReturnValue('req-id')`, factories, `as unknown as` casts.
- `apps/api/src/modules/cart/cart.service.ts` — Why: orders depends on it DIRECTLY. **Real API**:
  `getCart(identity: CartIdentity): Promise<Cart>` and `clear(identity: CartIdentity): Promise<Cart>`,
  where `CartIdentity = { type: 'guest' | 'user'; id: string }` (exported from this file). The prompt's
  `getCart('user', id)` / `clearCart(...)` pseudocode is NOT the real signature — use `CartIdentity`.
- `apps/api/src/modules/cart/cart.controller.ts` (lines 39-78, 150-161) — Why: the `resolve(user, header, res)`
  pattern that maps `OptionalUser` + `x-cart-session` header → `CartIdentity`. Orders' create endpoint
  reuses this shape (minus the `X-Cart-Session` echo — orders consume the cart, they don't hand it back).
- `apps/api/src/modules/cart/cart.module.ts` — Why: must be UPDATED to `exports: [CartService]`.
- `apps/api/src/queues/emails/email-queue.service.ts` — Why: inject this typed producer `EmailQueue`
  and call `await this.emailQueue.enqueueOrderConfirmation({ to, orderId, total })`. It stamps
  `requestId` from CLS automatically. **Do NOT** touch the raw BullMQ Queue.
- `apps/api/src/queues/emails/email-job.types.ts` — Why: `OrderConfirmationJob = { to: string; orderId: string; total: number; requestId? }`.
- `apps/api/src/queues/queues.module.ts` — Why: ALREADY exists and is registered in `app.module.ts`,
  exporting `EmailQueue`. **Do NOT recreate it.** OrdersModule imports `QueuesModule` to inject `EmailQueue`.
- `apps/api/src/common/guards/roles.guard.ts`, `apps/api/src/common/decorators/roles.decorator.ts` — Why:
  RBAC on admin-only endpoints. `@Roles(UserRole.ADMIN)` from `@prisma/client`.
- `apps/api/src/modules/auth/decorators/current-user.decorator.ts` (`@CurrentUser()` → `UserEntity`,
  throws if absent) and `optional-user.decorator.ts` (`@OptionalUser()` → `UserEntity | undefined`).
- `apps/api/src/common/guards/optional-jwt-auth.guard.ts` + `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
  — Why: `OptionalJwtAuthGuard` for create (guests OK); `JwtAuthGuard` for list/detail/status/cancel.
- `apps/api/src/modules/auth/entities/user.entity.ts` — Why: `UserEntity` has `id`, `email`, `role`.
- `apps/api/prisma/schema.prisma` (lines 20-26, 88-115) — Why: `Order`/`OrderItem`/`OrderStatus` shapes.
  **Do NOT modify the schema.** Note `Order` has NO address/email column (see GOTCHA on shippingAddress).
- `packages/types/src/order.types.ts` — Why: existing `Order`, `OrderItem`, `OrderStatus` (string union)
  — use as-is, no decorators added there.
- `apps/api/test/factories/product.factory.ts` and `cart.factory.ts` — Why: factory pattern to mirror.

### New Files to Create

```
apps/api/src/modules/orders/
├── orders.module.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.repository.ts
├── orders.controller.spec.ts
├── orders.service.spec.ts
├── dto/
│   ├── create-order.dto.ts
│   ├── update-order-status.dto.ts
│   ├── find-orders-query.dto.ts
│   ├── order-response.dto.ts        # OrderResponseDto + OrderItemResponseDto in one file
└── entities/
    └── order.entity.ts              # OrderEntity + OrderItemEntity
apps/api/test/factories/order.factory.ts
```

### Patterns to Follow

- **Naming**: kebab-case files, PascalCase classes, camelCase verb-first methods (CLAUDE.md §4).
- **Layer separation**: Controller (HTTP/guards/mapping) → Service (business logic, exceptions) →
  Repository (Prisma only). Service NEVER imports `PrismaService`. (CLAUDE.md §3)
- **DTOs** implement `@repo/types` interfaces where applicable + `class-validator` + `@ApiProperty`
  on EVERY field (global `ValidationPipe` uses `forbidNonWhitelisted`). (CLAUDE.md §7)
- **Logging**: `order.service.{verb}_{state}` with `requestId` and entity id. Never log PII/card data. (§5)
- **Errors**: `NotFoundException` (404), `BadRequestException` (400), `ForbiddenException` (403). (§7)

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (entities + DTOs)

`OrderEntity`/`OrderItemEntity`, the four DTOs, and the order factory. No external types are missing
(`Order`/`OrderItem`/`OrderStatus` already exist in `@repo/types`).

### Phase 2: Core Implementation (repository + service)

`OrdersRepository` (the atomic `$transaction`) and `OrdersService` (cart resolution, validation,
total calc, transition map, email enqueue).

### Phase 3: Integration (controller + module wiring)

`OrdersController`, `OrdersModule`, register in `app.module.ts`, and `exports: [CartService]` on
`CartModule`. Add `decrementStock` to `ProductsRepository`.

### Phase 4: Testing & Validation

Service + controller specs with factories; run typecheck, lint, test, dev.

---

## STEP-BY-STEP TASKS

Execute in order, top to bottom.

### CREATE `apps/api/src/modules/orders/entities/order.entity.ts`

- **IMPLEMENT**: Two classes.
  - `OrderItemEntity implements OrderItem` — fields `id`, `orderId`, `productId`, `quantity`,
    `priceAtPurchase` (all `!`), PLUS extra `productName?: string` (denormalized from the included
    product relation; not part of the `OrderItem` interface — mirrors how `CategoryEntity.children`
    adds an extra field).
  - `OrderEntity implements Order` — `id`, `customerId: string | null`, `status: OrderStatus`,
    `total: number`, `createdAt`, `updatedAt`, and `items?: OrderItemEntity[]`.
- **PATTERN**: `apps/api/src/modules/products/entities/product.entity.ts`.
- **IMPORTS**: `import type { Order, OrderItem, OrderStatus } from '@repo/types';`
- **GOTCHA**: `OrderStatus` from `@repo/types` is a string union — Prisma's `OrderStatus` enum values
  are assignable to it, so `toEntity` can assign `row.status` directly.

### CREATE `apps/api/src/modules/orders/dto/create-order.dto.ts`

- **IMPLEMENT**: `CreateOrderDto` with one optional field `shippingAddress?: string`
  (`@ApiPropertyOptional` + `@IsOptional` + `@IsString` + `@MaxLength(500)`). The cart is resolved
  server-side, so there is NO item list in the body.
- **GOTCHA**: The `Order` model has no address column and the schema must NOT change. `shippingAddress`
  is accepted/validated but NOT persisted at MVP — log it on create for traceability and document the
  limitation in NOTES. An empty body `{}` is valid (field optional + `forbidNonWhitelisted`).

### CREATE `apps/api/src/modules/orders/dto/update-order-status.dto.ts`

- **IMPLEMENT**: `UpdateOrderStatusDto` with `status!: OrderStatus` —
  `@ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })` + `@IsEnum(OrderStatus)`.
- **IMPORTS**: `import { OrderStatus } from '@prisma/client';` (use the Prisma enum for `@IsEnum`,
  exactly as `products.controller` uses `UserRole` from `@prisma/client`).

### CREATE `apps/api/src/modules/orders/dto/find-orders-query.dto.ts`

- **IMPLEMENT**: `FindOrdersQueryDto` — `page?`, `limit?` (mirror `find-products-query.dto.ts`:
  `@ApiPropertyOptional` + `@IsOptional` + `@Type(() => Number)` + `@IsInt` + `@Min(1)`; `limit` also
  `@Max(50)`), plus optional `status?: OrderStatus` (`@IsOptional` + `@IsEnum(OrderStatus)`).
- **GOTCHA**: The prompt says "extend `PaginationParamsSchema` from `@repo/types`", but that is a **Zod**
  schema and the codebase convention (CLAUDE.md §2) is Zod on the frontend, `class-validator` DTOs on
  Nest controller inputs. The canonical `FindProductsQueryDto` is a plain class-validator class — mirror
  it. Do NOT import the Zod schema into the controller layer.

### CREATE `apps/api/src/modules/orders/dto/order-response.dto.ts`

- **IMPLEMENT**: Two classes in one file.
  - `OrderItemResponseDto`: `@ApiProperty` fields `id`, `productId`, `name` (denormalized — from
    `entity.productName ?? ''`), `quantity`, `priceAtPurchase`. Static
    `from(item: OrderItemEntity): OrderItemResponseDto`.
  - `OrderResponseDto`: `@ApiProperty` fields `id`, `customerId: string | null`
    (`@ApiProperty({ nullable: true })`), `status`, `total`, `items: OrderItemResponseDto[]`
    (`@ApiProperty({ type: () => [OrderItemResponseDto] })`), `createdAt: string`, `updatedAt: string`.
    Static `from(entity: OrderEntity)` mapping dates → `toISOString()` and
    `items: (entity.items ?? []).map(OrderItemResponseDto.from)`.
- **PATTERN**: `product-response.dto.ts`.

### CREATE `apps/api/test/factories/order.factory.ts`

- **IMPLEMENT**: `createMockOrderItem(overrides: Partial<OrderItemEntity> = {}): OrderItemEntity` and
  `createMockOrder(overrides: Partial<OrderEntity> = {}): OrderEntity`. Module-level `counter` for ids,
  fixed dates `new Date('2026-01-01')`. Default order: `status: 'PENDING'`, `total: 59.98`,
  `customerId: 'user-1'`, `items: [createMockOrderItem()]`.
- **PATTERN**: `apps/api/test/factories/cart.factory.ts` and `product.factory.ts`.
- **IMPORTS**: import the two entity classes (NOT just the interfaces) so `productName` is available.

### UPDATE `apps/api/src/modules/products/products.repository.ts`

- **ADD**: `async decrementStock(productId: string, quantity: number, tx?: Prisma.TransactionClient): Promise<void>`
  — `const client = tx ?? this.prisma; await client.product.update({ where: { id: productId }, data: { stock: { decrement: quantity } } });`
- **IMPORTS**: `Prisma` is already imported as a type (`import type { Prisma, ... } from '@prisma/client'`).
- **GOTCHA**: The optional `tx` parameter lets the order-creation `$transaction` decrement stock on the
  SAME transaction client (atomicity). Calling it with the module-level `this.prisma` outside a tx would
  break the all-or-nothing guarantee — the orders path always passes `tx`. Keep stock logic here per the
  layer rules (inventory belongs to Products).

### CREATE `apps/api/src/modules/orders/orders.repository.ts`

- **IMPLEMENT**: `@Injectable() OrdersRepository`. Constructor injects `PrismaService` and
  `ProductsRepository` (for `decrementStock`).
  - `interface CreateOrderData { customerId: string | null; total: number; items: { productId: string; quantity: number; price: number }[]; }`
  - `async create(data: CreateOrderData): Promise<OrderEntity>`:
    ```ts
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: data.customerId,
          status: 'PENDING',
          total: data.total,
          items: {
            create: data.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceAtPurchase: i.price,
            })),
          },
        },
        include: { items: { include: { product: true } } },
      });
      for (const i of data.items) {
        await this.products.decrementStock(i.productId, i.quantity, tx);
      }
      return this.toEntity(order);
    });
    ```
  - `async findAll(filters: { customerId?: string; status?: OrderStatus; page: number; limit: number }): Promise<PaginatedResponse<OrderEntity>>`
    — build `where` from `customerId`/`status` (omit undefined keys), `$transaction([findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true } } } }), count({ where })])`.
  - `async findById(id: string): Promise<OrderEntity | null>` — `findUnique({ where: { id }, include: { items: { include: { product: true } } } })`.
  - `async updateStatus(id: string, status: OrderStatus): Promise<OrderEntity>` — `update({ where: { id }, data: { status }, include: { items: { include: { product: true } } } })`.
  - Private `toEntity(row)` and `toItemEntity(row)`: `Number(row.total)` / `Number(row.priceAtPurchase)`;
    set `productName = itemRow.product?.name`.
- **PATTERN**: `products.repository.ts` (pagination, `toEntity`, Decimal→`Number`).
- **IMPORTS**: `Injectable` from `@nestjs/common`; `import type { Prisma, OrderStatus } from '@prisma/client'`
  (or use `@repo/types` OrderStatus — both work, prefer `@prisma/client` for the where-clause typing);
  `PaginatedResponse` from `@repo/types`; `PrismaService`; `ProductsRepository`; entities.
- **GOTCHA**: Build the typed `where` (`Prisma.OrderWhereInput`) by conditional assignment
  (`exactOptionalPropertyTypes` forbids `{ customerId: undefined }`). Mirror products' spread idiom:
  `{ ...(filters.customerId ? { customerId: filters.customerId } : {}), ...(filters.status ? { status: filters.status } : {}) }`.

### CREATE `apps/api/src/modules/orders/orders.service.ts`

- **IMPLEMENT**: `@Injectable() OrdersService`. Constructor injects `OrdersRepository`,
  `ProductsRepository`, `CartService`, `EmailQueue`, `WINSTON_MODULE_NEST_PROVIDER` logger, `ClsService`.
  - Export `const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]>` =
    `{ PENDING: ['CONFIRMED','CANCELLED'], CONFIRMED: ['SHIPPED','CANCELLED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] }`.
  - `async create(user: UserEntity | undefined, sessionId: string | undefined, dto: CreateOrderDto): Promise<OrderEntity>`:
    1. Resolve identity: `user ? { type:'user', id:user.id } : { type:'guest', id:sessionId }`. If guest and
       no `sessionId` → treat as empty cart.
    2. `const cart = sessionId || user ? await this.cart.getCart(identity) : { items: [] }`;
       throw `BadRequestException('Cart is empty')` if `cart.items.length === 0`.
    3. For each item: `const product = await this.products.findById(item.productId)`;
       `if (!product || !product.isActive) throw new BadRequestException('Product "<id>" is not available')`;
       `if (product.stock < item.quantity) throw new BadRequestException('Insufficient stock for "<id>"')`.
    4. `total = round2(sum(item.price * item.quantity))` — use the CART price snapshot, not the live
       product price.
    5. `const order = await this.repository.create({ customerId: user?.id ?? null, total, items: cart.items.map(i => ({ productId:i.productId, quantity:i.quantity, price:i.price })) });`
    6. After commit: `await this.cart.clear(identity);`
    7. `if (user?.email) await this.emailQueue.enqueueOrderConfirmation({ to: user.email, orderId: order.id, total: order.total });`
       (guests have no email captured — skip; note in NOTES).
    8. Log `order.service.create_started` / `_succeeded`; return `order`.
  - `async findAll(userId: string, role: UserRole, query: FindOrdersQueryDto): Promise<PaginatedResponse<OrderEntity>>`:
    `const filters = { page: query.page ?? 1, limit: query.limit ?? 20, ...(query.status ? { status: query.status } : {}), ...(role === UserRole.ADMIN ? {} : { customerId: userId }) }; return this.repository.findAll(filters);`
  - `async findById(id: string, userId: string, role: UserRole): Promise<OrderEntity>`:
    load or `NotFoundException`; if `role !== ADMIN && order.customerId !== userId` → `ForbiddenException`.
  - `async transitionStatus(id: string, target: OrderStatus, actor: { id: string; role: UserRole }): Promise<OrderEntity>`:
    1. `const order = await this.findByIdRaw(id)` (load + NotFound; do NOT apply the ownership filter here).
    2. `if (!VALID_TRANSITIONS[order.status].includes(target)) throw new BadRequestException(...)`.
    3. Permission: `const isAdmin = actor.role === ADMIN; const customerCancel = target === 'CANCELLED' && order.status === 'PENDING' && order.customerId === actor.id; if (!isAdmin && !customerCancel) throw new ForbiddenException();`
    4. `return this.repository.updateStatus(id, target)` + logs.
  - `async cancel(id: string, actor: { id: string; role: UserRole }): Promise<OrderEntity>`
    = `this.transitionStatus(id, 'CANCELLED', actor)` (encodes: customer cancels own PENDING; admin
    cancels PENDING or CONFIRMED — both covered by the map + permission check).
  - Private `round2(n: number): number { return Math.round(n * 100) / 100; }`.
  - Private `findByIdRaw(id)` helper that loads + throws NotFound but skips ownership (used by transition).
- **PATTERN**: `products.service.ts` (logging, exceptions, DI). `cart.service.ts` (CartIdentity usage).
- **IMPORTS**: exceptions + `Inject`/`Injectable`/`LoggerService` from `@nestjs/common`;
  `UserRole`, `OrderStatus` from `@prisma/client`; `WINSTON_MODULE_NEST_PROVIDER`; `ClsService`;
  `CartService` + `type CartIdentity` from `../cart/cart.service`; `ProductsRepository`;
  `EmailQueue` from `@/queues/emails/email-queue.service`; `UserEntity` (type); local DTOs/entities/repo.
- **GOTCHA**: NEVER import `PrismaService` here. `CartService.getCart`/`clear` take a `CartIdentity`
  object, not positional args. The success-path test MUST use an authenticated user so the email enqueue
  is exercised deterministically.

### CREATE `apps/api/src/modules/orders/orders.controller.ts`

- **IMPLEMENT**: `@ApiTags('orders') @Controller('orders')`, constructor injects `OrdersService`.
  - `@Post()` `@UseGuards(OptionalJwtAuthGuard)` `@HttpCode(HttpStatus.CREATED)` —
    `create(@OptionalUser() user, @Headers('x-cart-session') session, @Body() dto)` →
    `OrderResponseDto.from(await service.create(user, session, dto))`. `@ApiHeader({ name:'x-cart-session', required:false })`, `@ApiResponse 201/400`.
  - `@Get()` `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` —
    `findAll(@CurrentUser() user, @Query() query)` → map `PaginatedResponse` data via `OrderResponseDto.from`
    (mirror products controller's `findAll` mapping). `@ApiResponse 200/401`.
  - `@Get(':id')` `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` —
    `findOne(@CurrentUser() user, @Param('id') id)` → `OrderResponseDto.from(await service.findById(id, user.id, user.role))`.
    `@ApiResponse 200/401/403/404`.
  - `@Patch(':id/status')` `@UseGuards(JwtAuthGuard, RolesGuard)` `@Roles(UserRole.ADMIN)` `@ApiBearerAuth()`
    — `updateStatus(@CurrentUser() user, @Param('id') id, @Body() dto: UpdateOrderStatusDto)` →
    `OrderResponseDto.from(await service.transitionStatus(id, dto.status, user))`. `@ApiResponse 200/400/401/403/404`.
  - `@Post(':id/cancel')` `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` `@HttpCode(HttpStatus.OK)` —
    `cancel(@CurrentUser() user, @Param('id') id)` → `OrderResponseDto.from(await service.cancel(id, user))`.
    `@ApiResponse 200/400/401/403/404`.
- **PATTERN**: `products.controller.ts` (guard combos, Swagger, `.from` mapping) and `cart.controller.ts`
  (`@OptionalUser` + `@Headers('x-cart-session')`).
- **GOTCHA**: Declare `@Get(':id')` AFTER no static GET routes conflict (there are none here, but keep
  `@Patch(':id/status')` / `@Post(':id/cancel')` distinct from `:id`). Unlike the cart controller, do
  NOT echo `X-Cart-Session` — the order consumes the cart.

### UPDATE `apps/api/src/modules/cart/cart.module.ts`

- **ADD**: `exports: [CartService]` to the `@Module` decorator so `OrdersModule` can inject `CartService`.

### CREATE `apps/api/src/modules/orders/orders.module.ts`

- **IMPLEMENT**: `@Module({ imports: [PrismaModule, ProductsModule, CartModule, QueuesModule], controllers: [OrdersController], providers: [OrdersService, OrdersRepository] })`.
- **PATTERN**: `products.module.ts` / `cart.module.ts`.
- **GOTCHA**: `ProductsModule` already `exports: [ProductsRepository]`; `QueuesModule` exports `EmailQueue`;
  `CartModule` now exports `CartService`. `RolesGuard` needs no import (uses `Reflector`, globally available).

### UPDATE `apps/api/src/app.module.ts`

- **ADD**: `import { OrdersModule } from '@/modules/orders/orders.module';` and add `OrdersModule` to the
  `imports` array (alphabetical-ish: after `CategoriesModule`, before `ProductsModule` — import-x/order
  will autofix ordering of the import statement).

### CREATE `apps/api/src/modules/orders/orders.service.spec.ts`

- **IMPLEMENT**: Direct-instantiation pattern. Mocks: `jest.Mocked<Pick<OrdersRepository,'create'|'findAll'|'findById'|'updateStatus'>>`,
  `jest.Mocked<Pick<ProductsRepository,'findById'>>`, `jest.Mocked<Pick<CartService,'getCart'|'clear'>>`,
  `{ enqueueOrderConfirmation: jest.fn() }` for `EmailQueue`, `mockLogger`, `mockCls`. Use factories
  `createMockOrder`, `createMockProduct`, `createMockCart`/`createMockCartItem`.
  - `create throws BadRequestException on empty cart` (getCart → `{ items: [] }`).
  - `create throws BadRequestException on inactive product` (cart has item; `products.findById` → inactive).
  - `create throws BadRequestException on insufficient stock` (product active, `stock < quantity`).
  - `create calls repository, clears cart, and enqueues email` — authenticated user with `email`; assert
    `repository.create` called with computed `total`, `cart.clear` called, `enqueueOrderConfirmation`
    called with `{ to, orderId, total }`.
  - `transitionStatus throws BadRequestException on invalid transition` (e.g. order `DELIVERED`, target
    `CONFIRMED`).
  - `transitionStatus throws ForbiddenException when a customer confirms their own order` (order PENDING,
    target CONFIRMED, actor role CUSTOMER owning the order).
  - `findById throws NotFoundException for missing order` (`repository.findById` → null).
  - `findById throws ForbiddenException when a customer fetches another user's order`
    (order.customerId !== actor.id, role CUSTOMER).
- **GOTCHA**: `UserRole`/`OrderStatus` imported from `@prisma/client`. Cast entities with `as unknown as`
  where the factory returns the entity but a mock expects the Prisma-derived type (mirror products spec).

### CREATE `apps/api/src/modules/orders/orders.controller.spec.ts`

- **IMPLEMENT**: `new OrdersController(mockService as unknown as OrdersService)`. `mockService` mocks all
  five service methods. Tests:
  - `GET /orders returns paginated results` — `service.findAll` → `{ data:[order], total:1, page:1, limit:20 }`;
    assert the controller returns `data` mapped to `OrderResponseDto` and passes `user.id`, `user.role`.
  - `POST /orders/:id/cancel rejects a CONFIRMED order cancelled by a customer` — make
    `mockService.cancel` reject with `ForbiddenException`; assert the controller propagates it. (The real
    Forbidden decision lives in the service; the controller just delegates.)
  - `PATCH /orders/:id/status rejects non-admin` — unit-test `RolesGuard`: `new RolesGuard(reflector)`
    where `reflector.getAllAndOverride` → `[UserRole.ADMIN]` and `req.user.role = UserRole.CUSTOMER`;
    `expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)`. Build a minimal `ExecutionContext`
    stub (`getHandler`/`getClass`/`switchToHttp().getRequest`).
- **PATTERN**: `cart.controller.spec.ts` (controller direct instantiation + guard unit block).

---

## TESTING STRATEGY

### Unit Tests (Backend)

Jest, co-located, direct instantiation, factories only (no inline data). Service spec is the core (8
cases above) covering the create flow, transition map, and RBAC. Controller spec covers delegation +
the admin RolesGuard. 80% coverage threshold applies under `test:cov` (modules/main excluded). The new
service has branchy logic — ensure both branches of each guard/validation are hit.

### E2E Tests (Frontend)

None — this is a backend-only module and the prompt forbids touching `apps/web`.

### Edge Cases

- Empty cart (guest with no session, or empty Redis cart) → 400.
- Inactive product / insufficient stock at checkout time → 400 (validated against live product, not snapshot).
- Total uses the cart **price snapshot**, even if the product price changed after add-to-cart.
- Invalid status transition (final states `DELIVERED`/`CANCELLED` → anything) → 400.
- Customer cancelling a CONFIRMED order → 403; admin cancelling CONFIRMED → allowed.
- Customer fetching/transitioning another customer's order → 403.
- Stock decrement + order/items creation are atomic (single `$transaction`); a mid-flight failure rolls back all.

---

## VALIDATION COMMANDS

Execute in order. Stop and fix on any Level 1/2 failure.

### Level 0: Infra (orders touches Postgres + Redis)

```bash
docker compose up -d postgres redis
```

### Level 1: Lint (hard gate)

```bash
pnpm --filter api lint
```

### Level 2: Type Check (hard gate)

```bash
pnpm --filter api typecheck
```

### Level 3: Unit Tests

```bash
pnpm --filter api test
```

Coverage: `pnpm --filter api test:cov`

### Level 4: Manual Validation (PowerShell-friendly via Swagger or curl)

```bash
pnpm --filter api dev      # starts on :3001
# Swagger: open http://localhost:3001/docs — confirm an "orders" tag with all 5 endpoints.
```

Full checkout (bash/jq shown; on Windows use Swagger or Invoke-RestMethod):

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

curl -s -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"<id-from-seed>","quantity":1}'

curl -s -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{}'

curl -s http://localhost:3001/orders -H "Authorization: Bearer $TOKEN"
```

Expect: order created (status PENDING, total from cart), cart now empty, an
`email.processor.process_succeeded` log line (Resend is stubbed via MailService), and the order in the list.

---

## ACCEPTANCE CRITERIA

- [ ] All 5 endpoints exist with correct guards (create optional-auth; list/detail/cancel require auth;
      status admin-only) and appear under the `orders` Swagger tag.
- [ ] Order creation is atomic (order + items + stock decrement in one `$transaction`); cart cleared and
      confirmation email enqueued (authenticated) after commit.
- [ ] Total computed from cart price snapshots; `priceAtPurchase` stored per item.
- [ ] Status transitions enforce `VALID_TRANSITIONS` + role/ownership; invalid → 400, unauthorized → 403.
- [ ] `lint`, `typecheck`, `test` all pass with zero errors/warnings; no regressions.
- [ ] `CartService` never bypassed (no direct Redis); `PrismaService` never imported in the service.

---

## NOTES

- **BullMQ already exists** — `QueuesModule` + the typed `EmailQueue` producer + `EmailProcessor`
  (`WorkerHost`) were built in Step 11 and are registered in `app.module.ts`. The prompt's "BullMQ
  minimum setup" is therefore OBSOLETE: do NOT create `queues.module.ts` or `email.processor.ts`. Inject
  `EmailQueue` and call `enqueueOrderConfirmation({ to, orderId, total })`. The order-confirmation
  job/payload already matches (`{ to, orderId, total }`).
- **CartService API differs from the prompt** — real signatures are `getCart(identity)` and
  `clear(identity)` taking a `CartIdentity = { type, id }`; there is no `clearCart`. CartModule must add
  `exports: [CartService]`.
- **shippingAddress is not persisted** — the `Order` model has no address column and the schema must not
  change. The DTO validates it (future-proofing + it can ride along to the email later) but it is dropped
  at the repository boundary for now. Document as a known MVP limitation.
- **Guest order emails** — guests have no captured email (CreateOrderDto has no email field), so the
  confirmation enqueue is skipped for guests. Capturing a guest email is future work.
- **Stock decrement & races** — validation reads stock then decrements inside the tx; under heavy
  concurrency stock could theoretically go negative (decrement has no DB-level floor). Acceptable at MVP
  scale (matches the cart module's documented read-modify-write trade-off); harden later with a
  conditional update (`updateMany where stock >= qty`) if needed.
- **decrementStock placement** — lives in `ProductsRepository` (inventory is the products domain) but
  accepts an optional `Prisma.TransactionClient` so the orders transaction stays atomic.
- **OrderStatus duality** — `@repo/types` exports a string-union `OrderStatus`; `@prisma/client` exports
  the enum. Use the Prisma enum for `@IsEnum`, the `VALID_TRANSITIONS` map, and `UserRole` comparisons
  (consistent with how `products.controller` uses `UserRole`); entities `implements` the `@repo/types`
  interface (values are assignable).

**Confidence Score**: 8/10 — patterns are well-established and every dependency already exists. The two
risk areas are (1) the cross-repository `$transaction` with an injected `ProductsRepository.decrementStock(tx)`
and (2) `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` strictness on the `where`-clause and
`VALID_TRANSITIONS[order.status]` index access — both are flagged with concrete idioms above.
