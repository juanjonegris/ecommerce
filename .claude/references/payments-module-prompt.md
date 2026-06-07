---
description: /planning prompt for the payments domain module (Step 12 of setup guide).
---

# Payments Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `payments` module under apps/api/src/modules/payments/.

Follow the `products` module EXACTLY — same 9-file structure, same layer separation,
same test approach. Read every file in apps/api/src/modules/products/ before writing
anything. Then read apps/api/src/modules/orders/ — payments hooks directly into the
order lifecycle (PENDING → CONFIRMED on payment success). Also read
apps/api/src/mail/mail.service.ts to mirror the swappable-provider pattern, and
apps/api/src/queues/emails/email-queue.service.ts to mirror how a swappable
dependency is injected by token with a dev-stub fallback.

Frontend webhook receiver lives in Next.js 15 App Router (apps/web/src/app/api/webhooks/stripe/route.ts). Per apps/web/AGENTS.md, read the relevant Next.js docs under node_modules/next/dist/docs/ before editing it — App Router Route Handler APIs may differ from training data, especially for raw-body access (required for Stripe signature verification).

---

DOMAIN RULES:

Schema changes (REQUIRES a new Prisma migration — create it, run `prisma:migrate -- --name add-payments`):

Add to prisma/schema.prisma:
enum PaymentStatus {
REQUIRES_PAYMENT_METHOD
PROCESSING
SUCCEEDED
FAILED
CANCELLED
REFUNDED
}

    enum PaymentProvider {
      STRIPE
      MERCADO_PAGO   // reserved — not implemented in this module
    }

    model Payment {
      id                String          @id @default(cuid())
      orderId           String
      provider          PaymentProvider
      providerPaymentId String          // Stripe PaymentIntent id (pi_...)
      status            PaymentStatus   @default(REQUIRES_PAYMENT_METHOD)
      amount            Decimal         @db.Decimal(10, 2)
      currency          String          @db.Char(3)    // ISO 4217 (e.g., "USD")
      clientSecret      String?         // returned to FE for confirmation; nullable for non-Stripe providers
      failureReason     String?
      createdAt         DateTime        @default(now())
      updatedAt         DateTime        @updatedAt

      order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)

      @@unique([provider, providerPaymentId])   // idempotency key for webhooks
      @@index([orderId])
      @@index([status])
    }

    model WebhookEvent {
      // Idempotency log so retried Stripe webhook deliveries are no-ops.
      id        String          @id @default(cuid())
      provider  PaymentProvider
      eventId   String          // Stripe event.id (evt_...)
      type      String          // e.g., "payment_intent.succeeded"
      receivedAt DateTime       @default(now())

      @@unique([provider, eventId])
      @@index([type])
    }

Add `payments Payment[]` relation to the existing Order model.

Shared types (packages/types/src/payment.types.ts — NEW, add to barrel in src/index.ts):

- export enum PaymentStatus { ... } mirroring Prisma
- export enum PaymentProvider { ... } mirroring Prisma
- export interface Payment { id, orderId, provider, providerPaymentId, status,
  amount, currency, clientSecret: string | null, failureReason: string | null,
  createdAt, updatedAt }
- Pure types only — no class-validator, no @ApiProperty (those live in apps/api DTOs).

---

PROVIDER ABSTRACTION (the entire point — keeps Stripe swappable for MercadoPago later):

apps/api/src/modules/payments/providers/payment-provider.interface.ts:

    export interface CreateIntentInput {
      orderId: string;
      amount: number;          // decimal in major units (e.g., 12.50)
      currency: string;        // ISO 4217 lowercase ("usd")
      customerEmail?: string;
      metadata?: Record<string, string>;
    }

    export interface CreateIntentResult {
      providerPaymentId: string;   // pi_... for Stripe
      clientSecret: string;        // returned to FE
    }

    export interface VerifiedWebhook {
      eventId: string;             // evt_...
      type: string;                // e.g., "payment_intent.succeeded"
      providerPaymentId: string;   // pi_...
      status: PaymentStatus;       // mapped from provider status
      amountReceived?: number;
      failureReason?: string;
    }

    export interface PaymentProviderAdapter {
      readonly name: PaymentProvider;
      createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
      verifyWebhook(rawBody: Buffer, signatureHeader: string): Promise<VerifiedWebhook>;
      // refund(providerPaymentId, amount?): Promise<...>   // stub for now, document but DO NOT implement
    }

