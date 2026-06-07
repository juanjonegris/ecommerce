# Feature: chat-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Real-time customer-support chat (PRD §4.3, mvp-tool-designs.md §Real-time chat).
One persistent `Conversation` per customer (auth user OR guest session). NestJS
WebSocket gateway over Socket.io (`@nestjs/websockets` + `@nestjs/platform-socket.io`

- `socket.io` — already in `apps/api/package.json`) for push delivery. REST surface
  mirrors the canonical `products` 9-file structure for the conversation/message
  list + a fallback "send" endpoint.

## User Story

As a store customer (logged-in or guest) I want to message support and receive
replies in real time so my pre-purchase questions get answered. As an admin/staff
I want a live inbox with unread counts so I can respond fast and close threads.

## Problem Statement

The platform has no customer↔support channel today. The PRD scopes a real-time
chat using Socket.io via NestJS.

## Solution Statement

Add a `chat` NestJS module with: (1) REST endpoints `/chat/*` mirroring
`discounts.controller.ts`; (2) a `ChatGateway` on namespace `/chat`; (3) two
Postgres models (`Conversation`, `Message`) in one new migration; (4) identity
reuse via the existing `CartIdentity` from `cart.service.ts`. Gateway is a thin
transport: all business logic lives in `ChatService`, which returns a
`BroadcastEnvelope` describing `{ rooms, event, payload }` that the gateway or
controller hands to `server.to(room).emit(...)`.

---

## CONTEXT REFERENCES

### Read BEFORE implementing

- `apps/api/src/modules/products/` — canonical 9-file module shape.
- `apps/api/src/modules/discounts/` — most recent precedent. Mirror exactly:
  - `discounts.service.ts` — logging style, ClsService, `$transaction`, tx params.
  - `discounts.repository.ts` — `tx?: Prisma.TransactionClient` pattern (line 99-120),
    paginated `$transaction([findMany, count])` (line 41-58), `toEntity` mapper.
  - `discounts.controller.ts` — identity resolution lines 65-82 (OptionalJwtAuthGuard
    - `@OptionalUser` + `@Headers('x-cart-session')`; 400 when neither).
  - `discounts.controller.spec.ts:42-73` — exact identity test shape to copy.
  - `discounts.service.spec.ts` — mock pattern: `jest.Mocked<Pick<X, '…'>>`,
    `mockCls.getId.mockReturnValue('req-id')`.
