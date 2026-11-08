---
description: /planning prompt for the chat domain module (Step 12.6 of setup guide — PRD §4.3 real-time chat).
---

# Chat Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `chat` module under apps/api/src/modules/chat/.

Follow the `products` module structure for the REST surface (controller / service /
repository / dto/ / entities/ / specs) and ADD a NestJS WebSocket gateway file
(`chat.gateway.ts`) for the realtime layer. Read every file in
apps/api/src/modules/products/ first. Then read apps/api/src/modules/auth/ —
especially `jwt.strategy.ts`, `JwtAuthGuard`, `OptionalJwtAuthGuard`, `RolesGuard`,
and the `@Roles()` / `@OptionalUser()` decorators — because the gateway must
authenticate Socket.io handshakes with the same JWT flow used on REST.
Then read apps/api/src/modules/cart/cart.service.ts (the guest+auth identity
pattern via `x-cart-session`) and apps/api/src/modules/discounts/
(most recent reference — copy its repository / service shape and logging style).

NO existing chat schema. You will add new Prisma models + ONE migration named
`add-chat-conversations`.

---

DOMAIN — what we are building:

Customer-to-store support chat. One persistent conversation per customer
(authenticated user) OR per guest session (`x-cart-session`). Admins/staff see
all open conversations in the backoffice and reply. Messages persist forever
(audit / re-open later). Realtime delivery via Socket.io; REST endpoints back
the conversation list and message history pagination so the admin UI can render
without first opening a socket.

EXPLICITLY OUT OF SCOPE for this module:

- Group chats / multi-customer rooms
- File / image attachments (defer; add an `attachmentUrl` column if you must,
  but no upload endpoint — that belongs to the future `uploads` module)
- Typing indicators / presence beyond simple "user joined room" events
- Push notifications (email-only out-of-band notification — see below)
- Third-party live-chat widgets (Crisp/Tidio — PRD §4.4 V2)

---

SCHEMA (new — generate ONE migration named `add-chat-conversations`):

    enum ConversationStatus {
      OPEN
      CLOSED
    }

    enum MessageSender {
      CUSTOMER   // either an authenticated user or a guest session
      ADMIN      // any user with role ADMIN or STAFF
      SYSTEM     // auto-generated (welcome / closed-by-timeout)
    }

    model Conversation {
      id            String              @id @default(cuid())
      customerId    String?             // FK to User. NULL for guest conversations.
      guestSession  String?             // x-cart-session value. NULL for auth conversations.
      status        ConversationStatus  @default(OPEN)
      subject       String?             @db.VarChar(200)
      lastMessageAt DateTime            @default(now())
      createdAt     DateTime            @default(now())
      updatedAt     DateTime            @updatedAt

      customer User?      @relation(fields: [customerId], references: [id], onDelete: SetNull)
      messages Message[]

      // Exactly one of (customerId, guestSession) must be set — enforced in service.
      @@index([customerId])
      @@index([guestSession])
      @@index([status, lastMessageAt])
    }

    model Message {
      id              String        @id @default(cuid())
      conversationId  String
      sender          MessageSender
      senderUserId    String?       // For sender=ADMIN: which staff replied. For sender=CUSTOMER+auth: the user id.
      body            String        @db.Text
      readByCustomer  Boolean       @default(false)
      readByAdmin     Boolean       @default(false)
      createdAt       DateTime      @default(now())

      conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
      senderUser   User?        @relation(fields: [senderUserId], references: [id], onDelete: SetNull)

      @@index([conversationId, createdAt])
    }

Add inverse relations on User: `conversations Conversation[]` and
`sentMessages Message[]` (named relation `MessagesSent`). Use a named relation
on Message.senderUser to disambiguate from the customer FK on Conversation.

Application-enforced invariants:

- `Conversation` has EXACTLY one of (customerId, guestSession). Service rejects
  both-set / both-null with BadRequestException.
- `senderUserId` is REQUIRED when sender=ADMIN (we always know which staff sent it).
- `senderUserId` is OPTIONAL when sender=CUSTOMER (guest conversations have no userId).
- `body.trim()` length ∈ [1, 4000]. Reject empty / whitespace-only.
- `lastMessageAt` is updated on every new message via the SAME $transaction that
  inserts the Message — so the conversation list sorts correctly.

---