Injection token: `export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');`
Bind a single active provider in payments.module.ts via { provide: PAYMENT_PROVIDER, useClass: StripeProvider }.
Services and the webhook handler depend on PaymentProviderAdapter only — never on Stripe directly.

apps/api/src/modules/payments/providers/stripe.provider.ts: - Implements PaymentProviderAdapter - Constructor injects ConfigService; reads STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET - Uses official `stripe` SDK (pnpm --filter api add stripe) - createIntent: stripe.paymentIntents.create({ amount: Math.round(amount\*100), currency,
metadata: { orderId, ...metadata }, automatic_payment_methods: { enabled: true } }) - verifyWebhook: stripe.webhooks.constructEvent(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)
then maps Stripe event types to internal PaymentStatus - Status mapping (Stripe → internal):
payment_intent.succeeded → SUCCEEDED
payment_intent.processing → PROCESSING
payment_intent.payment_failed → FAILED
payment_intent.canceled → CANCELLED
charge.refunded → REFUNDED
Other event types: return type=null/ignore (logged but no-op).

DEV STUB (mirror MailService): if STRIPE*SECRET_KEY is empty, bind a StubPaymentProvider that: - createIntent: returns { providerPaymentId: `pi_stub*${cuid}`, clientSecret: `cs_stub_${cuid}`}
      and logs the request
    - verifyWebhook: throws or accepts an unsigned dev payload behind an explicit dev-only flag
    This keeps`pnpm dev` runnable without Stripe credentials.

---

API ENDPOINTS (controller):

POST /payments/intent
— Body: { orderId: string }
— Auth: JWT optional (guest checkout supported via orders flow)
— Verifies: order exists, caller owns it (customer) OR is admin OR order is a guest order
and request includes the same x-cart-session that owned the cart (planning: pick the
safest ownership rule for guest orders; document the choice).
— Verifies: order.status === PENDING and no SUCCEEDED Payment already exists for the order
— Calls provider.createIntent, persists Payment row (status REQUIRES_PAYMENT_METHOD),
returns { paymentId, clientSecret, providerPaymentId }
— Throws ConflictException if order already paid; BadRequestException if order not PENDING.

POST /payments/webhook
— PUBLIC route, NO JwtAuthGuard, NO @UseGuards
— Reads raw request body (NOT the parsed JSON) for signature verification.
NestJS rawBody support: in main.ts pass { rawBody: true } to NestFactory.create
and apply `bodyParser: false` only for this route OR use a small per-route
raw-body middleware. Planning: pick the approach with the smallest blast radius
on the rest of the API (the rest must still receive parsed JSON).
— Reads `stripe-signature` header
— Calls provider.verifyWebhook → throws BadRequestException(400) on signature failure
— Idempotency: insert into WebhookEvent (provider, eventId). On unique-constraint
violation, return 200 immediately (already processed). Log as `payment.webhook.duplicate_skipped`.
— Updates Payment.status, then if SUCCEEDED:
_ Transitions Order PENDING → CONFIRMED (call OrdersService — see ORDER INTEGRATION below)
_ Enqueues an `order-paid` email job (see EMAIL section)
— If FAILED: stores failureReason on Payment; Order stays PENDING (customer can retry).
— Returns 200 with { received: true } on success.

GET /payments/:id
— Auth required. Customer can fetch only payments on their own orders; ADMIN any.
— Throws NotFound/Forbidden accordingly.

GET /orders/:orderId/payments
— Same ownership rules.
— Returns Payment[] for the order (an order can have multiple attempts).