- `apps/api/src/modules/cart/cart.service.ts:19-22` — `export interface CartIdentity
{ type: 'guest' | 'user'; id: string }`. **Reuse, don't redefine.**
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts` — verify path the gateway
  handshake replicates (same JWT_SECRET via ConfigService, same `JwtPayload`).
- `apps/api/src/modules/auth/jwt-payload.ts` — `JwtPayload { sub, email, role }`.
- `apps/api/src/modules/auth/auth.service.ts` — `validateUser(payload)`. Call from
  gateway handshake to centralize token-to-user logic.
- `apps/api/src/common/guards/optional-jwt-auth.guard.ts` — REST guest+auth pattern.
- `apps/api/src/common/guards/roles.guard.ts` + `decorators/roles.decorator.ts` +
  `apps/api/src/modules/auth/decorators/optional-user.decorator.ts` + `current-user.decorator.ts`.
- `apps/api/src/modules/orders/orders.service.ts` — `PrismaService` injection +
  `$transaction(async tx => …)` pattern for `getOrCreateMyConversation`.
- `apps/api/prisma/schema.prisma` — `User` model + named-relation precedent
  (`Category.parent`/`children` use `@relation("CategoryHierarchy")`).
- `apps/api/prisma/migrations/20260607211551_add_discount_redemptions/migration.sql`
  — hand-rolled SQL format we mirror (do NOT let `prisma migrate dev` autogen).
- `apps/api/src/main.ts:35-39` — REST CORS. `app.enableCors` does NOT cover Socket.io;
  the gateway needs its own `cors` block in `@WebSocketGateway`.
- `apps/api/test/factories/discount.factory.ts` — factory style for `chat.factory.ts`.
- `packages/types/src/discount-validation.types.ts` — Zod + inferred type pattern
  (no class-validator, no `@ApiProperty`).
- `packages/types/src/index.ts` — barrel export pattern.

### New Files

Backend (chat module — 9 NestJS files + gateway + gateway spec = 11):

- `apps/api/src/modules/chat/{chat.module.ts, chat.controller.ts, chat.controller.spec.ts,
chat.service.ts, chat.service.spec.ts, chat.repository.ts, chat.gateway.ts,
chat.gateway.spec.ts}`
- `apps/api/src/modules/chat/entities/{conversation.entity.ts, message.entity.ts}`
- `apps/api/src/modules/chat/dto/{create-message.dto.ts, update-conversation.dto.ts,
find-conversations-query.dto.ts, get-messages-query.dto.ts,
conversation-response.dto.ts, conversation-list-item-response.dto.ts,
message-response.dto.ts}`

Other:

- `packages/types/src/chat.types.ts`
- `apps/api/test/factories/chat.factory.ts`
- `apps/api/prisma/migrations/<timestamp>_add_chat_conversations/migration.sql`

### Patterns to Follow

- **Naming** (CLAUDE.md §4): kebab-case files, PascalCase classes/types,
  camelCase methods (`getOrCreateMyConversation`, `sendMessageAsCustomer`).
- **Layer separation** (CLAUDE.md §3): Controller/Gateway → Service → Repository.
  **No Prisma in gateway or controller.** Gateway resolves identity from
  `socket.data` and delegates everything else.
- **DTOs** (CLAUDE.md §7): `class-validator` + `@ApiProperty`/`@ApiPropertyOptional`;
  `implements Pick<Message, 'body'>` etc. Shared `@repo/types` stays decorator-free.
- **Logging** (CLAUDE.md §5): structured JSON with dot-namespaced events
  `chat.{service|gateway|controller}.{verb}_{state}` + `requestId` from
  `ClsService.getId()`. Gateway uses `socketId` when CLS isn't in scope.
- **Errors** (CLAUDE.md §7): use `NotFoundException`, `BadRequestException`,
  `ForbiddenException`. **In `@SubscribeMessage` handlers do NOT throw** — catch
  and return `{ ok: false, error }` so Socket.io ack semantics work.
- **Tests** (CLAUDE.md §6): co-located `.spec.ts`, factories only — never inline
  test data. `jest.Mocked<Pick<Repo, '…'>>` for partial mocks.

---

## IMPLEMENTATION PLAN

- **Phase 1 — Foundation**: shared types, schema, migration.
- **Phase 2 — Core**: entities, DTOs, repository, service.
- **Phase 3 — Transport**: REST controller + WebSocket gateway.
- **Phase 4 — Wiring & tests**: register module, factory, three spec files.
- **Phase 5 — Validation**: lint, typecheck, tests; manual REST + WS smoke.

---

## ARCHITECTURAL DECISIONS

**D1. Gateway↔Service coupling — return `BroadcastEnvelope`, not inject gateway.**
`ChatService.sendMessage…` returns `{ message, envelope }` where
`envelope: { rooms: string[]; event: 'message:new' | 'conversation:updated' | 'conversation:new'; payload: T }`.
The controller and gateway are the ONLY callers; both wrap with `this.gateway.broadcast(env)`.
Service unit tests need zero socket mocking. Rejected `forwardRef(ChatGateway)`
because it adds circular-import complexity for no real gain (3 call sites).

**D2. SYSTEM messages — `senderUserId = null`.** Welcome + "conversation closed"
auto messages use sender=SYSTEM; the FK is `SetNull`, no extra plumbing.

**D3. Guest race-safety — `$transaction` around get-or-create.**
`findOpenConversationByIdentity` + `createConversation` + welcome `createMessage`
all run inside one `prisma.$transaction(async tx => …)`. Concurrent first-visits
by the same guest session may still race at the DB level (no UNIQUE constraint
on `guestSession + status`), but the window is tiny; document as a known
limitation rather than adding a partial-unique index.

**D4. Closed-thread visibility — return CLOSED conversations from `findMyConversation`.**
Customers can read past correspondence; only NEW messages are blocked.
`getOrCreateMyConversation` creates fresh when the most-recent is CLOSED.

**D5. Read receipts — single bulk UPDATE.** No per-message receipts.
`markRead(conversationId, who)` updates `readBy{Customer|Admin}=true` for the
opposite-sender messages.

**D6. WebSocket auth — JWT in `socket.handshake.auth.token` OR `Authorization`
header; guest in `socket.handshake.auth.session`.** Same secret, same
`JwtPayload`, same `AuthService.validateUser` as REST. Rejected sockets get
`socket.disconnect(true)` with a `chat.gateway.connection_rejected` log.

**D7. No tenantId — fork-per-client.** Confirmed (CLAUDE.md §1 + memory
`whitelabel_strategy.md`).

---

## STEP-BY-STEP TASKS

### Task 1 — UPDATE `apps/api/prisma/schema.prisma`

Append two enums + two models AFTER `DiscountRedemption`:

```prisma
enum ConversationStatus { OPEN CLOSED }
enum MessageSender { CUSTOMER ADMIN SYSTEM }

