# Feature: discounts-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Adds a `discounts` domain module to the NestJS API that lets administrators manage
promo codes (`DiscountCode`) and lets customers — registered or guest — apply a code
during checkout to reduce the order total. The `DiscountCode` Prisma model and the
shared `@repo/types` interface already exist; we are building the service/controller
layer, the cart-aware validation logic, the orders integration, and an audit table
that persists every successful redemption against an order.

## User Story

As a customer
I want to enter a discount code at checkout and see the discounted total
So that I receive the promotion the store advertised.

As a store administrator
I want to create, list, update, and soft-delete discount codes
So that I can run percent-off and fixed-amount campaigns without code changes.

## Problem Statement

The schema already has a `DiscountCode` table but there is no API surface, no
validation logic, and no wiring into the order flow. Orders are created at full
subtotal and never reference a discount. There is also no audit trail of who
redeemed which code on which order, which the admin dashboard will need.

## Solution Statement

Build a 9-file NestJS `discounts` module that mirrors `products` exactly: controller
(public validate + admin CRUD), service (cart-aware validate + redeem + admin CRUD),
repository (Prisma queries + idempotent redemption insert), DTOs, entity, specs.
Add a `DiscountRedemption` model + migration for per-order audit and idempotent
retries. Extend `Order` with `discountCodeId` + `discountAmount` so each order is
self-describing. Hook `OrdersService.create` to call a cart-agnostic
`DiscountsService.validateForSubtotal` + `redeem` inside its existing flow.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/src/modules/products/products.module.ts` — canonical 9-file module shape.
- `apps/api/src/modules/products/products.controller.ts` (lines 34-104) — admin
  endpoints with `JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN)`; soft-delete
  pattern returning 204.
- `apps/api/src/modules/products/products.service.ts` — service shape, logging,
  exception throwing.
- `apps/api/src/modules/products/products.repository.ts` (lines 76-120) — create,
  soft-delete (set `isActive=false`), and the `decrementStock` pattern with
  optional `tx?: Prisma.TransactionClient` parameter — MIRROR this for `redeem`.
- `apps/api/src/modules/products/products.service.spec.ts` — Jest service test
  shape with mocked repository and `jest.Mocked<Pick<...>>`.
- `apps/api/src/modules/payments/payments.controller.ts` (lines 36-91) —
  `OptionalJwtAuthGuard` + `@OptionalUser()` + `x-cart-session` header pattern for
  guest+auth endpoints. The `/discounts/validate` endpoint MUST mirror this.
- `apps/api/src/modules/payments/payments.service.ts` (lines 58-127) —
  `createIntent` shows ownership-check ordering, logging dot-namespaces, and a
  `ConflictException` for already-paid.
- `apps/api/src/modules/orders/orders.service.ts` (lines 54-120, 122-128) — the
  `create` flow we extend, and `findByIdInternal` pattern (bypasses ownership for
  trusted internal callers).
- `apps/api/src/modules/orders/orders.repository.ts` — `confirmAndDecrementStock`
  shows `prisma.$transaction(async (tx) => …)` flow we will mirror for the
  combined order-create + redemption insert.
- `apps/api/src/modules/cart/cart.service.ts` (lines 19-50) — `CartIdentity`
  shape and `getCart` for subtotal resolution.
- `apps/api/src/modules/cart/cart.controller.ts` (lines 39-58) — identity
  resolution from `OptionalUser + x-cart-session` to mirror in the discounts
  controller.
- `apps/api/src/modules/orders/dto/create-order.dto.ts` — DTO shape to extend
  with an optional `discountCode` field.
- `apps/api/prisma/schema.prisma` (lines 102-116 Order, 164-177 DiscountCode) —
  existing models we extend.
- `packages/types/src/discount-code.types.ts` — shared `DiscountCode` interface
  already exported; do NOT duplicate.
- `packages/types/src/index.ts` — barrel; add new file exports here.
- `apps/api/test/factories/product.factory.ts`, `payment.factory.ts`,
  `order.factory.ts` — pattern for the new `discount.factory.ts`.
- `apps/api/src/common/guards/optional-jwt-auth.guard.ts` — guard for public+auth.
- `apps/api/src/modules/auth/decorators/optional-user.decorator.ts` and
  `current-user.decorator.ts`.
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`,
  `apps/api/src/common/guards/roles.guard.ts`,
  `apps/api/src/common/decorators/roles.decorator.ts` — admin protection.
