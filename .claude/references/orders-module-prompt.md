---
description: /planning prompt for the orders domain module (Step 12 of setup guide).
---

# Orders Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `orders` module under apps/api/src/modules/orders/.

Follow the `products` module EXACTLY — same 9-file structure, same layer separation,
same test approach. Read every file in apps/api/src/modules/products/ before writing
anything. Also read apps/api/src/modules/cart/ — orders depends on it directly.

---

DOMAIN RULES:

Schema (already in prisma/schema.prisma — do NOT modify it):

- Order: id (cuid), customerId (nullable → guest checkout), status (OrderStatus enum),
  total (Decimal 10,2), createdAt, updatedAt. Relations: customer (User?), items (OrderItem[])
- OrderItem: id, orderId, productId, quantity, priceAtPurchase (Decimal 10,2).
  Relations: order, product
- OrderStatus enum: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED

Shared types (packages/types/src/order.types.ts — already exists, read it first):

- Use existing Order, OrderItem, OrderStatus. Do not add decorators to @repo/types.

---

API ENDPOINTS (controller):

POST /orders — create order from current cart (auth optional — guests allowed)
GET /orders — paginated list; authenticated customers see own orders only;
ADMIN sees all orders; unauthenticated → 401
GET /orders/:id — order detail; customer can only fetch own; ADMIN can fetch any
PATCH /orders/:id/status — transition status (ADMIN only)
POST /orders/:id/cancel — cancel order; customer: own PENDING orders only;
ADMIN: PENDING or CONFIRMED

All endpoints: @ApiTags('orders'), @ApiOperation, @ApiResponse, bearer auth on Swagger.

---

ORDER CREATION FLOW (service.create):

Input: CreateOrderDto + optional JWT user + optional x-cart-session header
Steps (all-or-nothing — use a Prisma $transaction for steps 4–6): 1. Resolve cart: if JWT present use CartService.getCart('user', userId),
else use CartService.getCart('guest', sessionId from header).
Throw BadRequestException if cart is empty. 2. For each cart item: fetch the product via ProductsRepository.
Throw BadRequestException if any product is inactive.
Throw BadRequestException if stock < requested quantity. 3. Calculate total = sum of (item.price × item.quantity) — use cart price snapshot,
NOT the current product price (price may have changed since add-to-cart). 4. Create Order record (customerId = userId or null for guest). 5. Create all OrderItem records (priceAtPurchase = cart item price snapshot). 6. Decrement stock on each Product by the ordered quantity. 7. After transaction succeeds: clear the cart (CartService.clearCart). 8. Enqueue order-confirmation email job (see BullMQ section below). 9. Return the created order with items.

---

STATUS TRANSITION RULES (service.transitionStatus):

Valid transitions only — throw BadRequestException on invalid:
PENDING → CONFIRMED (ADMIN only)
CONFIRMED → SHIPPED (ADMIN only)
SHIPPED → DELIVERED (ADMIN only)
PENDING → CANCELLED (customer owning the order OR admin)
CONFIRMED → CANCELLED (ADMIN only)
DELIVERED → (no transition — final state)
CANCELLED → (no transition — final state)

Encode this as a map: const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]>

---

SERVICE RULES:

- findAll(userId, role, query): if role=ADMIN return all; else filter by customerId=userId
- findById(id, userId, role): throws NotFoundException if not found;
  throws ForbiddenException if customer requests another user's order
- Logging: follow dot-namespaced convention (order.service.create_started, etc.)
- NEVER imports PrismaService directly — goes through OrdersRepository
- Inject CartService (add CartModule to imports in OrdersModule)
- Inject ProductsRepository (add ProductsModule to imports, or expose ProductsRepository
  from ProductsModule — check how ProductsModule currently exports its providers)

REPOSITORY:

- create(data: { customerId, status, total, items[] }): uses prisma.$transaction internally
  to create Order + all OrderItems atomically
- findAll(filters: { customerId?, status?, page, limit }): paginated
- findById(id): includes items
- updateStatus(id, status): simple update
- Stock decrement goes in ProductsRepository, not here —
  add decrementStock(productId, quantity) to ProductsRepository if it doesn't exist

---

BULLMQ — MINIMUM SETUP (Step 11 of setup guide, required for orders):

Since orders needs to enqueue email jobs, wire BullMQ here:

1. pnpm --filter api add @nestjs/bullmq bullmq (if not already installed — check package.json first)

2. apps/api/src/queues/queues.module.ts:
   - BullModule.forRootAsync using REDIS_URL from ConfigService
   - BullModule.registerQueue({ name: 'emails' })
   - Export so other modules can inject the queue

3. apps/api/src/queues/processors/email.processor.ts:
   - @Processor('emails') class EmailProcessor
   - @Process('order-confirmation') handle({ data }): logs the job payload
     (stub — real Resend integration comes later)
   - @Process('welcome') and @Process('password-reset') stubs
   - Logs: queue.email_processor.order_confirmation_started / \_succeeded / \_failed

4. Register QueuesModule in app.module.ts.

5. In OrdersService: inject @InjectQueue('emails') private readonly emailQueue: Queue
   After successful order creation: await this.emailQueue.add('order-confirmation',
   { orderId: order.id, customerEmail, items: order.items })

---

DTOs:

- CreateOrderDto: shippingAddress (optional IsString) + @ApiProperty
  (cart is resolved server-side — no item list in the request)
- UpdateOrderStatusDto: status (IsEnum(OrderStatus)) + @ApiProperty
- OrderResponseDto: full order shape with items array
- OrderItemResponseDto: productId, name (denormalized from product), quantity, priceAtPurchase

QUERY DTO:

- FindOrdersQueryDto: page, limit (extend PaginationParamsSchema from @repo/types),
  status (optional IsEnum(OrderStatus))

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/order.factory.ts with:
createMockOrder(overrides), createMockOrderItem(overrides)

Service spec covers:
create throws BadRequestException on empty cart
create throws BadRequestException on inactive product
create throws BadRequestException on insufficient stock
create calls prisma transaction, clears cart, enqueues email job
transitionStatus throws BadRequestException on invalid transition (e.g. DELIVERED → CONFIRMED)
transitionStatus throws ForbiddenException when customer tries to confirm their own order
findById throws NotFoundException for missing order
findById throws ForbiddenException when customer fetches another user's order

Controller spec covers:
GET /orders returns paginated results
POST /orders/:id/cancel rejects CONFIRMED order cancel by customer
PATCH /orders/:id/status rejects non-admin

Register OrdersModule in apps/api/src/app.module.ts.

---

VALIDATE after implementation:
docker compose up -d postgres redis
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api dev

# Full checkout flow:

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

# Add to cart then create order:

curl -s -X POST http://localhost:3001/cart/items \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"productId":"<id-from-seed>","quantity":1}'

curl -s -X POST http://localhost:3001/orders \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{}'

curl -s http://localhost:3001/orders -H "Authorization: Bearer $TOKEN"

open http://localhost:3001/docs # Orders section visible with all 5 endpoints