model Conversation {
  id            String             @id @default(cuid())
  customerId    String?
  guestSession  String?
  status        ConversationStatus @default(OPEN)
  subject       String?            @db.VarChar(200)
  lastMessageAt DateTime           @default(now())
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  customer      User?              @relation(fields: [customerId], references: [id], onDelete: SetNull)
  messages      Message[]
  @@index([customerId])
  @@index([guestSession])
  @@index([status, lastMessageAt])
}

model Message {
  id             String        @id @default(cuid())
  conversationId String
  sender         MessageSender
  senderUserId   String?
  body           String        @db.Text
  readByCustomer Boolean       @default(false)
  readByAdmin    Boolean       @default(false)
  createdAt      DateTime      @default(now())
  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderUser     User?         @relation("MessagesSent", fields: [senderUserId], references: [id], onDelete: SetNull)
  @@index([conversationId, createdAt])
}
```

Add to `User` model: `conversations Conversation[]` and
`sentMessages Message[] @relation("MessagesSent")`.

- **GOTCHA**: TWO relations between Message and User would clash with
  `Conversation.customer User?` — Message.senderUser MUST be named
  (`@relation("MessagesSent")`).
- **VALIDATE**: `pnpm --filter @repo/api prisma:generate` succeeds.

### Task 2 — CREATE `apps/api/prisma/migrations/<timestamp>_add_chat_conversations/migration.sql`

Hand-write matching `20260607211551_add_discount_redemptions/migration.sql` format:

1. `CREATE TYPE "ConversationStatus" AS ENUM ('OPEN','CLOSED');`
2. `CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER','ADMIN','SYSTEM');`
3. `CREATE TABLE "Conversation" (id TEXT PRIMARY KEY, customerId TEXT, guestSession TEXT,
status "ConversationStatus" NOT NULL DEFAULT 'OPEN', subject VARCHAR(200),
lastMessageAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
updatedAt TIMESTAMP(3) NOT NULL)`.
4. `CREATE TABLE "Message" (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL,
sender "MessageSender" NOT NULL, senderUserId TEXT, body TEXT NOT NULL,
readByCustomer BOOLEAN NOT NULL DEFAULT false, readByAdmin BOOLEAN NOT NULL DEFAULT false,
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`.
5. Indexes: `Conversation_customerId_idx`, `Conversation_guestSession_idx`,
   `Conversation_status_lastMessageAt_idx`, `Message_conversationId_createdAt_idx`.
6. FKs: `Conversation_customerId_fkey` → `User(id)` ON DELETE SET NULL;
   `Message_conversationId_fkey` → `Conversation(id)` ON DELETE CASCADE;
   `Message_senderUserId_fkey` → `User(id)` ON DELETE SET NULL.

- **GOTCHA**: directory timestamp = UTC `YYYYMMDDHHMMSS`, must be greater than
  `20260607211551`. Use the same casing as other migrations (`"Conversation"`).

### Task 3 — CREATE `packages/types/src/chat.types.ts`

```ts
import { z } from 'zod';

export const ConversationStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export const MessageSenderSchema = z.enum(['CUSTOMER', 'ADMIN', 'SYSTEM']);
export type MessageSender = z.infer<typeof MessageSenderSchema>;

export interface Conversation {
  id: string;
  customerId: string | null;
  guestSession: string | null;
  status: ConversationStatus;
  subject: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  senderUserId: string | null;
  body: string;
  readByCustomer: boolean;
  readByAdmin: boolean;
  createdAt: Date;
}
```

### Task 4 — UPDATE `packages/types/src/index.ts`

Add `export * from './chat.types';` (alphabetical position).

### Task 5 — CREATE entity files