- `apps/api/src/app.module.ts` — module registration list.

### New Files to Create

- `apps/api/src/modules/discounts/discounts.module.ts`
- `apps/api/src/modules/discounts/discounts.controller.ts`
- `apps/api/src/modules/discounts/discounts.service.ts`
- `apps/api/src/modules/discounts/discounts.repository.ts`
- `apps/api/src/modules/discounts/dto/create-discount.dto.ts`
- `apps/api/src/modules/discounts/dto/update-discount.dto.ts`
- `apps/api/src/modules/discounts/dto/validate-discount.dto.ts`
- `apps/api/src/modules/discounts/dto/discount-response.dto.ts`
- `apps/api/src/modules/discounts/dto/discount-validation-response.dto.ts`
- `apps/api/src/modules/discounts/entities/discount.entity.ts`
- `apps/api/src/modules/discounts/discounts.controller.spec.ts`
- `apps/api/src/modules/discounts/discounts.service.spec.ts`
- `apps/api/test/factories/discount.factory.ts`
- `apps/api/prisma/migrations/<timestamp>_add_discount_redemptions/migration.sql`
- `packages/types/src/discount-validation.types.ts`

### Patterns to Follow

- **Layer separation** (CLAUDE.md §3): controller HTTP only, service business
  logic only, repository Prisma only. No `PrismaService` in `discounts.service.ts`.
- **DTOs** implement `Pick<DiscountCode, ...>` from `@repo/types` and add
  `class-validator` + `@ApiProperty`. No decorators in `packages/types`.
- **Logging** (CLAUDE.md §5): dot-namespaced events with `requestId` from
  `ClsService.getId()`. Namespaces:
  `discount.service.validate_started|_succeeded|_failed`,
  `discount.service.create_started|_succeeded`,
  `discount.service.redeem_succeeded|_duplicate_skipped`,
  `order.service.create_with_discount_succeeded`.
- **Errors**: `NotFoundException` (missing or `isActive=false`),
  `BadRequestException` (expired, XOR-violation, empty cart, invalid amounts),
  `ConflictException` (already redeemed for this order),
  `ForbiddenException` (admin endpoints — handled by `RolesGuard`).
- **Optional auth on public endpoints**: `OptionalJwtAuthGuard` +
  `@OptionalUser()` + `@Headers('x-cart-session')` — mirror payments controller.
- **Idempotent redemption via P2002**: mirror
  `webhook-events.repository.ts → recordEvent`'s `catch (Prisma.PrismaClientKnownRequestError) → if (code === 'P2002') return false` pattern.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (shared types, schema, migration)

Add `DiscountValidation` shape to `@repo/types`. Extend `Order` and add
`DiscountRedemption` to the Prisma schema. Generate a single migration
`add_discount_redemptions` that:

1. Adds nullable `discountCodeId String?` and `discountAmount Decimal? @db.Decimal(10,2)` columns to `Order` (+ index on `discountCodeId`).
2. Creates `DiscountRedemption` with `@@unique([discountCodeId, orderId])`.

Decision: per-order redemption table (option b from the prompt). Justification:
gives us idempotent retries on `OrdersService.create` and an audit trail the
admin dashboard will need. Cost is one extra row per discounted order.

### Phase 2: Core implementation (module / controller / service / repository / DTOs / entity)

Build the 9-file `discounts` module mirroring `products` exactly. The service
exposes both a controller-facing `validate(code, identity)` (resolves cart for
subtotal) and a transaction-friendly `validateForSubtotal(code, subtotal)` used
by `OrdersService` so we don't re-resolve the cart inside the order create flow.

### Phase 3: Orders integration

Extend `CreateOrderDto` with an optional `discountCode`. Change
`OrdersService.create` so it (a) computes `subtotal` instead of `total`, (b)
calls `validateForSubtotal` if a code is present, (c) clamps `total = max(0, subtotal - amountApplied)`, (d) persists `discountCodeId` + `discountAmount`
on the order, (e) calls `DiscountsRepository.redeem(..., tx)` inside the
existing `prisma.$transaction` that already wraps the order create. Refactor
`OrdersRepository.create` to accept the new fields and to expose a `tx`-aware
variant so we can chain the redemption insert atomically.