All non-webhook endpoints: @ApiTags('payments'), @ApiOperation, @ApiResponse, bearer auth on Swagger.
The webhook endpoint: @ApiExcludeEndpoint() — it's not a public API surface.

---

ORDER INTEGRATION (touch OrdersService — do NOT bypass it):

Add a single method on OrdersService that the payments webhook calls:
markPaid(orderId: string, actor: { role: 'SYSTEM' }): Promise<OrderEntity>
— Internal-only actor (NOT a real user). Bypasses customer ownership checks.
— Uses the existing VALID_TRANSITIONS map; transitions PENDING → CONFIRMED only.
— Throws if order is not PENDING (idempotency safety: if already CONFIRMED, return current order, log `order.service.mark_paid_noop`).
— STOCK DECREMENT: decrement Product.stock for each order item INSIDE the same Prisma
$transaction that updates the Order status. Use ProductsRepository.decrementStock
(add it if missing — see REPOSITORY section). If any product is out of stock at
confirmation time (rare race), the transaction must roll back and the webhook should
respond 200 (idempotency) while logging a `payment.webhook.stock_conflict` error and
marking the Payment row with failureReason='STOCK_CONFLICT' (status FAILED).

Planning decision required: the existing OrdersService.create currently enqueues an
"order-confirmation" email ON CREATE (before payment). Decide:
(a) Move that email to fire on markPaid (rename to "order-paid"); or
(b) Keep the on-create email AND add a separate "payment-succeeded" email on markPaid.
Recommend (a) — the on-create email is misleading for unpaid PENDING orders. Document
the chosen approach and update the existing OrdersService accordingly.

---

WEBHOOK FORWARDING (apps/web — Next.js Route Handler):

Update apps/web/src/app/api/webhooks/stripe/route.ts to forward the request to NestJS:

    1. READ FIRST: node_modules/next/dist/docs/ for the App Router Route Handler reference
       in this exact Next.js version. The `request.text()` / raw body API for POST handlers
       may differ from earlier Next.js versions.
    2. Read the raw body as a string/Buffer (NOT request.json() — that loses the bytes
       Stripe signed).
    3. Forward POST to `${process.env.API_URL}/payments/webhook` with:
         - Header `stripe-signature: <forwarded as-is>`
         - Header `content-type: application/json`
         - Body: the raw bytes
    4. Return the upstream status code and body to Stripe.
    5. No signature verification in Next.js — that happens once on the NestJS side so the
       webhook secret only lives in one process.

Document: the Stripe dashboard webhook URL points at the Next.js host, not the API host.

---

SERVICE RULES:

- PaymentsService methods:
  createIntent(orderId, actor): orchestrates ownership check + provider.createIntent + persist Payment
  handleWebhook(rawBody, signatureHeader): verify → idempotency log → update Payment → markPaid order
  findById(id, actor): ownership-checked fetch
  findByOrder(orderId, actor): ownership-checked list
- NEVER imports PrismaService directly — goes through PaymentsRepository.
- Inject OrdersService (add OrdersModule to imports; OrdersModule must export OrdersService).
  Verify OrdersModule's exports array; add `exports: [OrdersService]` if missing.
- Inject PAYMENT_PROVIDER token → PaymentProviderAdapter.
- Inject EmailQueue (or rename to a more provider-neutral name if planning chooses option (a) above).
- Logging dot-namespaces:
  payment.service.create_intent_started / \_succeeded / \_failed
  payment.webhook.received / \_verified / \_duplicate_skipped / \_processed / \_failed
  payment.provider.stripe.create_intent_started / \_succeeded / \_failed

REPOSITORY (PaymentsRepository):

- create(data): persist Payment row
- findById(id)
- findByProviderPaymentId(provider, providerPaymentId): used by webhook handler
- findByOrder(orderId)
- updateStatus(id, status, failureReason?)
- recordWebhookEvent(provider, eventId, type): insert WebhookEvent;
  returns boolean (true=new, false=duplicate via catch on unique violation)