`entities/conversation.entity.ts` and `entities/message.entity.ts` — pattern:

```ts
import type { Conversation } from '@repo/types';
export class ConversationEntity implements Conversation {
  /* every field with `!: T` */
}
```

### Task 6 — CREATE DTOs

- **`dto/create-message.dto.ts`**: `body!: string` with `@ApiProperty`,
  `@IsString() @MinLength(1) @MaxLength(4000)`. Implements `Pick<Message, 'body'>`.
  **GOTCHA**: `MinLength(1)` accepts `"   "` — service trims and re-checks.
- **`dto/update-conversation.dto.ts`**: `status?: ConversationStatus`
  (`@IsOptional() @IsIn(['OPEN','CLOSED'])`); `subject?: string`
  (`@IsOptional() @IsString() @MaxLength(200)`).
- **`dto/find-conversations-query.dto.ts`**: copy
  `discounts/dto/find-discounts-query.dto.ts` and add
  `@IsOptional() @IsIn(['OPEN','CLOSED']) status?: ConversationStatus`.
- **`dto/get-messages-query.dto.ts`**: `cursor?: string` (`@IsOptional() @IsString()`);
  `limit?: number` (`@IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)`,
  default 50 applied in controller).
- **`dto/conversation-response.dto.ts`**: full `Conversation` shape with
  `@ApiProperty` per field; static `from(entity: ConversationEntity): ConversationResponseDto`.
- **`dto/conversation-list-item-response.dto.ts`**: extends
  ConversationResponseDto with `preview: string | null` + `unreadForAdmin: number`;
  static `from({ entity, preview, unreadForAdmin })`.
- **`dto/message-response.dto.ts`**: full Message shape + `from(entity)` mapper.

### Task 7 — CREATE `apps/api/src/modules/chat/chat.repository.ts`

Inject `PrismaService`. Every method optionally accepts `tx?: Prisma.TransactionClient`
and uses `const client = tx ?? this.prisma`. Methods:

- `createConversation({ customerId, guestSession, subject? }, tx?)`
- `findOpenConversationByIdentity({ customerId, guestSession }, tx?)` — `findFirst`
  with `where: { status: 'OPEN', ...(customerId ? { customerId } : { guestSession }) }`.
- `findLatestConversationByIdentity({ customerId, guestSession })` — same `where`
  minus the status filter; `orderBy: { lastMessageAt: 'desc' }`.
- `findById(id, tx?)`
- `listForAdmin({ status?, page, limit })` — `$transaction([findMany, count])`,
  `orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }]`,
  `include: { messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { body: true } },
_count: { select: { messages: { where: { sender: 'CUSTOMER', readByAdmin: false } } } } }`.
  Map each row to `{ entity, preview, unreadForAdmin }`. Return
  `PaginatedResponse<{ entity, preview, unreadForAdmin }>`.
- `updateConversation(id, patch, tx?)` — patch: `{ status?, subject?, lastMessageAt? }`.
- `createMessage({ conversationId, sender, senderUserId, body }, tx?)`
- `listMessages(conversationId, { cursor?, limit })` — `orderBy: { createdAt: 'desc' }`,
  `take: limit`, if cursor: `cursor: { id: cursor }, skip: 1`.
- `markAllRead(conversationId, who: 'customer' | 'admin', tx?)` — `updateMany`
  matching opposite sender + the matching `readBy*` false; returns `.count`.
- `countUnread(conversationId, who, tx?)` — corresponding `count(...)`.

Private `toConversationEntity(row)` and `toMessageEntity(row)`. Set every field explicitly.

- **PATTERN**: tx pattern from `discounts.repository.ts:99-120`; pagination from
  `discounts.repository.ts:41-58`.

### Task 8 — CREATE `apps/api/src/modules/chat/chat.service.ts`

Constructor:

```ts
constructor(
  private readonly repository: ChatRepository,
  private readonly prisma: PrismaService,
  @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
  private readonly cls: ClsService,
) {}
```

Define inside the file:

```ts
export interface BroadcastEnvelope<T> {
  rooms: string[];
  event: 'message:new' | 'conversation:updated' | 'conversation:new';
  payload: T;
}
```

Methods:

- `assertIdentity(identity: CartIdentity | null)` — throws BadRequest if null.
  Returns `{ customerId: identity.type === 'user' ? identity.id : null,
guestSession: identity.type === 'guest' ? identity.id : null }`.