### Phase 4: Testing & validation

Co-located Jest specs for controller, service. Factory for `DiscountCode` and
`DiscountValidation`. Update existing `orders.service.spec.ts` to cover the
four discount branches. Run lint, typecheck, and unit tests as hard gates.

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom. Each task is atomic and independently testable.

### 1. CREATE `packages/types/src/discount-validation.types.ts`

- **IMPLEMENT**:
  ```ts
  import { z } from 'zod';
  export type DiscountType = 'PERCENT' | 'AMOUNT';
  export interface DiscountValidation {
    code: string;
    discountId: string;
    type: DiscountType;
    value: number; // percentOff (1-100) or amountOff (major units)
    amountApplied: number;
    subtotal: number;
    total: number; // subtotal - amountApplied, never < 0
  }
  export const DiscountValidationSchema = z.object({
    code: z.string(),
    discountId: z.string(),
    type: z.enum(['PERCENT', 'AMOUNT']),
    value: z.number().nonnegative(),
    amountApplied: z.number().nonnegative(),
    subtotal: z.number().nonnegative(),
    total: z.number().nonnegative(),
  });
  ```
- **PATTERN**: `packages/types/src/discount-code.types.ts` (no decorators, Zod + interface).
- **GOTCHA**: pure types only.
- **VALIDATE**: `pnpm --filter @repo/types build` (or `pnpm typecheck`).

### 2. UPDATE `packages/types/src/index.ts`

- **IMPLEMENT**: add `export * from './discount-validation.types';` (alphabetical: between `discount-code.types` and `order.types`).
- **VALIDATE**: `pnpm typecheck`.

### 3. UPDATE `apps/api/prisma/schema.prisma`

- **IMPLEMENT** — extend `Order`:
  ```prisma
  model Order {
    // ...existing fields
    discountCodeId String?
    discountAmount Decimal? @db.Decimal(10, 2)
    discountCode   DiscountCode? @relation(fields: [discountCodeId], references: [id], onDelete: SetNull)
    redemptions    DiscountRedemption[]
    @@index([discountCodeId])
  }
  ```
- **IMPLEMENT** — add inverse relation to `DiscountCode`:
  ```prisma
  model DiscountCode {
    // ...existing fields
    orders      Order[]
    redemptions DiscountRedemption[]
  }
  ```
- **IMPLEMENT** — new model:
  ```prisma
  model DiscountRedemption {
    id             String   @id @default(cuid())
    discountCodeId String
    orderId        String
    amountApplied  Decimal  @db.Decimal(10, 2)
    createdAt      DateTime @default(now())
    discountCode DiscountCode @relation(fields: [discountCodeId], references: [id], onDelete: Restrict)
    order        Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)
    @@unique([discountCodeId, orderId])
    @@index([orderId])
  }
  ```
- **VALIDATE**: `pnpm --filter api prisma:generate` succeeds.

### 4. CREATE `apps/api/prisma/migrations/<timestamp>_add_discount_redemptions/migration.sql`

