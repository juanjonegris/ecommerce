# Feature: payments-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Add a `payments` module to `apps/api` that mediates between the existing `orders` module and an external payment provider (Stripe to start, MercadoPago later). It exposes endpoints to create a payment intent for a PENDING order, receive provider webhooks to finalize the order, and read payment history. The provider is hidden behind a `PaymentProviderAdapter` interface bound to a DI token, mirroring the existing `MAIL_SERVICE` swappable-provider pattern. Also updates the Next.js Stripe webhook Route Handler at `apps/web/src/app/api/webhooks/stripe/route.ts` to forward raw bytes (signature-preserving) to the NestJS endpoint.

## User Story

As a customer who has placed a PENDING order
I want to pay with a card via Stripe Elements
So that my order becomes CONFIRMED automatically once the payment succeeds, and I receive an order-paid confirmation email

As an admin / platform operator
I want a single, swappable `PaymentProvider` abstraction
So that we can add MercadoPago for LATAM forks without touching call sites

## Problem Statement

`OrdersService.create` currently transitions a cart into a PENDING order and (incorrectly, for an unpaid order) enqueues an "order confirmation" email immediately on create. There is no payment capture, no way to move PENDING → CONFIRMED programmatically from a third party, no idempotency log for provider webhook retries, and no abstraction that would let MercadoPago plug in alongside Stripe.

## Solution Statement