- `assertOwnership(conv, identity)` — throws Forbidden unless identity matches
  the conversation's customerId/guestSession.

- `getOrCreateMyConversation(identity)`:
  1. `assertIdentity`; resolve `{ customerId, guestSession }`.
  2. `prisma.$transaction(async tx => { … })`:
     - Try `repo.findOpenConversationByIdentity({ customerId, guestSession }, tx)`.
       Return if found.
     - Else `repo.createConversation({ customerId, guestSession }, tx)`,
       then `repo.createMessage({ conversationId: created.id, sender: 'SYSTEM',
senderUserId: null, body: 'Welcome! How can we help?' }, tx)`.
     - Log `chat.service.conversation_created` with requestId, conversationId,
       identity.type.
     - Return created.
- `findMyConversation(identity)` — `assertIdentity`; load latest; throw NotFound
  when none.
- `listForAdmin({ status?, page, limit })` — pass-through to repo.
- `findById(id)` — throw NotFound when missing.
- `getMessages(conversationId, query, identity?)`: load via `findById`. If
  `identity` present, `assertOwnership`. Return `repo.listMessages`.
- `sendMessageAsCustomer(identity, conversationId, body)`:
  1. `assertIdentity`; load conv; `assertOwnership`.
  2. `trimmed = body.trim()`; if `trimmed.length === 0` → BadRequest('Body is empty').
  3. If `conv.status === 'CLOSED'` → BadRequest('Conversation is closed').
  4. `$transaction`: createMessage(sender=CUSTOMER, senderUserId = identity.type
     === 'user' ? identity.id : null), updateConversation(lastMessageAt = new Date()).
  5. Build envelope: rooms `['admin', \`customer:${conversationId}\`]`, event
`'message:new'`, payload = `MessageResponseDto.from(msg)`.
  6. Log `chat.service.message_sent_succeeded`. Return `{ message, envelope }`.
- `sendMessageAsAdmin(adminUserId, conversationId, body)` — same shape; sender=ADMIN,
  senderUserId=adminUserId, no ownership check; CLOSED check still applies.
- `markRead(conversationId, who, identity?)`:
  For 'customer': load + `assertOwnership(conv, identity!)`. Call `repo.markAllRead`.
  Log `chat.service.mark_read_succeeded`.
- `updateStatus(id, dto: UpdateConversationDto)`:
  Load current. `$transaction`: if `dto.status === 'CLOSED'` AND current is OPEN,
  insert SYSTEM message `'Conversation closed by support.'`.
  `updateConversation(id, dto, tx)`. Build envelope event=`'conversation:updated'`
  to both rooms; return `{ conversation, envelope }`.

- **GOTCHA**: Inject `PrismaService` ONLY for `$transaction`. All reads/writes go
  through the repository — even inside the transaction (pass `tx` through).

### Task 9 — CREATE `apps/api/src/modules/chat/chat.controller.ts`

Customer endpoints (`OptionalJwtAuthGuard`, identity via `@OptionalUser` +
`@Headers('x-cart-session')`):

- `GET /chat/me` — `getOrCreateMyConversation` → return `{ conversation, messages }`
  where messages = first page (limit 50).
- `GET /chat/me/messages` — `GetMessagesQueryDto`; load conv via service, then
  `getMessages(convId, query, identity)`.
- `POST /chat/me/messages` — `CreateMessageDto`; `sendMessageAsCustomer` →
  `gateway.broadcast(env)` → return MessageResponseDto.
- `POST /chat/me/read` — `markRead(convId, 'customer', identity)` → 204.

Admin endpoints (`JwtAuthGuard + RolesGuard + @Roles(ADMIN, STAFF)`):

- `GET /chat` — `FindConversationsQueryDto` → `listForAdmin` → map each row to
  `ConversationListItemResponseDto`.
- `GET /chat/:id` — `findById` + first page of messages.
- `GET /chat/:id/messages` — `getMessages(id, query, undefined)`.
- `POST /chat/:id/reply` — `@CurrentUser` user, `CreateMessageDto` →
  `sendMessageAsAdmin(user.id, id, body)` → broadcast.
- `POST /chat/:id/read` — `markRead(id, 'admin')` → 204.
- `PATCH /chat/:id` — `UpdateConversationDto` → `updateStatus(id, dto)` → broadcast.