- **IMPLEMENT**: hand-write following the existing init migration style.
  - `ALTER TABLE "Order" ADD COLUMN "discountCodeId" TEXT, ADD COLUMN "discountAmount" DECIMAL(10,2);`
  - `CREATE INDEX "Order_discountCodeId_idx" ON "Order"("discountCodeId");`
  - `ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
  - `CREATE TABLE "DiscountRedemption" (id, discountCodeId, orderId, amountApplied, createdAt) …`
  - `CREATE UNIQUE INDEX "DiscountRedemption_discountCodeId_orderId_key" ON "DiscountRedemption"("discountCodeId","orderId");`
  - `CREATE INDEX "DiscountRedemption_orderId_idx" ON "DiscountRedemption"("orderId");`
  - Two FK constraints (Restrict on discountCode, Cascade on order).
- **GOTCHA**: timestamp folder name format mirrors existing migrations
  (`YYYYMMDDHHMMSS`). Docker may be offline — hand-rolled SQL applies cleanly on
  next `prisma:migrate dev`.

### 5. CREATE `apps/api/src/modules/discounts/entities/discount.entity.ts`

- **IMPLEMENT**:
  ```ts
  export class DiscountEntity {
    id: string;
    code: string;
    percentOff: number | null;
    amountOff: number | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **PATTERN**: `apps/api/src/modules/products/entities/product.entity.ts`.

### 6. CREATE `apps/api/src/modules/discounts/dto/create-discount.dto.ts`

- **IMPLEMENT**:

  ```ts
  export class CreateDiscountDto implements Pick<DiscountCode, 'code'> {
    @ApiProperty({ example: 'SUMMER10' })
    @IsString()
    @MinLength(3)
    @MaxLength(64)
    @Matches(/^[A-Z0-9_-]+$/i)
    code!: string;

    @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    percentOff?: number;

    @ApiPropertyOptional({ example: 5.0, minimum: 0.01 })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amountOff?: number;

    @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
    @IsOptional()
    @IsDateString()
    expiresAt?: string;
  }
  ```

- **GOTCHA**: XOR enforcement happens in the service, NOT here — class-validator
  cannot express "exactly one of two optional fields".
- **PATTERN**: `apps/api/src/modules/products/dto/create-product.dto.ts`.

### 7. CREATE `apps/api/src/modules/discounts/dto/update-discount.dto.ts`

- **IMPLEMENT**: `export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}`
- **PATTERN**: `apps/api/src/modules/products/dto/update-product.dto.ts`.

### 8. CREATE `apps/api/src/modules/discounts/dto/validate-discount.dto.ts`

- **IMPLEMENT**:
  ```ts
  export class ValidateDiscountDto {
    @ApiProperty({ example: 'SUMMER10' })
    @IsString()
    @MinLength(3)
    @MaxLength(64)
    code!: string;
  }
  ```

### 9. CREATE `apps/api/src/modules/discounts/dto/discount-response.dto.ts`

- **IMPLEMENT**: full `DiscountCode` shape with `@ApiProperty`/`@ApiPropertyOptional`
  on every field. Add a static `from(entity: DiscountEntity): DiscountResponseDto`
  helper mirroring `ProductResponseDto.from`.

### 10. CREATE `apps/api/src/modules/discounts/dto/discount-validation-response.dto.ts`

- **IMPLEMENT**: mirror the `DiscountValidation` interface. Include
  `static from(v: DiscountValidation): DiscountValidationResponseDto`.

### 11. CREATE `apps/api/src/modules/discounts/discounts.repository.ts`

- **IMPLEMENT**:
  - `constructor(private readonly prisma: PrismaService) {}`
  - `create(data: { code; percentOff: number | null; amountOff: number | null; expiresAt: Date | null }): Promise<DiscountEntity>` — `code` already uppercased by caller.
  - `findAll(pagination: { page; limit }): Promise<PaginatedResponse<DiscountEntity>>` — sort `createdAt desc`, use `$transaction([findMany, count])`.
  - `findById(id): Promise<DiscountEntity | null>`.
  - `findByCodeActive(code): Promise<DiscountEntity | null>` — `where: { code: code.toUpperCase().trim(), isActive: true }`.
  - `update(id, data): Promise<DiscountEntity>`.
  - `softDelete(id): Promise<DiscountEntity>` — `update where: { id }, data: { isActive: false }`.
  - `redeem(discountCodeId, orderId, amountApplied, tx?: Prisma.TransactionClient): Promise<boolean>` —
    inserts a `DiscountRedemption`, catches `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` → returns `false`. Returns `true` on success.
  - Private `toEntity(row)` mapping `Decimal → Number`.
- **PATTERN**: `products.repository.ts` (overall shape, `tx` parameter) + `payments/webhook-events.repository.ts` (`recordEvent` P2002 catch).
- **GOTCHA**: `amountOff` from Prisma is `Decimal`; map with `Number(row.amountOff)`. Coerce nulls correctly.

### 12. CREATE `apps/api/src/modules/discounts/discounts.service.ts`

- **IMPLEMENT** — inject `DiscountsRepository`, `CartService`, `WINSTON_MODULE_NEST_PROVIDER`, `ClsService`.
- Public methods:
  - `validate(code: string, identity: CartIdentity): Promise<DiscountValidation>` —
    1. `cart = await this.cart.getCart(identity)`.
    2. `subtotal = round2(sum(items.price * quantity))`.
    3. delegate to `validateForSubtotal(code, subtotal)`.
  - `validateForSubtotal(code: string, subtotal: number): Promise<DiscountValidation>` —
    1. If `subtotal === 0` → `BadRequestException('Cart is empty')`.
    2. `dc = await repo.findByCodeActive(code)`; if `null` → `NotFoundException('Discount code not found')` (inactive is indistinguishable from missing — no info leak).
    3. If `dc.expiresAt !== null && dc.expiresAt < new Date()` → `BadRequestException('Discount code expired')`.
    4. Compute:
       - `PERCENT` if `dc.percentOff !== null`: `amountApplied = round2(subtotal * dc.percentOff / 100)`, `type = 'PERCENT'`, `value = dc.percentOff`.
       - `AMOUNT` if `dc.amountOff !== null`: `amountApplied = Math.min(dc.amountOff, subtotal)`, `type = 'AMOUNT'`, `value = dc.amountOff`.
       - Else (data inconsistent) → throw `BadRequestException('Discount misconfigured')`.
    5. `total = round2(subtotal - amountApplied)`; clamp to `Math.max(0, total)`.
    6. Return `{ code: dc.code, discountId: dc.id, type, value, amountApplied, subtotal, total }`.
  - `redeem(discountId: string, orderId: string, amountApplied: number, tx?: Prisma.TransactionClient): Promise<void>` —
    wraps `repo.redeem`; on `false` (duplicate), logs `discount.service.redeem_duplicate_skipped` and throws `ConflictException('Discount already redeemed for this order')`.
  - `create(dto: CreateDiscountDto): Promise<DiscountEntity>` —
    1. Enforce XOR: `(percentOff !== undefined) !== (amountOff !== undefined)` → else `BadRequestException`.
    2. If `expiresAt` present and `< now` → `BadRequestException('expiresAt must be in the future')`.
    3. Persist with `code: dto.code.toUpperCase().trim()`, `percentOff: dto.percentOff ?? null`, `amountOff: dto.amountOff ?? null`, `expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null`. Catch P2002 on `code` → `ConflictException('Discount code already exists')`.
  - `findAll(pagination)`, `findById(id)` — service-layer wrappers; `findById` throws `NotFoundException` on null.
  - `update(id, dto)` — load existing, merge, re-run XOR check on the merged shape, then `repo.update`.
  - `remove(id)` — call `repo.softDelete`; idempotent (calling on already-inactive still succeeds because Prisma update by id without precondition).
- **LOGGING**: every public method logs `_started` and `_succeeded` with `requestId`.
- **GOTCHA**: never import `PrismaService`. Bring `round2` over as a private helper (`Math.round(n*100)/100`).
- **PATTERN**: `products.service.ts` + `payments.service.ts`.

### 13. CREATE `apps/api/src/modules/discounts/discounts.controller.ts`

- **IMPLEMENT**:
  - `@ApiTags('discounts') @Controller('discounts')`
  - `POST /validate` — `@UseGuards(OptionalJwtAuthGuard)`, `@OptionalUser() user`, `@Headers('x-cart-session') session`, body `ValidateDiscountDto`. Resolve `identity`:
    - if `user` → `{ type: 'user', id: user.id }`
    - else if `session` → `{ type: 'guest', id: session }`
    - else → `throw new BadRequestException('Missing auth or x-cart-session')`.
      Call `service.validate(dto.code, identity)`. Return `DiscountValidationResponseDto.from(...)`. `@ApiHeader({ name: 'x-cart-session', required: false })`.
  - `POST /` — admin: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth() @HttpCode(201)`.
  - `GET /` — admin, paginated; query DTO can reuse `FindOrdersQueryDto`-style or create a tiny inline `FindDiscountsQueryDto` that picks page/limit from `PaginationParamsSchema`. Simplest: build `FindDiscountsQueryDto` mirroring `find-products-query.dto.ts` without filters.
  - `GET /:id` — admin.
  - `PATCH /:id` — admin.
  - `DELETE /:id` — admin, `@HttpCode(204)`.
- **PATTERN**: `payments.controller.ts` (validate), `products.controller.ts` (CRUD).
- **GOTCHA**: import order — Node built-ins, external, monorepo (`@repo/types`), internal (`@/`), relative. Lint enforces.

### 14. CREATE `apps/api/src/modules/discounts/dto/find-discounts-query.dto.ts`

- **IMPLEMENT**: only page/limit with `@Type(() => Number) @IsInt() @Min(1)` and a `@Max(100)` on limit.
- **PATTERN**: `apps/api/src/modules/products/dto/find-products-query.dto.ts`.

### 15. CREATE `apps/api/src/modules/discounts/discounts.module.ts`

- **IMPLEMENT**:
  ```ts
  @Module({
    imports: [PrismaModule, CartModule],
    controllers: [DiscountsController],
    providers: [DiscountsService, DiscountsRepository],
    exports: [DiscountsService],
  })
  export class DiscountsModule {}
  ```
- **GOTCHA**: `exports: [DiscountsService]` — `OrdersModule` will import it.

### 16. UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: add `DiscountsModule` to the `imports` array (alphabetical placement after `CategoriesModule`).
- **VALIDATE**: `pnpm --filter api typecheck`.

### 17. UPDATE `apps/api/src/modules/orders/orders.module.ts`

- **IMPLEMENT**: add `DiscountsModule` to `imports`. Leave `exports: [OrdersService]` untouched.

### 18. UPDATE `apps/api/src/modules/orders/dto/create-order.dto.ts`

- **IMPLEMENT**: add optional `discountCode`:
  ```ts
  @ApiPropertyOptional({ example: 'SUMMER10', maxLength: 64 })
  @IsOptional() @IsString() @MaxLength(64)
  discountCode?: string;
  ```

### 19. UPDATE `apps/api/src/modules/orders/orders.repository.ts`

- **IMPLEMENT**:
  - Extend `CreateOrderData` interface with `discountCodeId: string | null` and `discountAmount: number | null`.
  - Refactor `create(data)` into `create(data, tx?: Prisma.TransactionClient)`:
    - Uses `tx ?? this.prisma`.
    - Persists `discountCodeId` and `discountAmount`.
  - Existing public callers pass no `tx` and behaviour is unchanged.
- **PATTERN**: `products.repository.ts → decrementStock(..., tx?)`.
- **GOTCHA**: `confirmAndDecrementStock` is unaffected; we keep stock decrement on payment success.

### 20. UPDATE `apps/api/src/modules/orders/orders.service.ts`

- **IMPLEMENT** the discount flow inside `create`:

  ```ts
  // after subtotal computed (rename `total` → `subtotal` in this scope)
  let discountCodeId: string | null = null;
  let discountAmount: number | null = null;
  let total = subtotal;
  if (dto.discountCode) {
    const v = await this.discounts.validateForSubtotal(dto.discountCode, subtotal);
    discountCodeId = v.discountId;
    discountAmount = v.amountApplied;
    total = v.total;
  }

  const order = await this.prisma.$transaction(async (tx) => {
    const created = await this.repository.create(
      { customerId, total, items, discountCodeId, discountAmount },
      tx,
    );
    if (discountCodeId) {
      await this.discounts.redeem(discountCodeId, created.id, discountAmount!, tx);
    }
    return created;
  });
  ```

- **WIRING**:
  - Inject `DiscountsService` (new field), `PrismaService` (for `$transaction`).
  - Add `discount.applied` payload to `order.service.create_succeeded` log.
  - Log `order.service.create_with_discount_succeeded` on the branch where a code was used.
- **GOTCHA**: `OrdersRepository.create` currently does NOT open a `$transaction`
  (payments work moved stock decrement out). We're re-introducing one to wrap
  `create + redeem` so the unique constraint failure cleanly rolls back the order.
  Use `this.prisma.$transaction` directly (inject `PrismaService` if not already).
- **GOTCHA**: still no email here — the payment webhook fires the confirmation.

### 21. CREATE `apps/api/test/factories/discount.factory.ts`

- **IMPLEMENT**:
  ```ts
  let counter = 0;
  export function createMockDiscount(overrides: Partial<DiscountEntity> = {}): DiscountEntity {
    counter++;
    return {
      id: `disc-${counter}`,
      code: `CODE${counter}`,
      percentOff: 10,
      amountOff: null,
      expiresAt: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }
  export function createMockDiscountValidation(
    overrides: Partial<DiscountValidation> = {},
  ): DiscountValidation {
    return {
      code: 'CODE1',
      discountId: 'disc-1',
      type: 'PERCENT',
      value: 10,
      amountApplied: 5,
      subtotal: 50,
      total: 45,
      ...overrides,
    };
  }
  ```
- **PATTERN**: `payment.factory.ts`.

### 22. CREATE `apps/api/src/modules/discounts/discounts.service.spec.ts`

- **IMPLEMENT** test cases (every branch in service):
  - `validate`: throws `NotFoundException` when repo returns null
  - `validate`: throws `NotFoundException` for inactive (same code path — `findByCodeActive` already filters)
  - `validate`: throws `BadRequestException` when `expiresAt < now`
  - `validate`: throws `BadRequestException` when subtotal is 0
  - `validate` PERCENT: `amountApplied = round2(subtotal * percent / 100)` (test 49.99 \* 10% = 5.00)
  - `validate` AMOUNT: capped at subtotal (amountOff=20, subtotal=15 → amountApplied=15, total=0)
  - `validate`: canonicalises `'summer10'` → calls repo with `'SUMMER10'`
  - `create`: throws when both percentOff and amountOff set
  - `create`: throws when neither set
  - `create`: throws when expiresAt in the past
  - `create`: persists uppercase code (assert repo.create called with `code: 'NEWCODE'` for input `'newcode'`)
  - `create`: maps P2002 to `ConflictException`
  - `update`: re-runs XOR (existing percent, update sets amountOff → conflict)
  - `remove`: calls `repo.softDelete`
  - `redeem`: returns void on success
  - `redeem`: throws `ConflictException` when repo returns `false`
- **PATTERN**: `payments.service.spec.ts` for mocks structure, `products.service.spec.ts` for CRUD shape.

### 23. CREATE `apps/api/src/modules/discounts/discounts.controller.spec.ts`

- **IMPLEMENT**:
  - `POST /validate` with `user` → resolves user identity → calls service.
  - `POST /validate` with `session` only → resolves guest identity.
  - `POST /validate` with neither → `BadRequestException`.
  - `POST /` calls `service.create`.
  - `DELETE /:id` returns 204 and calls `service.remove`.
- **PATTERN**: `payments.controller.spec.ts`.

### 24. UPDATE `apps/api/src/modules/orders/orders.service.spec.ts`

- **IMPLEMENT** new tests inside the existing `describe('create', …)`:
  - `creates with valid discountCode`: mock `discounts.validateForSubtotal` to return `{ amountApplied: 5, total: 20, … }`; assert repo.create called with `discountCodeId`, `discountAmount: 5`, `total: 20`; assert `discounts.redeem` called with the new order id.
  - `propagates BadRequestException from validateForSubtotal`: mock to reject → service rejects, repo.create NOT called.
  - `clamps total to 0 when amountOff > subtotal`: mock returns `{ amountApplied: subtotal, total: 0 }` → repo receives `total: 0`.
  - `propagates ConflictException from redeem`: mock redeem to throw → assertion on rejection; verify `$transaction` rolled back (repo.create assertion still satisfied because it's called inside the same tx; assert no subsequent cart.clear).
- **PATTERN**: existing `markPaid` block in this spec for mock layout.
- **GOTCHA**: mock the new `DiscountsService` dep with `jest.Mocked<Pick<DiscountsService, 'validateForSubtotal' | 'redeem'>>`.

### 25. VALIDATE end-to-end

Run all validation commands (see VALIDATION COMMANDS section).

---

## TESTING STRATEGY

### Unit Tests (Backend)

- `discounts.service.spec.ts`: full branch coverage on `validate`,
  `validateForSubtotal`, `create`, `update`, `remove`, `redeem`. Uses
  `createMockDiscount` and `createMockDiscountValidation`. Mocks repository and
  `CartService` (`getCart`).
- `discounts.controller.spec.ts`: identity resolution (user / guest / neither),
  admin endpoints pass-through.
- `orders.service.spec.ts` (delta): four discount branches inside `create`.

### E2E Tests (Frontend)

Out of scope for this plan. The Playwright checkout spec already covers the
non-discount path; an addendum can be filed after the admin UI is built.

### Edge Cases

- `code` arrives lowercase or mixed-case → must hit the same row.
- `code` with trailing whitespace → `trim()` before lookup.
- `expiresAt` exactly equals `new Date()` → treat as expired (use `<` so equal
  is allowed; document explicitly in the test).
- `subtotal === 0` → `BadRequestException`, no DB hit on discounts table.
- `amountOff > subtotal` → `amountApplied = subtotal`, `total = 0`.
- Double-submit of the same order with the same code (browser retry) →
  redemption insert returns `false` via P2002 → `ConflictException`,
  `$transaction` rolls back the order create, no orphan order.
- Concurrent redemption races: the unique `[discountCodeId, orderId]` index
  guarantees at most one redemption row per (code, order); we do not
  currently cap total redemptions per code (option c) — out of scope.
- Inactive code: indistinguishable from missing (404, not 410) to avoid
  enumeration.

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm --filter api lint
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm --filter api typecheck
pnpm --filter @repo/types typecheck
```

### Level 3: Unit Tests (backend)

```bash
pnpm --filter api test
```

### Level 4: Prisma client regenerate (after schema change)

```bash
pnpm --filter api prisma:generate
```

### Level 5: Migration (requires Docker)

```bash
docker compose up -d postgres
pnpm --filter api prisma:migrate
```

### Level 6: Manual smoke (Swagger / curl)

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

# Admin creates a discount
curl -s -X POST http://localhost:3001/discounts \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"SUMMER10","percentOff":10}'

# Add item to cart
curl -s -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"<seed-id>","quantity":2}'

# Validate
curl -s -X POST http://localhost:3001/discounts/validate \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"code":"summer10"}'   # → returns subtotal, amountApplied, total

# Place order with code
curl -s -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"discountCode":"SUMMER10"}'   # → Order.total = subtotal - 10%
```

Open `http://localhost:3001/docs` — verify the Discounts tag is present with 6
endpoints, and the request DTOs render with examples.