- ProductsRepository.decrementStock(productId, quantity) — ADD if missing. Must use
  `update where: { id, stock: { gte: quantity } }` and detect zero-rows-affected to
  raise a typed `OutOfStockError` (so the OrdersService transaction surfaces it cleanly).

---

DTOs:

- CreateIntentDto: orderId (IsString) + @ApiProperty
- PaymentResponseDto: full Payment shape, includes clientSecret ONLY on the createIntent
  response (omit from list/get endpoints — it's sensitive once consumed)
- Webhook payload: NO DTO (we read the raw Buffer; class-validator should NOT touch this route)

---

CONFIG:

Extend apps/api/src/config/configuration.ts Zod schema:
STRIPE_SECRET_KEY: z.string().optional() // empty → StubPaymentProvider
STRIPE_WEBHOOK_SECRET: z.string().optional() // empty → webhook returns 503 in non-dev
STRIPE_CURRENCY: z.string().length(3).default('usd')

Update .env.example with the three new vars (placeholders only).
Do NOT commit real keys.

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/payment.factory.ts:
createMockPayment(overrides), createMockStripePaymentIntent(overrides)

payments.service.spec.ts:
createIntent: throws NotFound when order missing
createIntent: throws Forbidden when customer requests another user's order
createIntent: throws BadRequest when order not PENDING
createIntent: throws Conflict when a SUCCEEDED payment already exists
createIntent: persists Payment and returns clientSecret on success
handleWebhook: rejects bad signature (BadRequestException)
handleWebhook: idempotent — second delivery of same eventId is a no-op (returns 200, does not double-mark order)
handleWebhook: SUCCEEDED → calls OrdersService.markPaid AND enqueues paid email
handleWebhook: FAILED → sets failureReason, does NOT transition order
handleWebhook: stock-conflict during markPaid → Payment marked FAILED with reason='STOCK_CONFLICT', responds 200

stripe.provider.spec.ts:
createIntent: passes amount in minor units (1250 for 12.50)
verifyWebhook: throws on tampered signature (mock stripe.webhooks.constructEvent)
verifyWebhook: maps each Stripe event type to the correct PaymentStatus

stub.provider.spec.ts (if implemented):
createIntent: returns deterministic stub ids when STRIPE_SECRET_KEY is empty

payments.controller.spec.ts:
POST /payments/intent: auth required for non-guest orders, returns 201 with payload
POST /payments/webhook: 400 on missing signature; 200 on valid; raw-body parsing wired
GET /payments/:id and GET /orders/:id/payments: ownership rules enforced

orders.service.spec.ts (update existing):
markPaid: PENDING → CONFIRMED happy path + stock decrement (via mocked products repo)
markPaid: already-CONFIRMED → returns existing order, logs noop
markPaid: out-of-stock → throws OutOfStockError, transaction rolls back

Register PaymentsModule in apps/api/src/app.module.ts.

---

VALIDATE after implementation:
docker compose up -d postgres redis
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate -- --name add-payments
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api dev

# End-to-end smoke with STUB provider (STRIPE_SECRET_KEY empty in .env):

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

curl -s -X POST http://localhost:3001/cart/items \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"productId":"<id-from-seed>","quantity":1}'

ORDER_ID=$(curl -s -X POST http://localhost:3001/orders \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{}' | jq -r '.id')

# 1. Create intent

curl -s -X POST http://localhost:3001/payments/intent \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
    -d "{\"orderId\":\"$ORDER_ID\"}"

# 2. Simulate webhook (stub mode: dev-only unsigned payload accepted)

# Document the exact curl in the planning output.

# 3. Verify order transitioned

curl -s http://localhost:3001/orders/$ORDER_ID -H "Authorization: Bearer $TOKEN"

# → status should be CONFIRMED

# → stock on the ordered product should be decremented by 1

# Real Stripe smoke (optional, planning only — do NOT script keys):

# Use `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`

# and `stripe trigger payment_intent.succeeded`.

open http://localhost:3001/docs # Payments section visible with 3 endpoints (webhook excluded)