- Private `resolveIdentity(user, session): CartIdentity` — copy lines 70-79 of
  `discounts.controller.ts`. Throws BadRequest when neither is present.
- Inject `ChatGateway` so the controller can `gateway.broadcast(envelope)`. Works
  without `forwardRef` because both providers live in `ChatModule`.
- Swagger: `@ApiTags('chat')`, `@ApiOperation`, `@ApiResponse(200|201|204|400|403|404)`,
  `@ApiBearerAuth()` on admin endpoints, `@ApiHeader({ name: 'x-cart-session', required: false })`
  on customer endpoints. `HttpCode(HttpStatus.NO_CONTENT)` on read/204 endpoints.

### Task 10 — CREATE `apps/api/src/modules/chat/chat.gateway.ts`

`@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })`,
implements `OnGatewayConnection, OnGatewayDisconnect`. `@WebSocketServer() server!: Server`.
Constructor injects `ChatService`, `JwtService`, `AuthService`, and the Winston
logger. Public method `broadcast<T>(env: BroadcastEnvelope<T>): void` iterates
`env.rooms` and calls `this.server.to(room).emit(env.event, env.payload)`.

Three subscribers: `@SubscribeMessage('conversation:join'|'message:send'|'message:read')`
each take `@ConnectedSocket() socket` + `@MessageBody() body`, return an ack
object (`{ ok: boolean; error?: string; messageId?: string }`). Wrap every
subscriber body in try/catch — return `{ ok: false, error: err.message }` on throw.

`handleConnection` logic:

1. Read token from `socket.handshake.auth?.token` OR Bearer in
   `socket.handshake.headers.authorization`.
2. If token: `payload = await this.jwt.verifyAsync<JwtPayload>(token);
user = await this.auth.validateUser(payload);` Attach `socket.data.user = user;
socket.data.identity = { type: 'user', id: user.id };` If role is ADMIN/STAFF,
   `await socket.join('admin');` Log `chat.gateway.connection_authenticated`.
3. Else if `socket.handshake.auth?.session`: attach
   `socket.data.identity = { type: 'guest', id: session };` Log auth event.
4. Else: log `chat.gateway.connection_rejected`, `socket.disconnect(true);`
5. Wrap entire body in try/catch; on any throw, disconnect + log.

`onJoin`: get identity + user from `socket.data`. Load conversation via
`service.findById`. If user is admin → join; else `service.assertOwnership(conv, identity)`
then join `customer:<conversationId>`. Wrap in try/catch → ack.

`onSend`: same auth split. Admin path → `sendMessageAsAdmin(user.id, body.conversationId, body.body)`;
customer path → `sendMessageAsCustomer(identity, body.conversationId, body.body)`.
Then `this.broadcast(envelope)`. Ack `{ ok: true, messageId: message.id }`.

`onRead`: dispatch to `service.markRead(conversationId, who, identityOrUndefined)`.

- **GOTCHA — JwtModule access**: `JwtService` requires `JwtModule` to be imported.
  Check `auth.module.ts` exports — if `JwtService` is not exported, add it to
  AuthModule's `exports` array as part of Task 13. Same for `AuthService`.
- **GOTCHA — CORS**: `@WebSocketGateway({ cors: { origin: true } })` accepts any
  origin in dev; production tightening can come later. The handshake rejection
  still gates auth, so CORS is not the security boundary.
- **GOTCHA**: thrown errors in `handleConnection` get swallowed by Nest — explicit
  `socket.disconnect(true)` is required.

### Task 11 — CREATE `apps/api/src/modules/chat/chat.module.ts`

`@Module({ imports: [PrismaModule, AuthModule], controllers: [ChatController],
providers: [ChatService, ChatRepository, ChatGateway], exports: [ChatService] })`.

### Task 12 — UPDATE `apps/api/src/app.module.ts`

Insert `ChatModule` between `CartModule` and `CategoriesModule` (alphabetical),
in both the import list and the `imports: []` array. Mirror the discounts insertion.

### Task 13 — VERIFY/UPDATE `apps/api/src/modules/auth/auth.module.ts`

Confirm `JwtService` and `AuthService` are in `exports`. If `JwtService` is not
(because `JwtModule.registerAsync` is internal), add `JwtModule` to AuthModule's
exports so re-importers transitively receive `JwtService`.