---

## ACCEPTANCE CRITERIA

- [ ] `DiscountsModule` registered in `app.module.ts`; `OrdersModule` imports it.
- [ ] `pnpm --filter api lint` → 0 errors, 0 warnings.
- [ ] `pnpm --filter api typecheck` → 0 errors.
- [ ] `pnpm --filter api test` → all suites green (existing 160 + new ≈ 20).
- [ ] Prisma migration `add_discount_redemptions` checked in.
- [ ] `Order` carries `discountCodeId` and `discountAmount` when a code was used.
- [ ] `DiscountRedemption` row exists for every successful discounted order.
- [ ] Public `POST /discounts/validate` works for both auth and guest carts.
- [ ] Admin CRUD endpoints are 403 to non-admin, 401 to anonymous.
- [ ] No regressions in existing orders / payments tests.

---

## NOTES

- **Decision: per-order redemption table (option b).** Justification: aligns with
  the idempotent-retry posture we already adopted for payments webhooks; gives
  the admin dashboard real data; cost is one extra row per discounted order.
  Option (c) — per-user cap — can be added later by adding
  `maxRedemptionsPerUser` to `DiscountCode` + a count query in `validate`.
- **Why `OrdersService` re-introduces a `$transaction`**: the payments work
  removed it from `OrdersRepository.create` because stock decrement moved to
  `confirmAndDecrementStock`. Wrapping `create + redeem` again at the service
  layer keeps redemption insertion atomic with order creation without
  resurrecting stock logic here.
- **Why XOR is enforced in the service, not the DTO**: `class-validator` lacks
  a clean "exactly-one-of" decorator. Implementing it as a custom validator
  would be over-engineering for two fields.
- **Why `findByCodeActive` returns null instead of throwing**: keeps the
  repository thin and lets the service decide between 404 (validate) and 409
  (create on duplicate).
- **Stripe interaction**: zero. `Payment.amount` derives from `Order.total`,
  which is already discount-adjusted. Stripe sees the discounted number.
- **Follow-ups (out of scope)**: admin UI in `apps/web/admin/discounts/`,
  Playwright spec for discounted checkout, per-user redemption cap.

**Confidence Score**: 8/10 that execution will succeed on first attempt.
Main risks: (a) `OrdersRepository.create` refactor must keep current behavior
under no-discount path; (b) hand-rolled migration SQL if Docker is offline; (c)
ensuring the `$transaction` rolls back cleanly on `ConflictException` from
`redeem`.