Shared types (packages/types/src/chat.types.ts — NEW, add to barrel in src/index.ts):

- export type ConversationStatus = 'OPEN' | 'CLOSED';
- export type MessageSender = 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
- export interface Conversation { id, customerId: string | null, guestSession: string | null,
  status: ConversationStatus, subject: string | null, lastMessageAt: Date,
  createdAt: Date, updatedAt: Date }
- export interface Message { id, conversationId, sender: MessageSender,
  senderUserId: string | null, body, readByCustomer, readByAdmin, createdAt: Date }
- Pure Zod schemas + inferred types only — no class-validator, no @ApiProperty.

---

REST API ENDPOINTS (controller — `/chat`):

CUSTOMER / GUEST:

GET /chat/me — Get OR create the caller's open conversation.
Auth: OptionalJwtAuthGuard. Resolves identity via
`req.user` OR `x-cart-session` header (mirror
DiscountsController.validate identity resolution
EXACTLY — same 400 when neither). If no OPEN
conversation exists for that identity, create one
with a SYSTEM welcome message in a single $transaction.
Returns Conversation + last 50 messages.

GET /chat/me/messages?cursor=&limit= — Paginate the caller's conversation history
(cursor = message id, default limit=50, max=100,
DESC by createdAt). OptionalJwtAuthGuard.

POST /chat/me/messages — Send a message as the customer over REST (fallback
for clients that can't open a WebSocket).
Body: { body: string }. OptionalJwtAuthGuard.
Persists message + emits over Socket.io to the
admin room (see GATEWAY below). Returns Message.

POST /chat/me/read — Mark all messages with sender=ADMIN as
readByCustomer=true.

ADMIN / STAFF (JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN, UserRole.STAFF) —
mirror the products admin endpoints):

GET /chat — Paginated list of all conversations, default
sort: `status` ASC then `lastMessageAt` DESC
(open conversations float to the top, then by
most-recent activity). Query: ?status=OPEN|CLOSED,
?page, ?limit. Each row includes the latest message
body preview (first 120 chars) and the unread count
for admin (`messages WHERE sender=CUSTOMER AND
                                          readByAdmin=false`).