### Task 14 — CREATE `apps/api/test/factories/chat.factory.ts`

`createMockConversation(overrides?)` defaults: `customerId='user-N'`, `guestSession=null`,
`status='OPEN'`, fixed `2026-01-01` dates. `createMockMessage(overrides?)` defaults:
`conversationId='conv-1'`, `sender='CUSTOMER'`, `senderUserId='user-1'`,
`readByCustomer=true`, `readByAdmin=false`. Increment per-call counters for unique ids.

### Task 15 — CREATE `apps/api/src/modules/chat/chat.service.spec.ts`

Mocks: `jest.Mocked<Pick<ChatRepository, ...>>` for all 10 repo methods;
`mockPrisma.$transaction` passthrough (copy from `orders.service.spec.ts:67-74` —
invoke the callback with `{} as Prisma.TransactionClient`); mockLogger;
`mockCls.getId.mockReturnValue('req-id')`. Cases:

1. `getOrCreateMyConversation` returns existing OPEN row when present (no createConversation call).
2. `getOrCreateMyConversation` creates conversation + SYSTEM welcome inside same tx
   (assert both repo calls received the tx arg via `expect.anything()`).
3. `getOrCreateMyConversation` BadRequest when identity is null.
4. `findMyConversation` NotFound when none exists.
5. `sendMessageAsCustomer` inserts row + updates `lastMessageAt`; envelope rooms
   = `['admin','customer:<id>']` and event = `'message:new'`.
6. `sendMessageAsCustomer` BadRequest on `body='   '`.
7. `sendMessageAsCustomer` BadRequest when conversation.status=CLOSED.
8. `sendMessageAsCustomer` Forbidden when identity doesn't own conversation.
9. `sendMessageAsAdmin` OK; same CLOSED check applies.
10. `markRead('customer', identity)` asserts ownership; repo called with who='customer'.
11. `markRead('admin')` skips ownership; repo called with who='admin'.
12. `updateStatus(CLOSED)` flips status + inserts SYSTEM message in same tx;
    envelope event = `'conversation:updated'`.
13. `getMessages` with customer identity asserts ownership BEFORE listing.

### Task 16 — CREATE `apps/api/src/modules/chat/chat.controller.spec.ts`

Mock `ChatService` (10 methods) + `ChatGateway` (`{ broadcast: jest.fn() }`).
Cases (mirroring `discounts.controller.spec.ts`):

1. `GET /chat/me` with auth user → `getOrCreateMyConversation` called with `{ type: 'user', id }`.
2. `GET /chat/me` with guest session header → `{ type: 'guest', id: session }`.
3. `GET /chat/me` with neither → BadRequest.
4. `POST /chat/me/messages` → calls `gateway.broadcast` with the envelope returned
   by `sendMessageAsCustomer`.
5. `POST /chat/:id/reply` (admin) → passes `user.id` to `sendMessageAsAdmin`;
   broadcasts envelope.
6. `PATCH /chat/:id` (admin, `{ status: 'CLOSED' }`) → broadcasts
   `conversation:updated`.

### Task 17 — CREATE `apps/api/src/modules/chat/chat.gateway.spec.ts`

Cases (focus on auth + room access — leave business logic to service spec):

1. `handleConnection`: no token + no session → `socket.disconnect(true)` called,
   no `socket.data.identity`.
2. `handleConnection`: valid JWT (customer) → `socket.data.user` set,
   `identity={type:'user'}`, NO `socket.join('admin')`.
3. `handleConnection`: valid JWT (admin) → joins `admin` room.
4. `handleConnection`: guest session → `identity={type:'guest'}`, no admin join.
5. `onJoin` customer: ownership rejection → returns `{ ok: false, error }`, no
   `socket.join`.
6. `onJoin` admin: joins `customer:<id>` regardless of customerId.
7. `onSend` customer: delegates to `sendMessageAsCustomer` and the broadcast emits
   to both rooms (assert `server.to('admin').emit('message:new', payload)` AND
   `server.to('customer:<id>').emit(...)`).

Fake socket shape: `{ id, handshake: { auth, headers }, data: {}, join: jest.fn(),
disconnect: jest.fn() }`. Fake server: `{ to: jest.fn().mockReturnThis(),
emit: jest.fn() }`. Mock `JwtService.verifyAsync` and `AuthService.validateUser`.

### Task 18 — RUN validation