1. New `payments` NestJS module under `apps/api/src/modules/payments/`, mirroring the canonical `products` module's 9-file structure.
2. `PaymentProviderAdapter` interface + `PAYMENT_PROVIDER` DI token. Two implementations: `StripeProvider` (real) and `StubPaymentProvider` (dev — selected when `STRIPE_SECRET_KEY` is empty, exactly like `ResendMailService`'s dev stub).
3. New Prisma models `Payment` and `WebhookEvent` (idempotency log), plus a `payments` relation on `Order`. New migration `add-payments`.
4. New `OrdersService.markPaid(orderId)` method called by the webhook handler — transitions PENDING → CONFIRMED inside a `$transaction`, idempotent on already-CONFIRMED orders.
5. **Refactor**: remove stock decrement and the on-create email from `OrdersService.create` / `OrdersRepository.create`; move both into `markPaid`. Stock is reserved on payment success, not on cart checkout. Email becomes `order-paid`, fired only after CONFIRMED.
6. Next.js webhook Route Handler reads raw bytes and forwards verbatim to `POST /payments/webhook` on the NestJS side; signature verification happens once on the API.
7. Shared `Payment`, `PaymentStatus`, `PaymentProvider` types in `@repo/types` (pure, no decorators).

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `.claude/references/payments-module-prompt.md` — Source brief (this plan implements it).
- `apps/api/src/modules/products/products.{module,controller,service,repository}.ts` — Canonical 9-file module. Mirror file structure, naming, and layering exactly.
- `apps/api/src/modules/products/products.service.spec.ts` — Test pattern for services with mocked repositories.
- `apps/api/src/modules/orders/orders.module.ts` — Imports `PrismaModule`, `ProductsModule`, `CartModule`, `QueuesModule`. Currently does NOT export `OrdersService`; we will add `exports: [OrdersService]`.
- `apps/api/src/modules/orders/orders.service.ts` (lines 54-125, 152-197) — `create()` will be slimmed (stock + email move out); new `markPaid()` method added; `VALID_TRANSITIONS` map (lines 29-35) reused.
- `apps/api/src/modules/orders/orders.repository.ts` (lines 41-65) — Stock decrement currently lives in `create()`; will move to a new `confirmAndDecrementStock(orderId, tx?)` method called from `markPaid`. `decrementStock` lives in `ProductsRepository` (products.repository.ts:95-105) but is currently unguarded — add an out-of-stock guard.
- `apps/api/src/modules/orders/orders.service.spec.ts` — Update: `create` no longer enqueues email or decrements stock; add `markPaid` tests.
- `apps/api/src/mail/mail.service.ts` (lines 21-47) — Pattern for swappable provider: `interface` + `const TOKEN` + class implementation + dev-stub-when-key-empty branch in constructor. **MIRROR EXACTLY.**
- `apps/api/src/mail/mail.module.ts` — Pattern for binding the implementation to the token via `{ provide: MAIL_SERVICE, useClass: ResendMailService }`.
- `apps/api/src/queues/queues.module.ts`, `apps/api/src/queues/emails/email-queue.service.ts`, `email-job.types.ts` — Pattern for typed queue producer + BullMQ job names + requestId propagation via CLS.
- `apps/api/src/config/configuration.ts` — Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` to the Zod schema.
- `apps/api/src/main.ts` (lines 19-31) — Bootstrap. NestFactory.create currently has no `rawBody`. Update to `{ bufferLogs: true, rawBody: true }` so the webhook handler can access `req.rawBody`.
- `apps/api/src/app.module.ts` (lines 22-53) — Module registration order. Add `PaymentsModule` after `OrdersModule`.
- `apps/api/src/common/guards/roles.guard.ts`, `apps/api/src/common/decorators/roles.decorator.ts` — Role-protection pattern for admin endpoints.
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/api/src/common/guards/optional-jwt-auth.guard.ts` — JWT + optional-JWT guards (orders uses both; payments uses both).
- `apps/api/src/modules/auth/decorators/{current-user,optional-user}.decorator.ts` — Decorator pattern for `@CurrentUser()` and `@OptionalUser()`.
- `apps/api/test/factories/order.factory.ts`, `apps/api/test/factories/product.factory.ts` — Factory pattern. New `payment.factory.ts` follows the same shape.
- `packages/types/src/order.types.ts`, `packages/types/src/index.ts` — Shared-types pattern (interface + Zod schema, exported through barrel).
- `apps/api/prisma/schema.prisma` (lines 88-115) — Existing `Order` model; new `payments Payment[]` relation goes here.
- `apps/api/package.json` (lines 26-58) — Dependency list. `stripe` SDK not yet installed.
- `apps/web/src/app/api/webhooks/stripe/route.ts` — Stub route to refactor.
- `apps/web/AGENTS.md` — **Read Next.js in-tree docs at `node_modules/next/dist/docs/` before touching the Route Handler** — App Router raw-body APIs may differ from training data.
- `.env.example` — Add the three new Stripe vars.

### New Files to Create

```
apps/api/src/modules/payments/
├── payments.module.ts
├── payments.controller.ts
├── payments.service.ts
├── payments.repository.ts
├── webhook-events.repository.ts
├── dto/
│   ├── create-intent.dto.ts
│   ├── create-intent-response.dto.ts
│   └── payment-response.dto.ts
├── entities/
│   └── payment.entity.ts
├── providers/
│   ├── payment-provider.interface.ts
│   ├── stripe.provider.ts
│   └── stub.provider.ts
├── payments.controller.spec.ts
├── payments.service.spec.ts
├── providers/stripe.provider.spec.ts
└── providers/stub.provider.spec.ts

apps/api/test/factories/payment.factory.ts
packages/types/src/payment.types.ts
apps/api/prisma/migrations/<timestamp>_add_payments/migration.sql   (Prisma-generated)
```

### Patterns to Follow

- **Naming**: kebab-case files, PascalCase classes, camelCase methods. (CLAUDE.md §4)
- **Layer separation**: Controller (HTTP only) → Service (logic, throws HttpExceptions) → Repository (Prisma only). NEVER `PrismaService` in services. (CLAUDE.md §3)
- **DI for swappable provider**: `const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';` (string token like `MAIL_SERVICE`, not a Symbol — keeps it consistent with the rest of the codebase). Bind via `{ provide: PAYMENT_PROVIDER, useClass: ... }`. Consumers use `@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProviderAdapter`.
- **DTOs**: implement `Pick<Payment, ...>` from `@repo/types`, decorate with `class-validator` + `@ApiProperty`. (CLAUDE.md §7)
- **Logging**: `nest-winston` injected as `LoggerService`, structured payload with `message: 'payment.<component>.<verb>_<state>'` and `requestId` from CLS. (CLAUDE.md §5)
- **Error mapping**: `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`. (CLAUDE.md §7)
- **No raw SQL**, no `any`, `strict: true`. (CLAUDE.md §1)
- **Tests**: co-located `.spec.ts`, factories under `apps/api/test/factories/`, 80% coverage threshold.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — types, schema, config, deps

1. Install `stripe` SDK in `apps/api`.
2. Add `Payment`, `WebhookEvent`, enums to Prisma schema + run migration.
3. Add `STRIPE_*` to config Zod schema and `.env.example`.
4. Add `Payment`, `PaymentStatus`, `PaymentProvider` to `@repo/types`.

### Phase 2: Provider abstraction

5. Define `PaymentProviderAdapter` interface + `PAYMENT_PROVIDER` token.
6. Implement `StripeProvider` (real) + `StubPaymentProvider` (dev fallback).

### Phase 3: Core module

7. Build `payments` module 9-file structure (controller, service, repos, dto, entity).
8. Webhook endpoint: raw-body access, signature verify, idempotency via `WebhookEvent`.
9. Enable `rawBody: true` in `main.ts`.

### Phase 4: Orders integration

10. Add `OrdersService.markPaid(orderId)` — PENDING → CONFIRMED transaction with stock decrement.
11. Add `OrdersRepository.confirmAndDecrementStock(orderId)` — atomic `$transaction`.
12. Harden `ProductsRepository.decrementStock` with stock-availability guard + `OutOfStockError`.
13. **Remove** stock decrement from `OrdersRepository.create` and email-enqueue from `OrdersService.create`. The on-create email becomes an on-payment-success email enqueued from `markPaid`. Update existing orders specs accordingly.
14. Export `OrdersService` from `OrdersModule`. Import `OrdersModule` from `PaymentsModule`.

### Phase 5: Frontend webhook forwarder

15. Update `apps/web/src/app/api/webhooks/stripe/route.ts` to read raw bytes and POST to `${API_URL}/payments/webhook`, preserving the `stripe-signature` header and the upstream response.

### Phase 6: Tests + validation

16. Service, controller, provider, stub specs. Add `payment.factory.ts`. Update `orders.service.spec.ts`.
17. Manual smoke via Swagger + dev-stub provider.

---

## STEP-BY-STEP TASKS

### 1. ADD stripe SDK dependency

- **IMPLEMENT**: `pnpm --filter @repo/api add stripe`
- **VALIDATE**: `grep '"stripe"' apps/api/package.json`

### 2. UPDATE `apps/api/prisma/schema.prisma`

- **IMPLEMENT**: Add two enums + two models + relation on `Order`:

  ```prisma
  enum PaymentStatus { REQUIRES_PAYMENT_METHOD PROCESSING SUCCEEDED FAILED CANCELLED REFUNDED }
  enum PaymentProvider { STRIPE MERCADO_PAGO }

  model Payment {
    id                String          @id @default(cuid())
    orderId           String
    provider          PaymentProvider
    providerPaymentId String
    status            PaymentStatus   @default(REQUIRES_PAYMENT_METHOD)
    amount            Decimal         @db.Decimal(10, 2)
    currency          String          @db.Char(3)
    clientSecret      String?
    failureReason     String?
    createdAt         DateTime        @default(now())
    updatedAt         DateTime        @updatedAt
    order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)
    @@unique([provider, providerPaymentId])
    @@index([orderId])
    @@index([status])
  }

  model WebhookEvent {
    id         String          @id @default(cuid())
    provider   PaymentProvider
    eventId    String
    type       String
    receivedAt DateTime        @default(now())
    @@unique([provider, eventId])
    @@index([type])
  }
  ```

- Add `payments Payment[]` to the `Order` model.
- **VALIDATE**: `pnpm --filter @repo/api prisma:migrate -- --name add-payments` runs cleanly; `pnpm --filter @repo/api prisma:generate` regenerates client.

### 3. UPDATE `apps/api/src/config/configuration.ts`

- **IMPLEMENT**: Append to `ConfigSchema`:
  ```ts
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_CURRENCY: z.string().length(3).default('usd'),
  ```
- **PATTERN**: `RESEND_API_KEY` (line 21) — empty default enables dev stub.
- **VALIDATE**: `pnpm --filter @repo/api typecheck`

### 4. UPDATE `.env.example`

- **IMPLEMENT**: After mail section, add:
  ```
  STRIPE_SECRET_KEY=
  STRIPE_WEBHOOK_SECRET=
  STRIPE_CURRENCY=usd
  ```
- Comment: empty `STRIPE_SECRET_KEY` activates the dev stub provider.

### 5. CREATE `packages/types/src/payment.types.ts`

- **IMPLEMENT**: Mirror `order.types.ts` shape: Zod schemas + inferred TS types.
  ```ts
  export const PaymentStatusSchema = z.enum(['REQUIRES_PAYMENT_METHOD','PROCESSING','SUCCEEDED','FAILED','CANCELLED','REFUNDED']);
  export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
  export const PaymentProviderSchema = z.enum(['STRIPE','MERCADO_PAGO']);
  export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;
  export interface Payment { id; orderId; provider: PaymentProvider; providerPaymentId: string; status: PaymentStatus; amount: number; currency: string; clientSecret: string | null; failureReason: string | null; createdAt: Date; updatedAt: Date; }
  export const PaymentSchema = z.object({ ... });
  ```
- **PATTERN**: `packages/types/src/order.types.ts`.
- **GOTCHA**: NO `class-validator` or `@ApiProperty` decorators in `@repo/types`.

### 6. UPDATE `packages/types/src/index.ts`

- **IMPLEMENT**: Add `export * from './payment.types';` to the barrel.

### 7. CREATE `apps/api/src/modules/payments/providers/payment-provider.interface.ts`

- **IMPLEMENT**:
  ```ts
  import type { PaymentProvider, PaymentStatus } from '@repo/types';
  export interface CreateIntentInput {
    orderId: string;
    amount: number;
    currency: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }
  export interface CreateIntentResult {
    providerPaymentId: string;
    clientSecret: string;
  }
  export interface VerifiedWebhook {
    eventId: string;
    type: string;
    providerPaymentId: string;
    status: PaymentStatus;
    amountReceived?: number;
    failureReason?: string;
  }
  export interface PaymentProviderAdapter {
    readonly name: PaymentProvider;
    createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
    verifyWebhook(rawBody: Buffer, signatureHeader: string): Promise<VerifiedWebhook | null>;
  }
  export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
  ```
- **GOTCHA**: `verifyWebhook` returns `null` for event types we don't care about (e.g. `customer.updated`) so the handler can ack 200 without acting.

### 8. CREATE `apps/api/src/modules/payments/providers/stripe.provider.ts`

- **IMPLEMENT**: Class `StripeProvider implements PaymentProviderAdapter`. Constructor injects `ConfigService`. Build `new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })` lazily; if key empty, throw on construction (the module factory below picks the stub instead, so this branch is unreachable in dev).
- `createIntent`: `stripe.paymentIntents.create({ amount: Math.round(input.amount * 100), currency: input.currency, automatic_payment_methods: { enabled: true }, metadata: { orderId: input.orderId, ...(input.metadata ?? {}) }, receipt_email: input.customerEmail })`. Return `{ providerPaymentId: pi.id, clientSecret: pi.client_secret ?? '' }`.
- `verifyWebhook`: `stripe.webhooks.constructEvent(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)`. Map event types:
  - `payment_intent.succeeded` → `SUCCEEDED`
  - `payment_intent.processing` → `PROCESSING`
  - `payment_intent.payment_failed` → `FAILED` (capture `last_payment_error?.message` into `failureReason`)
  - `payment_intent.canceled` → `CANCELLED`
  - `charge.refunded` → `REFUNDED`
  - any other → return `null`.
- Logs: `payment.provider.stripe.{create_intent,verify_webhook}_{started,succeeded,failed}` with `requestId` from CLS.
- **PATTERN**: `ResendMailService` constructor + dev-stub branching.

### 9. CREATE `apps/api/src/modules/payments/providers/stub.provider.ts`

- **IMPLEMENT**: `StubPaymentProvider implements PaymentProviderAdapter` — used when `STRIPE_SECRET_KEY` empty.
- `createIntent`: returns `{ providerPaymentId: \`pi*stub*${randomUUID()}\`, clientSecret: \`cs_stub_${randomUUID()}\` }`. Logs `payment.provider.stub.create_intent_succeeded`.
- `verifyWebhook`: accepts a sentinel signature header `'stub'` and parses the rawBody as JSON `{ eventId, type, providerPaymentId, status }`. Any other signature → throw `BadRequestException`. This lets manual `curl` testing work without a real Stripe key.

### 10. CREATE `apps/api/src/modules/payments/webhook-events.repository.ts`

- **IMPLEMENT**: One method `recordEvent(provider, eventId, type): Promise<boolean>` — wraps `prisma.webhookEvent.create` in try/catch; on `P2002` (unique violation) returns `false`; otherwise `true`. This is the idempotency primitive.
- **PATTERN**: `apps/api/src/modules/products/products.repository.ts:66-77` for repository shape; Prisma `P2002` error code is the standard unique-constraint identifier.

### 11. CREATE `apps/api/src/modules/payments/payments.repository.ts`

- **IMPLEMENT**: Methods:
  - `create(data: { orderId; provider; providerPaymentId; amount; currency; clientSecret }): PaymentEntity`
  - `findById(id): PaymentEntity | null`
  - `findByProviderPaymentId(provider, providerPaymentId): PaymentEntity | null`
  - `findByOrder(orderId): PaymentEntity[]`
  - `existsSucceededForOrder(orderId): boolean` (used by `createIntent` to prevent double-pay)
  - `updateStatus(id, status, failureReason?): PaymentEntity`
- **PATTERN**: `OrdersRepository.findById` (orders.repository.ts:92-98). Map Prisma rows → `PaymentEntity` via private `toEntity`.

### 12. CREATE `apps/api/src/modules/payments/entities/payment.entity.ts` and `dto/*.ts`

- `entities/payment.entity.ts`: class implementing the `Payment` shared type. Plain class (no decorators), camelCase fields.
- `dto/create-intent.dto.ts`: `class CreateIntentDto { @ApiProperty() @IsString() orderId: string }`.
- `dto/create-intent-response.dto.ts`: `{ paymentId, providerPaymentId, clientSecret }` with `@ApiProperty`.
- `dto/payment-response.dto.ts`: full payment shape — but **omit `clientSecret`** in `from(entity)` factory (mark `clientSecret` field on response as not set; only the `createIntent` response carries it).
- **PATTERN**: `apps/api/src/modules/orders/dto/*` (especially `OrderResponseDto.from`).

### 13. CREATE `apps/api/src/modules/payments/payments.service.ts`

- **IMPLEMENT**: Inject `PaymentsRepository`, `WebhookEventsRepository`, `@Inject(PAYMENT_PROVIDER) provider`, `OrdersService`, `ConfigService`, `LoggerService`, `ClsService`.
- `createIntent(orderId, actor: { id; role } | null, sessionId: string | undefined): { paymentId; providerPaymentId; clientSecret }`:
  1. Fetch order via `ordersService.findByIdInternal(orderId)` (see Task 19 — a non-ownership-checking internal getter). Throw `NotFoundException` if missing.
  2. Ownership rule: if `order.customerId !== null` → must have JWT actor matching, OR actor.role === ADMIN. If `order.customerId === null` (guest) → require non-empty `sessionId` header; we accept any non-empty session (the order ID is opaque enough; in a real production fork we'd persist `cartSessionId` on Order — out of scope here, document as a TODO).
  3. Throw `BadRequestException` if `order.status !== 'PENDING'`.
  4. Throw `ConflictException` if `paymentsRepo.existsSucceededForOrder(orderId)`.
  5. Read `currency = config.get('STRIPE_CURRENCY')`.
  6. `result = await provider.createIntent({ orderId, amount: order.total, currency, customerEmail: actor email if any, metadata: { orderId } })`.
  7. `payment = await paymentsRepo.create({ orderId, provider: provider.name, providerPaymentId: result.providerPaymentId, amount: order.total, currency, clientSecret: result.clientSecret })`.
  8. Log `payment.service.create_intent_succeeded`. Return `{ paymentId: payment.id, providerPaymentId, clientSecret }`.
- `handleWebhook(rawBody: Buffer, signature: string): Promise<void>`:
  1. `verified = await provider.verifyWebhook(rawBody, signature)`. If provider throws → rethrow as `BadRequestException`. If `verified === null` (uninteresting event) → log `payment.webhook.ignored`, return.
  2. `inserted = await webhookEventsRepo.recordEvent(provider.name, verified.eventId, verified.type)`. If `inserted === false` → log `payment.webhook.duplicate_skipped`, return.
  3. `payment = await paymentsRepo.findByProviderPaymentId(provider.name, verified.providerPaymentId)`. If null → log `payment.webhook.unknown_payment`, return (don't 4xx — Stripe may have created the PI via a different path; idempotency-friendly).
  4. `await paymentsRepo.updateStatus(payment.id, verified.status, verified.failureReason)`.
  5. If `verified.status === 'SUCCEEDED'`: `await ordersService.markPaid(payment.orderId, { customerEmail: optional })`. Catch `OutOfStockError` → `await paymentsRepo.updateStatus(payment.id, 'FAILED', 'STOCK_CONFLICT')` and log `payment.webhook.stock_conflict`. Do NOT rethrow — Stripe webhook must respond 200 (idempotency).
- `findById(id, actor)`: ownership check (customer fetches own payments only; ADMIN any). `NotFound` / `Forbidden`.
- `findByOrder(orderId, actor)`: same ownership rule against the order's customerId.
- **Logging dot-namespaces**: `payment.service.create_intent_{started,succeeded,failed}`, `payment.webhook.{received,verified,duplicate_skipped,ignored,unknown_payment,processed,stock_conflict,failed}`.

### 14. CREATE `apps/api/src/modules/payments/payments.controller.ts`

- **IMPLEMENT**:
  ```
  POST /payments/intent       OptionalJwtAuthGuard   @ApiTags('payments')
  POST /payments/webhook      NO guards              @ApiExcludeEndpoint() — @Req() raw access
  GET  /payments/:id          JwtAuthGuard
  GET  /payments/order/:orderId  JwtAuthGuard
  ```
- Body `CreateIntentDto` for `/intent`; `@Headers('x-cart-session')` for session.
- For `/webhook`: signature: `handleWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string)`. Use `req.rawBody!` (guaranteed by `rawBody: true` in main.ts). Always return `{ received: true }` after `service.handleWebhook(...)` resolves; let unhandled exceptions become 4xx via the global filter (only `BadRequestException` from signature failures should escape — internal errors are swallowed inside `handleWebhook` to preserve idempotency).
- **PATTERN**: `orders.controller.ts:46-62` (OptionalJwtAuth, session header, ApiHeader). `products.controller.ts:62-74` (JwtAuth + Roles + ApiBearerAuth).
- **Imports**: `import type { RawBodyRequest } from '@nestjs/common';`.

### 15. CREATE `apps/api/src/modules/payments/payments.module.ts`

- **IMPLEMENT**:
  ```ts
  @Module({
    imports: [PrismaModule, ConfigModule, OrdersModule],
    controllers: [PaymentsController],
    providers: [
      PaymentsService,
      PaymentsRepository,
      WebhookEventsRepository,
      {
        provide: PAYMENT_PROVIDER,
        inject: [ConfigService, WINSTON_MODULE_NEST_PROVIDER, ClsService],
        useFactory: (config, logger, cls) => {
          const key = config.get('STRIPE_SECRET_KEY') ?? '';
          return key
            ? new StripeProvider(config, logger, cls)
            : new StubPaymentProvider(logger, cls);
        },
      },
    ],
  })
  ```
- **GOTCHA**: useFactory selects stub vs real provider at boot. No env check anywhere else.

### 16. UPDATE `apps/api/src/main.ts`

- **IMPLEMENT**: `NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })`. No other changes.
- **GOTCHA**: This is the only way `@Req() RawBodyRequest<Request>` gets `req.rawBody` populated.

### 17. UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: Add `import { PaymentsModule } from '@/modules/payments/payments.module';` and `PaymentsModule` in the `imports` array (after `OrdersModule`).

### 18. UPDATE `apps/api/src/modules/orders/orders.module.ts`

- **IMPLEMENT**: Add `exports: [OrdersService]` so `PaymentsModule` can inject `OrdersService`.

### 19. UPDATE `apps/api/src/modules/orders/orders.service.ts`

- **IMPLEMENT**:
  1. **Remove** the cart-empty/stock-check email enqueue path from `create()`: drop lines 110-116 (`if (user?.email) await this.emailQueue.enqueueOrderConfirmation(...)`). The on-create email is no longer correct — the order is unpaid.
  2. Add `findByIdInternal(orderId): Promise<OrderEntity>` — same as `findById` but no ownership check. Used only by `PaymentsService` (internal trust boundary).
  3. Add `markPaid(orderId: string): Promise<OrderEntity>`:
     - `order = await loadOrThrow(orderId)`.
     - If `order.status === 'CONFIRMED'` → log `order.service.mark_paid_noop`, return `order` (idempotent).
     - If `order.status !== 'PENDING'` → throw `BadRequestException('Order not payable from status ' + order.status)`. Important: this is caught upstream by `payment.webhook.failed` logging but webhook still 200s.
     - Reuse `VALID_TRANSITIONS` check: `PENDING → CONFIRMED` is allowed.
     - Call `await this.repository.confirmAndDecrementStock(orderId)` — atomic.
     - If `user-email-on-order` known (look up via auth/users repo OR pass through from payment metadata): `await this.emailQueue.enqueueOrderConfirmation({ to, orderId, total })`. **Decision**: do NOT add a new email job type — reuse `OrderConfirmationJob`. Rename the dot-namespace event later (out of scope). For guest orders without an email, skip.
     - Return the updated entity.
- **PATTERN**: Existing `transitionStatus` (orders.service.ts:152-193) for logging shape and `VALID_TRANSITIONS` use.
- **GOTCHA**: We need the customer email. `OrderEntity` doesn't currently include it. Two options:
  - (a) Add a user lookup in `markPaid` via a new `UsersRepository.findEmailById(id)` (CartModule already pulls users — check via Explore if a lightweight lookup exists; if not, inline a one-liner via `prisma.user.findUnique` inside `OrdersRepository`).
  - (b) Skip the email when the order has no `customerId` (guest); for registered users, do the lookup.
    Pick (b) — minimum surface. Add `OrdersRepository.findCustomerEmail(orderId): Promise<string | null>` that joins via the existing `customer` relation.

### 20. UPDATE `apps/api/src/modules/orders/orders.repository.ts`

- **IMPLEMENT**:
  1. **Remove** the in-loop `await this.products.decrementStock(...)` from `create()` (lines 59-61). Order creation no longer touches stock.
  2. Add `confirmAndDecrementStock(orderId: string): Promise<OrderEntity>`: opens `$transaction(async tx => ...)`:
     - `order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } })`. Throw if null.
     - For each `item`: `await this.products.decrementStock(item.productId, item.quantity, tx)` (the existing tx-aware helper). The stock guard added in Task 21 ensures atomicity.
     - `await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } })`.
     - Return `toEntity` of the refreshed order.
  3. Add `findCustomerEmail(orderId): Promise<string | null>` — `prisma.order.findUnique({ where: { id }, include: { customer: { select: { email: true } } } })` and return `customer?.email ?? null`.
- **GOTCHA**: `ProductsRepository.decrementStock` is currently in the products module and unguarded; Task 21 adds the guard. If the guard fails, the whole `$transaction` rolls back — `OrderEntity` stays PENDING.

### 21. UPDATE `apps/api/src/modules/products/products.repository.ts`

- **IMPLEMENT**: Replace the body of `decrementStock(productId, quantity, tx?)`:
  ```ts
  const client = tx ?? this.prisma;
  const result = await client.product.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (result.count === 0) {
    throw new OutOfStockError(productId);
  }
  ```
- Add `export class OutOfStockError extends Error { constructor(public readonly productId: string) { super(\`Insufficient stock for ${productId}\`); } }`exported from the same file (or a sibling`errors.ts`).
- **GOTCHA**: `updateMany` returns `{ count }`; `update` would throw on a missing row but cannot express the stock predicate.

### 22. CREATE `apps/api/test/factories/payment.factory.ts`

- **IMPLEMENT**: `createMockPayment(overrides)` returning a `PaymentEntity`. Default values: id `payment-N`, orderId `order-N`, provider `STRIPE`, providerPaymentId `pi_N`, status `REQUIRES_PAYMENT_METHOD`, amount 25, currency `usd`, clientSecret `cs_N`, failureReason null, dates `2026-01-01`.
- **PATTERN**: `apps/api/test/factories/order.factory.ts`.

### 23. CREATE `apps/api/src/modules/payments/payments.service.spec.ts`

- **IMPLEMENT** the cases listed in the brief:
  - `createIntent`: throws `NotFoundException` on missing order; `BadRequestException` on non-PENDING; `ConflictException` when a SUCCEEDED payment exists; persists Payment and returns clientSecret on happy path.
  - `handleWebhook`: bad signature surfaces as `BadRequestException`; duplicate eventId is a no-op (provider/orders not touched); `SUCCEEDED` calls `OrdersService.markPaid` and updates status; `FAILED` sets `failureReason`, does not transition order; stock-conflict during `markPaid` → payment marked FAILED with `STOCK_CONFLICT`, webhook still resolves cleanly.
- **PATTERN**: `orders.service.spec.ts` for mock wiring (manual `jest.Mocked<Pick<...>>` mocks, no `Test.createTestingModule`).

### 24. CREATE `apps/api/src/modules/payments/payments.controller.spec.ts`

- **IMPLEMENT**: Verifies routing wires up, guards reject non-admin where applicable, `@Req()` raw-body path is passed through to the service.
- **PATTERN**: `apps/api/src/modules/products/products.controller.spec.ts` (read before writing).

### 25. CREATE `apps/api/src/modules/payments/providers/stripe.provider.spec.ts`

- **IMPLEMENT**:
  - `createIntent` calls `stripe.paymentIntents.create` with amount in MINOR units (`1250` for `12.50`) and propagates `metadata.orderId`.
  - `verifyWebhook` returns mapped `PaymentStatus` for each of the 5 event types, returns `null` for irrelevant ones, throws when `stripe.webhooks.constructEvent` throws.
- **MOCK**: jest-mock the `Stripe` constructor and its `paymentIntents.create` / `webhooks.constructEvent` methods.

### 26. CREATE `apps/api/src/modules/payments/providers/stub.provider.spec.ts`

- **IMPLEMENT**: `createIntent` returns stub-shaped ids; `verifyWebhook` accepts `'stub'` signature and parses JSON, throws `BadRequestException` on any other signature.

### 27. UPDATE `apps/api/src/modules/orders/orders.service.spec.ts`

- **IMPLEMENT**:
  - **Update existing test**: "creates the order, clears the cart, and enqueues the email" — drop the `enqueueOrderConfirmation` assertion; keep `mockRepo.create` and `mockCart.clear` assertions.
  - Add new `describe('markPaid', ...)`:
    - PENDING → CONFIRMED happy path: calls `repository.confirmAndDecrementStock`, enqueues `enqueueOrderConfirmation` when customer email present, returns updated entity.
    - Already-CONFIRMED → returns existing order, logs noop, does NOT call repository, does NOT enqueue.
    - Non-PENDING/non-CONFIRMED (e.g. CANCELLED) → throws `BadRequestException`.
    - Out-of-stock (mock `confirmAndDecrementStock` to throw `OutOfStockError`) → throws the error so caller can catch it.
- **PATTERN**: lines 67-218 of the existing spec (factory wiring, mock module assembly).

### 28. UPDATE `apps/web/src/app/api/webhooks/stripe/route.ts`

- **IMPLEMENT**: Read raw bytes and forward.

  ```ts
  import { NextResponse } from 'next/server';
  export const runtime = 'nodejs';
  export const dynamic = 'force-dynamic';

  export async function POST(req: Request): Promise<NextResponse> {
    const sig = req.headers.get('stripe-signature');
    if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    const rawBody = Buffer.from(await req.arrayBuffer());
    const apiUrl = process.env.API_URL;
    if (!apiUrl) return NextResponse.json({ error: 'API_URL not configured' }, { status: 500 });
    const upstream = await fetch(`${apiUrl}/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      body: rawBody,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  }
  ```

- **GOTCHA — READ FIRST**: `apps/web/AGENTS.md` says "this is NOT the Next.js you know". Before writing, read `apps/web/node_modules/next/dist/docs/` for the Route Handler reference in this Next.js version — especially the raw-body API (`req.arrayBuffer()` vs `req.text()` vs `req.bytes()`). If `req.arrayBuffer()` is not the canonical primitive in the installed version, swap it out. **Do not use `req.json()`** — it consumes and re-encodes the body, breaking Stripe's signature.

### 29. VALIDATE end-to-end

- `docker compose up -d postgres redis`
- `pnpm --filter @repo/api prisma:migrate` (apply `add-payments`)
- `pnpm --filter @repo/api prisma:generate`
- `pnpm lint && pnpm typecheck && pnpm --filter @repo/api test`
- `pnpm --filter @repo/api dev`
- Manual flow (dev stub, no `STRIPE_SECRET_KEY`):
  1. Login (admin), add to cart, POST /orders → returns PENDING order.
  2. `POST /payments/intent { orderId }` → returns `pi_stub_*` + `cs_stub_*`.
  3. Simulate webhook:
     ```
     curl -X POST http://localhost:3001/payments/webhook \
       -H 'content-type: application/json' \
       -H 'stripe-signature: stub' \
       -d '{"eventId":"evt_stub_1","type":"payment_intent.succeeded","providerPaymentId":"<pi from step 2>","status":"SUCCEEDED"}'
     ```
  4. `GET /orders/:id` → status should be CONFIRMED, product stock decremented.
  5. Replay the same `curl` → second response is 200, duplicate-skipped log line appears, no double stock decrement.
- Swagger at `http://localhost:3001/docs` shows the `payments` tag with 3 endpoints (webhook excluded).

---

## TESTING STRATEGY

### Unit Tests (Backend)

- `payments.service.spec.ts`: orchestration logic, ownership checks, idempotency branches, stock-conflict handling.
- `payments.controller.spec.ts`: routing, guard composition, raw-body pass-through.
- `providers/stripe.provider.spec.ts`: amount-conversion (decimal → minor units), Stripe-event-type → internal status mapping, signature failure path.
- `providers/stub.provider.spec.ts`: deterministic stub IDs, JSON-payload parsing, sentinel signature.
- `orders.service.spec.ts` (updated): `create` no longer enqueues email; new `markPaid` happy path + noop + invalid-state + out-of-stock.
- Factories: `payment.factory.ts` (new).
- 80% coverage threshold from `jest` config (apps/api/package.json:108-114) applies.

### E2E Tests (Frontend)

- Out of scope for this module. The Next.js Route Handler change is exercised by the manual-validation curl flow in Task 29 (cross-process behaviour, not a happy-path browser test). Adding a Playwright test requires Stripe Elements in the cart UI, which is a later frontend task per the §12 module sequence.

### Edge Cases

- Stripe replays the same webhook (network blip) — must be a no-op (idempotency log).
- Webhook arrives BEFORE `payments.repository.create` commits (race: provider returned `pi_*`, our DB insert pending). Handler logs `payment.webhook.unknown_payment` and returns 200; Stripe retries in 5s by default; next attempt succeeds. Documented, not enforced.
- Provider returns success but stock has dropped to 0 since order was placed (other customer paid first). `confirmAndDecrementStock` `$transaction` rolls back → payment marked FAILED with `STOCK_CONFLICT` → webhook responds 200. Refund left as a manual op (out of scope).
- Customer tries to pay an already-CONFIRMED order: `createIntent` returns `Conflict 409` (`existsSucceededForOrder` guard).
- Guest order (no `customerId`): payment intent allowed if `x-cart-session` header present; no email sent on success.
- DELIVERED / CANCELLED orders: `createIntent` returns `400` (status check).

---

## VALIDATION COMMANDS

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm lint
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm typecheck
```

### Level 3: Unit Tests (backend)

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/api test:cov   # coverage report; must clear 80%
```

### Level 4: E2E Tests (frontend)

```bash
docker compose up -d
pnpm --filter web test:e2e
```

(Existing checkout E2E may need its assertions widened if it currently asserts on a CONFIRMED order right after `addToCartAction` — payment is now required. Verify against `apps/web/e2e/tests/checkout.spec.ts` before merging.)

### Level 5: Manual Validation

Follow the curl sequence in Task 29. Confirm:

- Swagger `/docs` shows `payments` tag with `POST /payments/intent`, `GET /payments/:id`, `GET /payments/order/:orderId`.
- Webhook is `@ApiExcludeEndpoint()` — not visible in Swagger.
- Stock decrements **only** on payment success (run twice with stub-FAILED status — stock unchanged).
- Logs show `payment.webhook.duplicate_skipped` on a replayed event.

---

## ACCEPTANCE CRITERIA

- [ ] `payments` module created with the 9-file structure (controller, service, repository, dto/, entities/, providers/, specs).
- [ ] `Payment` + `WebhookEvent` Prisma models + migration applied cleanly; `Payment` has `@@unique([provider, providerPaymentId])` and `WebhookEvent` has `@@unique([provider, eventId])`.
- [ ] `PaymentProviderAdapter` interface + `PAYMENT_PROVIDER` token; `StripeProvider` + `StubPaymentProvider` selected by `useFactory` based on `STRIPE_SECRET_KEY`.
- [ ] `OrdersService.markPaid` added; called by webhook handler on SUCCEEDED.
- [ ] Stock decrement removed from `OrdersService.create` path; happens in `markPaid` via `confirmAndDecrementStock` with `OutOfStockError` guard.
- [ ] On-create email removed; on-paid email enqueued from `markPaid` (using existing `OrderConfirmationJob` payload).
- [ ] `main.ts` updated with `rawBody: true`.
- [ ] Next.js Route Handler forwards raw bytes + `stripe-signature` to NestJS; preserves status code.
- [ ] All validation commands pass; coverage threshold met.
- [ ] Manual curl flow (Task 29) succeeds; duplicate webhook is idempotent.
- [ ] No regressions in existing `orders` / `products` specs.

---

## NOTES

**Design decisions made (resolving the open questions from the prompt)**:

- **Stock-decrement timing**: Move from order-create to payment-success. Avoids reserving inventory for un-paid PENDING orders that may never convert.
- **Email timing**: Move from order-create to payment-success. Reuse existing `OrderConfirmationJob` payload — no new job type, no template change. Cosmetically the email name is now slightly inaccurate ("confirmation" fires on payment, not creation), but the user-facing semantic is correct (their order is confirmed once paid). Renaming the BullMQ job is left as a small follow-up.
- **Guest-order ownership on `/payments/intent`**: We require a non-empty `x-cart-session` header but don't enforce a match (no `cartSessionId` column on `Order`). Acceptable for MVP; a hardening pass should persist the session id on the order and compare strictly.
- **Stripe API version**: pin `'2024-06-20'` (most recent stable as of this plan). Bumping later is a single-line change.
- **`PAYMENT_PROVIDER` token**: string literal `'PAYMENT_PROVIDER'` (matches `MAIL_SERVICE` convention in this codebase) rather than the Symbol shown in the brief. Behaviour is identical for DI; symbols are not used anywhere else in the project.
- **No refunds in this module**: The interface reserves space (`refund?`) but no implementation. Admin refund flow is a later module.

**Risks**:

- Touching `orders.service.ts` and `orders.repository.ts` to relocate stock + email is the largest blast radius. Existing E2E (`checkout.spec.ts`) may implicitly assume a stock decrement happens on order-create. Audit before merging.
- `req.arrayBuffer()` in the Next.js Route Handler is version-sensitive — `apps/web/AGENTS.md` explicitly warns against guessing. Read the in-tree docs.
- BullMQ workers don't share CLS context with the HTTP request. `requestId` propagation already works via `EmailQueue.withRequestId` — verify the same pattern is used when enqueuing from `markPaid` (it should, automatically, since `EmailQueue` does it internally).

**Confidence Score**: 8/10 for one-pass execution. The two unknowns are (a) Next.js raw-body API specifics, mitigated by the AGENTS.md "read docs first" instruction, and (b) the orders-spec rewrite — straightforward but easy to miss an assertion.
