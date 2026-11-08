---
description: /planning prompt for the discounts domain module (Step 12.5 of setup guide).
---

# Discounts Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `discounts` module under apps/api/src/modules/discounts/.

Follow the `products` module EXACTLY — same 9-file structure, same layer separation,
same test approach. Read every file in apps/api/src/modules/products/ before writing
anything. Then read apps/api/src/modules/cart/ and apps/api/src/modules/orders/ —
discounts plug into the cart-totals calculation and order creation; they do not
exist standalone. Also read apps/api/src/modules/payments/payments.service.ts +
.controller.ts to mirror the most recent reference for guest/auth ownership rules
(OptionalJwtAuthGuard pattern) and webhook-style idempotency error mapping.

The `DiscountCode` Prisma model ALREADY EXISTS (schema.prisma lines 164-177) — DO NOT
re-create it. No new migration is required UNLESS you decide a usage-tracking table is
needed (see USAGE TRACKING below); if so, generate one migration named `add-discount-usage`.

---

DOMAIN RULES:

Existing schema (do not change unless usage tracking is added):

    model DiscountCode {
      id         String    @id @default(cuid())
      code       String    @unique          // case-insensitive lookup — uppercase on write
      percentOff Int?                       // 1-100, mutually exclusive with amountOff
      amountOff  Decimal?  @db.Decimal(10, 2)  // major units (e.g., 5.00)
      expiresAt  DateTime?
      isActive   Boolean   @default(true)
      createdAt  DateTime  @default(now())
      updatedAt  DateTime  @updatedAt
      @@index([isActive])
    }

Application-enforced invariants (Prisma can't express CHECK constraints yet):

- Exactly ONE of (percentOff, amountOff) must be set on create/update — reject both-null and both-set with BadRequestException.
- percentOff ∈ [1, 100]; amountOff > 0.
- `code` is stored UPPERCASE (`code.toUpperCase().trim()`) and looked up by the same canonical form. The frontend can send any case.
- `expiresAt`, if present, must be in the future on create.

USAGE TRACKING — planning decision required:
Option (a) Stateless: DiscountCode is reusable forever until isActive=false or expiresAt passes.
No new table, simplest. Recommended for MVP — matches the existing schema.
Option (b) Per-order: add `DiscountRedemption(id, discountCodeId, orderId, amountApplied, createdAt)`
with `@@unique([discountCodeId, orderId])` for idempotency. Enables "one redemption per order"
and historical reporting later.
Option (c) Per-user cap: extends (b) with a `maxRedemptionsPerUser` column on DiscountCode.
Pick ONE in the plan, justify it, and only add the migration if (b) or (c). Default recommendation: (b)
because the orders/payments modules already expect idempotent retries and we'll want the audit trail
for the admin dashboard.

Shared types (packages/types/src/discount.types.ts — NEW, add to barrel in src/index.ts):

- export interface DiscountCode { id, code, percentOff: number | null, amountOff: number | null,
  expiresAt: Date | null, isActive, createdAt, updatedAt }
- export interface DiscountValidation {
  code: string;
  discountId: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number; // percentOff (1-100) or amountOff (major units)
  amountApplied: number; // resolved against the cart subtotal in major units
  subtotal: number;
  total: number; // subtotal - amountApplied, never below 0
  }
- Pure Zod schemas + inferred types only — no class-validator, no @ApiProperty.

---

API ENDPOINTS (controller):

PUBLIC / CUSTOMER:

POST /discounts/validate
— Body: { code: string }
— Auth: OptionalJwtAuthGuard (mirror payments.controller — guests can use codes during checkout)
— Resolves the user's / guest's current cart (mirror CartService identity resolution exactly:
`req.user` → user identity; `x-cart-session` header → guest identity; missing both → 400).
— Validates: code exists (case-insensitive), isActive, not expired.
— Computes amountApplied against cart subtotal:
type=PERCENT → round((subtotal \* percentOff) / 100, 2)
type=AMOUNT → min(amountOff, subtotal) // never discount more than the subtotal
— Returns DiscountValidation. DOES NOT mutate cart state. DOES NOT consume the code.
— Errors:
NotFound — code does not exist OR isActive=false
BadRequest — expired (expiresAt < now)
BadRequest — cart is empty (subtotal === 0)
BadRequest — if option (b/c) chosen: code already redeemed by this user/order

ADMIN-ONLY (mirror products.controller admin endpoints — JwtAuthGuard + RolesGuard, @Roles('ADMIN')):

POST /discounts — create a code (CreateDiscountDto)
GET /discounts — paginated list (PaginationParamsSchema; default sort: createdAt desc)
GET /discounts/:id — fetch one by id
PATCH /discounts/:id — update (UpdateDiscountDto — partial); re-validate XOR percent/amount invariant
DELETE /discounts/:id — soft-delete (set isActive=false; never hard-delete — audit trail)

All endpoints: @ApiTags('discounts'), @ApiOperation, @ApiResponse, bearer auth on Swagger.

---

ORDER INTEGRATION (touch OrdersService — minimal surface change):

Goal: when the customer submits the order, the optional discount code is applied
to the order total. Stretch goal: persist the redemption (option b/c).

Schema change (only if discount is persisted on Order — planning decision):
Recommended: add to Order
discountCodeId String? @db.VarChar(...) // FK to DiscountCode
discountAmount Decimal? @db.Decimal(10,2)

- @@index([discountCodeId])
  Migration name: `add-order-discount-fields`. Document the choice in the plan.

CreateOrderDto (extend in apps/api/src/modules/orders/dto/create-order.dto.ts):

- @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) discountCode?: string;