```bash
pnpm --filter @repo/types typecheck
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api lint
pnpm --filter @repo/api typecheck
pnpm --filter @repo/web typecheck
pnpm --filter @repo/api test
```

When Docker is available: `pnpm --filter @repo/api prisma:migrate` to apply Task 2.

---

## TESTING STRATEGY

### Unit Tests (Backend) — Jest, co-located, factories only

- `chat.service.spec.ts` — 13 cases above; 80% coverage target (CLAUDE.md §1).
  Partial mock: `jest.Mocked<Pick<ChatRepository, 'createConversation' |
'findOpenConversationByIdentity' | 'findLatestConversationByIdentity' | 'findById' |
'createMessage' | 'updateConversation' | 'listMessages' | 'markAllRead' |
'listForAdmin' | 'countUnread'>>`.
- `chat.controller.spec.ts` — 6 cases on identity resolution + RBAC + broadcast wiring.
- `chat.gateway.spec.ts` — 7 cases on handshake + room access + emit.

### E2E Tests (Frontend)

Out of scope for THIS plan — frontend chat widget belongs to a follow-up admin UI task.

### Edge Cases

- Identity XOR enforced by service `assertIdentity`.
- Concurrent guest first-visit: documented as best-effort (no DB UNIQUE), small
  race window inside `$transaction`.
- Whitespace-only body rejected by `trim().length === 0`.
- Reply to CLOSED rejected for both customer and admin.
- Admin closes conversation: SYSTEM message + status flip in same tx (test 12).
- Guest "auth" is the session string — same threat model as existing cart guest.

---

## VALIDATION COMMANDS

### Level 1: Lint (hard gate)

```bash
pnpm --filter @repo/api lint
```

### Level 2: Type Check (hard gate)

```bash
pnpm --filter @repo/types typecheck
pnpm --filter @repo/api typecheck
pnpm --filter @repo/web typecheck
```

### Level 3: Unit Tests

```bash
pnpm --filter @repo/api test
```

### Level 4: Prisma (Docker required)

```bash
docker compose up -d postgres redis
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate
```

### Level 5: Manual Smoke

REST: log in as admin → `GET /chat/me` → `POST /chat/me/messages` → admin
`GET /chat?status=OPEN` → `POST /chat/:id/reply` → `PATCH /chat/:id`
(status=CLOSED). See VALIDATE block in `.claude/references/chat-module-prompt.md`
for full curl commands.

WebSocket: `wscat -c 'ws://localhost:3001/chat' -H "authorization: Bearer $TOKEN"`,
emit `conversation:join` then `message:send`; both rooms (`admin` and
`customer:<id>`) should receive `message:new`.

Swagger `/docs` shows the "chat" tag with 9 REST endpoints; the WS gateway
intentionally does not appear in Swagger.

---

## ACCEPTANCE CRITERIA

- [ ] All 18 tasks completed; no file omitted.
- [ ] `pnpm --filter @repo/api lint` exits 0 with `--max-warnings=0`.
- [ ] `@repo/types`, `@repo/api`, `@repo/web` typechecks all clean.
- [ ] `pnpm --filter @repo/api test` passes (existing 186 + ~26 new tests).
- [ ] `app.module.ts` registers `ChatModule` alphabetically.
- [ ] Swagger shows the "chat" tag with 9 endpoints.
- [ ] Migration SQL applies on a fresh DB (when Docker available).
- [ ] No regressions in cart, orders, payments, discounts test suites.

---

## NOTES

**Out of scope (do NOT add):** attachments, typing indicators, push notifications,
third-party widgets, per-user rate limit on `message:send`.

**Trade-offs:**

- `BroadcastEnvelope` (D1) — adds a `gateway.broadcast(env)` line at 3 call sites;
  bought us socket-free service tests.
- No DB-level XOR (`customerId XOR guestSession`) — Prisma can't express CHECK
  constraints; service-level enforcement is the contract.
- Cursor pagination uses `Message.id` — cuids are sortable so this matches a
  `createdAt`-ordered cursor in practice.

**Open questions (NOT blockers):** include CLOSED in admin inbox by default
(plan: yes, sorted after OPEN); welcome message localization; auto-close after N
days of inactivity.

**Confidence Score**: 8/10 — main uncertainty is Socket.io CORS + JwtModule
export wiring, both addressed inline in Tasks 10/11/13.