GET /chat/:id — Conversation + first page of messages.
GET /chat/:id/messages?cursor=&limit= — Paginate that conversation's messages.
POST /chat/:id/reply — Admin sends a reply. Body: { body: string }.
Persists with sender=ADMIN, senderUserId=req.user.id.
Emits to the customer room.
POST /chat/:id/read — Mark all messages with sender=CUSTOMER as
readByAdmin=true.
PATCH /chat/:id — Update status (close / reopen) or subject.
Body: UpdateConversationDto. On status change to
CLOSED, insert a SYSTEM message ("Conversation closed
by support") and broadcast.

All endpoints: @ApiTags('chat'), @ApiOperation, @ApiResponse, @ApiBearerAuth (on admin),
@ApiHeader for `x-cart-session` on the customer endpoints (mirror the discounts/validate
swagger style).

There is NO hard-delete endpoint. Conversations persist forever.

---

WEBSOCKET GATEWAY (chat.gateway.ts):

Use @nestjs/websockets with @WebSocketGateway({ namespace: '/chat', cors: { origin: ... } }).

Handshake auth (`handleConnection`):

1. Extract JWT from `socket.handshake.auth.token` OR
   `socket.handshake.headers.authorization` (Bearer …).
2. If JWT present → verify via JwtService (reuse the same secret + verify options as
   `JwtStrategy`). Attach `socket.data.user = { id, role }`. Determine role bucket:
   `admin` if role ∈ {ADMIN, STAFF}, else `customer`.
3. Else if `socket.handshake.auth.session` present (guest session) → attach
   `socket.data.guestSession = string`, role bucket `customer`.
4. Otherwise call `socket.disconnect(true)` with no further events.

Room model:

- `customer:<conversationId>` — joined ONLY by the conversation owner (auth user OR guest
  session match). Admin replies are emitted here.
- `admin` — joined by every connected ADMIN/STAFF socket. Customer messages and new
  conversations are broadcast here. (Admins can also join `customer:<conversationId>`
  when actively viewing a single thread to scope events.)

Subscribers (`@SubscribeMessage`):

- `'conversation:join'` { conversationId } — server verifies the socket has access
  (ownership for customer; role for admin) before `socket.join('customer:'+conversationId)`.
  Ack: { ok: true } or { ok: false, error }.
- `'message:send'` { conversationId, body } — server delegates to ChatService.sendMessage
  using the resolved identity (auth user / guest session / admin user). The service
  persists the row, then the gateway emits `'message:new'` to BOTH `admin` room and
  `customer:<conversationId>` room. Ack: { ok: true, messageId } or { ok: false, error }.
- `'message:read'` { conversationId } — equivalent of the REST /read endpoint.

Server → client events:

- `'message:new'` (full Message DTO) — emitted on every persisted message (REST or socket).
- `'conversation:updated'` (Conversation DTO) — emitted on status/subject change.
- `'conversation:new'` (Conversation DTO) — emitted to `admin` room ONLY, when a customer
  creates their first conversation (so the support inbox refreshes live).

Gateway delegates ALL business logic to ChatService — gateway just does handshake auth,
room management, and message envelope shaping. Same layer rule as REST controllers:
no Prisma in the gateway, no validation logic in the gateway.

---

SERVICE RULES:

ChatService methods:

- `getOrCreateMyConversation(identity)` — returns existing OPEN conversation or creates one
  with a SYSTEM welcome message in a $transaction. Identity = same union type the cart
  module uses; reuse `CartIdentity` if it's already exported, otherwise mirror its shape.
- `findMyConversation(identity)` — returns the caller's OPEN conversation or NotFound.
- `listForAdmin({ status, page, limit })` — paginated admin list with preview + unread count.
- `findById(id)` — single fetch (NotFound).
- `getMessages(conversationId, { cursor, limit }, identity?)` — cursor pagination.
  If `identity` provided (customer call), assert ownership; ADMIN/STAFF skip the check.
- `sendMessage({ conversationId, sender, senderUserId, body }, tx?)` — persists message,
  updates `conversation.lastMessageAt`, returns the row. Inside a $transaction so the
  two writes stay consistent. Rejects empty body. Rejects messages to CLOSED conversations
  with BadRequest.
- `markRead(conversationId, who: 'customer' | 'admin')` — bulk UPDATE.
- `updateStatus(id, status)` — flips status, inserts SYSTEM message on close, broadcasts.
- `assertOwnership(conversation, identity)` — throws ForbiddenException if the identity
  doesn't match. Mirror the orders module's ownership pattern.

- NEVER imports PrismaService directly — all queries go through ChatRepository.
- Inject CLS for `requestId`. Inject `@WebSocketServer()` indirectly: the gateway is the
  only place that calls `server.emit`; the service does NOT touch sockets. The service
  RETURNS the persisted message + a list of "rooms to notify"; the gateway translates that
  into emit calls. Alternative if cleaner: inject the gateway into the service via
  forwardRef and call `gateway.broadcastMessage(message)`. PICK ONE in the plan and justify.

Logging dot-namespaces:

- chat.service.conversation_created
- chat.service.message_sent_succeeded / \_failed
- chat.service.mark_read_succeeded
- chat.gateway.connection_authenticated / \_rejected
- chat.gateway.join_denied / \_allowed

ChatRepository methods:

- createConversation(data, tx?)
- findOpenConversationByIdentity({ customerId | guestSession }, tx?)
- findConversationById(id)
- listConversationsForAdmin(filters, pagination) — pulls the preview + unread count in
  the same query via Prisma `_count` and `messages: { take: 1, orderBy: { createdAt: 'desc' } }`.
- updateConversation(id, patch, tx?) — used for status / subject / lastMessageAt.
- createMessage(data, tx?)
- listMessages(conversationId, { cursor, limit })
- countUnread(conversationId, who: 'customer' | 'admin')
- markAllRead(conversationId, who)

---

DTOs:

CreateMessageDto:
@ApiProperty({ example: 'Hi, do you ship to Argentina?', maxLength: 4000 })
@IsString() @MinLength(1) @MaxLength(4000) body: string;

UpdateConversationDto (admin only):
@ApiPropertyOptional() @IsOptional() @IsIn(['OPEN','CLOSED']) status?: ConversationStatus;
@ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subject?: string;

FindConversationsQueryDto (admin list):
@ApiPropertyOptional() @IsOptional() @IsIn(['OPEN','CLOSED']) status?: ConversationStatus;

- page/limit (mirror discounts FindDiscountsQueryDto).

GetMessagesQueryDto:
@ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
@ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;

ConversationResponseDto / MessageResponseDto:
Full shapes with @ApiProperty on every field; static `from(entity)` mappers.
ConversationListItemResponseDto:
Extends ConversationResponseDto with `preview: string | null` and `unreadForAdmin: number`.

---

CONFIG:

No new env vars REQUIRED. Optional:

- CHAT_MESSAGE_MAX_LENGTH (default 4000) — only if you want runtime override; otherwise
  hardcode the @MaxLength.

CORS / Socket.io:

- Reuse the existing main.ts CORS origin list for the gateway. If main.ts doesn't already
  configure CORS for Socket.io, ADD it (separate from the express CORS) — gateway needs
  its own cors block.
- ENSURE `@nestjs/platform-socket.io` and `socket.io` are already in package.json (check
  apps/api/package.json before adding — CLAUDE.md rule §10.9).

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/chat.factory.ts:

- createMockConversation(overrides) — defaults: OPEN, customerId set, no guestSession.
- createMockMessage(overrides) — defaults: sender=CUSTOMER, readByAdmin=false.

chat.service.spec.ts (every branch — model after discounts.service.spec.ts):

- getOrCreateMyConversation: returns existing OPEN conversation when present
- getOrCreateMyConversation: creates new conversation + SYSTEM welcome in $transaction when none
- getOrCreateMyConversation: rejects identity with both customerId and guestSession
- getOrCreateMyConversation: rejects identity with neither
- sendMessage: persists row, updates lastMessageAt (asserts both writes inside same tx)
- sendMessage: throws BadRequest on empty / whitespace body
- sendMessage: throws BadRequest when conversation is CLOSED
- sendMessage: throws Forbidden when identity doesn't own the conversation
- getMessages: paginates with cursor (DESC by createdAt)
- markRead('customer'): updates ONLY messages with sender=ADMIN
- markRead('admin'): updates ONLY messages with sender=CUSTOMER
- updateStatus(CLOSED): flips status + inserts SYSTEM message
- listForAdmin: returns preview + unread count per row

chat.controller.spec.ts:

- GET /chat/me (auth): 200 — creates conversation on first call
- GET /chat/me (guest, x-cart-session): 200
- GET /chat/me (neither): 400
- POST /chat/me/messages: 201, message persisted, gateway broadcast invoked
- GET /chat (non-admin): 403
- POST /chat/:id/reply (admin): 201 with senderUserId=req.user.id
- PATCH /chat/:id (admin, status=CLOSED): triggers SYSTEM message via service

chat.gateway.spec.ts (lighter — focus on auth, leave business logic to service tests):

- handleConnection: rejects sockets with no token + no session
- handleConnection: attaches user payload from valid JWT
- handleConnection: attaches guestSession from auth.session
- 'conversation:join' customer: rejects when conversationId doesn't belong to caller
- 'conversation:join' admin: allowed for any conversationId
- 'message:send' customer: calls service.sendMessage with resolved identity, emits to both rooms

Register ChatModule in apps/api/src/app.module.ts (alphabetical: between Cart and Categories).

---

VALIDATE after implementation:

docker compose up -d postgres redis
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate -- --name add-chat-conversations
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api dev

# End-to-end smoke — REST surface first

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

# Customer (auth) creates their conversation

curl -s -X GET http://localhost:3001/chat/me \
 -H "Authorization: Bearer $TOKEN"

# Customer sends a message via REST

curl -s -X POST http://localhost:3001/chat/me/messages \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"body":"Hi, do you ship to Argentina?"}'

# Admin lists open conversations

curl -s -X GET 'http://localhost:3001/chat?status=OPEN' \
 -H "Authorization: Bearer $TOKEN"

# Admin replies

curl -s -X POST http://localhost:3001/chat/<id>/reply \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"body":"Yes, flat-rate $20."}'

# Admin closes

curl -s -X PATCH http://localhost:3001/chat/<id> \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $TOKEN" \
 -d '{"status":"CLOSED"}'

# WebSocket smoke (node REPL or wscat):

# wscat -c 'ws://localhost:3001/chat' -H "authorization: Bearer $TOKEN"

# Expect: connection stays open. Emit conversation:join, then message:send. Both rooms receive message:new.

open http://localhost:3001/docs # Chat section visible with the documented endpoints