OrdersService.create flow (update existing — do NOT duplicate validation logic):

1. Resolve cart as today.
2. Compute `subtotal` from cart items as today.
3. If `dto.discountCode` present:
   a. Call DiscountsService.validateForSubtotal(code, subtotal) — a method that
   mirrors the controller validate endpoint but takes subtotal as an arg so it
   can be called from inside the existing Order $transaction without re-resolving cart.
   b. Compute `total = subtotal - validation.amountApplied`.
   c. If option (b/c) chosen: inside the same $transaction, INSERT a DiscountRedemption row;
   catch P2002 → throw ConflictException('Discount already redeemed for this order').
   d. Persist discountCodeId + discountAmount on the Order row (if Order schema was extended).
   Else `total = subtotal`.
4. Persist Order as today.
5. Log `order.service.create_with_discount_succeeded` with { discountCode, amountApplied, total }
   when applicable.

DO NOT touch payments — the Payment.amount continues to come from Order.total, which is
already discount-adjusted by step 4. Stripe sees the final number.

---

SERVICE RULES:

DiscountsService methods:
validate(code, identity): full controller flow — resolves cart, validates, computes
validateForSubtotal(code, subtotal, options): cart-agnostic variant used by OrdersService
redeem(code, orderId, tx?): inserts a DiscountRedemption row (option b/c only)
create(dto): admin — validates XOR invariant, uppercases code, persists
findAll(pagination): paginated list
findById(id): single fetch (NotFound if missing)
findByCodeActive(code): canonical case-insensitive lookup used by validate
update(id, dto): re-runs XOR invariant
remove(id): soft-delete (set isActive=false), idempotent

- NEVER imports PrismaService directly — all queries go through DiscountsRepository.
- Inject CartService for `validate` (cart subtotal resolution).
- Inject CLS for requestId.
- Logging dot-namespaces:
  discount.service.validate_started / \_succeeded / \_failed
  discount.service.create_started / \_succeeded / \_failed
  discount.service.redeem_succeeded / \_duplicate_skipped

DiscountsRepository methods:
create(data)
findAll(pagination)
findById(id)
findByCodeActive(code) // WHERE code = UPPER($1) AND isActive = true
update(id, data)
softDelete(id)
redeem(discountCodeId, orderId, amountApplied, tx?) // option (b/c) only; returns boolean
— uses tx if provided so OrdersService can include it in its existing $transaction
— catches P2002 on @@unique([discountCodeId, orderId]) → returns false (already redeemed)

---

DTOs:

CreateDiscountDto:
@ApiProperty({ example: 'SUMMER10' }) @IsString() @MinLength(3) @MaxLength(64) @Matches(/^[A-Z0-9-_]+$/i) code: string;
@ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 }) @IsOptional() @IsInt() @Min(1) @Max(100) percentOff?: number;
@ApiPropertyOptional({ example: 5.00, minimum: 0.01 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountOff?: number;
@ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
Implements Pick<DiscountCode, 'code' | 'percentOff' | 'amountOff'>.

UpdateDiscountDto: extends PartialType(CreateDiscountDto); same XOR rule enforced in the service.

ValidateDiscountDto: { @ApiProperty() @IsString() @MinLength(3) @MaxLength(64) code: string }

DiscountResponseDto: full DiscountCode shape with @ApiProperty on every field.
DiscountValidationResponseDto: full DiscountValidation shape.

---

CONFIG:

No new env vars. (Stretch: DISCOUNT_MAX_PERCENT default for future "stack with other promos"
guardrails — but skip unless planning sees a need.)

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/discount.factory.ts:
createMockDiscountCode(overrides) — defaults: PERCENT 10, active, no expiry
createMockDiscountValidation(overrides)

discounts.service.spec.ts (MUST cover, every branch):
validate: throws NotFound when code missing
validate: throws NotFound when isActive=false (treat inactive as nonexistent — no info leak)
validate: throws BadRequest when expired
validate: throws BadRequest when cart subtotal is 0
validate (PERCENT): computes amountApplied as round(subtotal \* percentOff / 100, 2)
validate (AMOUNT): amountApplied capped at subtotal (never negative total)
validate: canonicalises lowercase input ('summer10' → 'SUMMER10')
create: throws BadRequest when both percentOff and amountOff are set
create: throws BadRequest when neither is set
create: throws BadRequest when expiresAt is in the past
create: persists uppercase code
update: re-validates XOR invariant
remove: sets isActive=false (does NOT delete the row)
redeem (option b/c only): returns true on insert
redeem: returns false on duplicate (P2002 caught)

discounts.controller.spec.ts:
POST /discounts/validate (guest): 200 with payload when x-cart-session present
POST /discounts/validate (user): 200 with payload under JWT
POST /discounts/validate: 400 when neither auth nor x-cart-session
POST /discounts (admin): 201; non-admin → 403
DELETE /discounts/:id: 204, row's isActive flipped (verify via mocked repo)

orders.service.spec.ts (update existing):
create with valid discountCode: total = subtotal - amountApplied; Order row carries discountCodeId/discountAmount (if schema extended)
create with invalid discountCode: surfaces the BadRequestException from validateForSubtotal — order is NOT created
create with discountCode that exceeds subtotal: total clamped to 0, no negative total persisted
create with discountCode already redeemed for this order (option b/c, idempotent retry): throws ConflictException, no duplicate row

Register DiscountsModule in apps/api/src/app.module.ts.

---

VALIDATE after implementation:
docker compose up -d postgres redis
pnpm --filter api prisma:generate

# Migration only if a new model was added per the planning decision above

pnpm --filter api prisma:migrate -- --name add-discount-usage # optional
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api dev

# End-to-end smoke (admin login + create code + customer validate + checkout with code):

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

# 1. Create discount code (admin)

curl -s -X POST http://localhost:3001/discounts \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"code":"SUMMER10","percentOff":10}'

# 2. Add an item to cart

curl -s -X POST http://localhost:3001/cart/items \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"productId":"<id-from-seed>","quantity":2}'

# 3. Validate discount against the current cart

curl -s -X POST http://localhost:3001/discounts/validate \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"code":"summer10"}'

# → returns subtotal, amountApplied (= subtotal \* 0.10 rounded), total

# 4. Create order with discount

curl -s -X POST http://localhost:3001/orders \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"discountCode":"SUMMER10"}'

# → Order.total reflects the discounted amount; if option (b/c), a DiscountRedemption row exists

# 5. Soft-delete and verify it can't be re-used

curl -s -X DELETE http://localhost:3001/discounts/<id> \
 -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3001/discounts/validate \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"code":"SUMMER10"}'

# → 404

open http://localhost:3001/docs # Discounts section visible with 6 endpoints
