# Feature: newsletter-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Add the `newsletter` domain module (PRD §4.4, setup-guide §12.7). The storefront
needs an email-capture flow: a visitor submits their email, we persist it
locally as the source of truth, push it to a configurable upstream provider
(Mailchimp or Klaviyo), send a double-opt-in confirmation email via the
existing `MailService`, and honor unsubscribe via tokenized links AND inbound
provider webhooks. Admins get a paginated subscriber list, force-resync, and a
GDPR hard-delete endpoint.

The provider is swappable behind a `NewsletterProviderAdapter` port (same
shape as `PaymentProviderAdapter`). Three implementations ship: `Mailchimp`,
`Klaviyo`, and `Stub` (dev fallback when no API key is configured).

All outbound provider HTTP calls run through a dedicated BullMQ queue so the
storefront response is fast and resilient to upstream outages — failures retry
with exponential backoff; final failures flip `syncState=FAILED` for admin
attention.

## User Story

As a **storefront visitor** I want to subscribe via the footer / checkout /
popup so I receive launch announcements; as a **returning visitor** I want
one-click unsubscribe from any newsletter email; as an **admin** I want to
list, resync, and hard-delete subscribers so I can manage the audience and
honor GDPR erasure requests.

## Problem Statement

The platform has no subscriber capture today. Direct provider SDK calls from
the storefront are brittle (upstream outages surface as user errors) and lock
us to one vendor. We need a local source of truth + a provider-swappable port

- retry-safe sync — and we must avoid leaking which emails are subscribed.

## Solution Statement

Mirror two patterns already in this repo: `payments` module's provider port
(interface + DI token + `useFactory` binding + stub fallback) for
`NewsletterProviderAdapter`; `queues/emails` BullMQ producer + processor for
retry-safe provider sync. Add one Prisma model (`NewsletterSubscriber`) +
three enums. Service writes the row + enqueues the upstream push in one
`$transaction`; the processor calls the bound provider with BullMQ-managed
retries. Double-opt-in is controlled by a single env flag.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

| File                                                                             | Why                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/api/src/modules/products/` (all files)                                     | Canonical 9-file module structure (CLAUDE.md §3, §10)                   |
| `apps/api/src/modules/payments/payments.module.ts:22-46`                         | Exact `useFactory` shape selecting Provider vs Stub                     |
| `apps/api/src/modules/payments/providers/payment-provider.interface.ts`          | Provider port + DI token convention                                     |
| `apps/api/src/modules/payments/providers/stripe.provider.ts:50-170`              | Real-provider shape (logger/cls/config inject, event mapping)           |
| `apps/api/src/modules/payments/providers/stub.provider.ts`                       | Dev fallback shape; deterministic outputs; no network                   |
| `apps/api/src/modules/payments/payments.controller.ts:72-91`                     | `RawBodyRequest<Request>` webhook pattern                               |
| `apps/api/src/mail/mail.service.ts:36-106`                                       | `fetch + dev-stub when key empty` pattern for HTTP providers            |
| `apps/api/src/queues/queues.module.ts:41-66`                                     | BullMQ root + queue registration + retry/backoff defaults               |
| `apps/api/src/queues/emails/email-queue.service.ts`                              | Typed producer (`@InjectQueue` + ClsService stamp requestId)            |
| `apps/api/src/queues/emails/email.processor.ts:22-66`                            | `@Processor` + `WorkerHost` + rethrow-for-retry pattern                 |
| `apps/api/src/modules/discounts/discounts.controller.ts`                         | Admin paginated CRUD with `JwtAuthGuard + RolesGuard + @Roles(ADMIN)`   |
| `apps/api/src/modules/discounts/discounts.repository.ts:41-58`                   | `$transaction([findMany, count])` pagination                            |
| `apps/api/src/modules/discounts/discounts.service.ts:153-272`                    | Admin CRUD shape with logger + cls                                      |
| `apps/api/src/modules/chat/chat.service.ts`                                      | Most-recent reference; `tx?` pattern; $transaction callbacks            |
| `apps/api/src/modules/chat/chat.repository.ts`                                   | `const client = tx ?? this.prisma`; private `toEntity` mapper           |
| `apps/api/src/config/configuration.ts`                                           | Where to add 9 new env keys                                             |
| `apps/api/src/main.ts:23-26`                                                     | Confirms `rawBody: true` already on at bootstrap                        |
| `apps/api/src/app.module.ts:9-21`                                                | Alphabetical import order; Newsletter goes between Discounts and Orders |
| `packages/types/src/chat.types.ts`                                               | Zod-enum + `satisfies z.ZodType<X>` shape to copy                       |
| `packages/types/src/index.ts`                                                    | Barrel; insert `newsletter.types` alphabetically                        |
| `apps/api/prisma/schema.prisma:207-252`                                          | Chat block style — append newsletter block beneath                      |
| `apps/api/prisma/migrations/20260608120000_add_chat_conversations/migration.sql` | Hand-rolled SQL format precedent                                        |
| `apps/api/src/modules/chat/chat.service.spec.ts`                                 | `jest.Mocked<Pick<X,'…'>>` + `mockPrisma.$transaction` passthrough      |
| `apps/api/test/factories/chat.factory.ts`                                        | Factory shape; `String(n)` to dodge lint rule                           |
| `.claude/references/newsletter-module-prompt.md`                                 | Authoritative for endpoint shapes + DTO names                           |

### New Files to Create

- `packages/types/src/newsletter.types.ts` (NEW) + edit
  `packages/types/src/index.ts` barrel.
- `apps/api/prisma/schema.prisma` (EDIT: 3 enums + 1 model) +
  `prisma/migrations/20260613000000_add_newsletter_subscribers/migration.sql`
  (NEW, hand-rolled).
- `apps/api/src/config/configuration.ts` (EDIT: +9 keys),
  `apps/api/src/app.module.ts` (EDIT: register module), `.env.example`
  (EDIT: add placeholders).
- `apps/api/src/modules/newsletter/` (NEW dir): `newsletter.{module,controller,
service,repository,queue.service,processor}.ts`, `newsletter-job.types.ts`,
  `providers/{newsletter-provider.interface,mailchimp.provider,klaviyo.provider,
stub.provider}.ts`, `entities/newsletter-subscriber.entity.ts`, `dto/` (7
  files: subscribe, confirm-query, unsubscribe, find-newsletter-query,
  subscribe-response, confirm-response, newsletter-subscriber-response).
- Specs: `newsletter.{service,controller,processor,module}.spec.ts` +
  `providers/{mailchimp,klaviyo,stub}.provider.spec.ts` (3).
- `apps/api/test/factories/newsletter.factory.ts` (NEW).

### Patterns to Follow

- **Naming**: kebab-case files, PascalCase classes, camelCase methods (CLAUDE.md §4).
- **Layer separation**: controller → service → repository; processor calls
  provider directly but writes state via the repository only.
- **DTOs**: every field has BOTH `@ApiProperty(Optional)` and `class-validator`.
- **Shared types**: pure interfaces + Zod `satisfies z.ZodType<X>` in
  `@repo/types`; no class-validator. `confirmationToken` is INTERNAL — never
  in the shared interface.
- **Logging**: `WINSTON_MODULE_NEST_PROVIDER`; dot-namespaced
  `newsletter.{service|controller|provider.<name>|processor|module}.{verb}_{state}`;
  always include `requestId` from `ClsService.getId()`.
- **Errors**: `BadRequest`, `NotFound`, `Conflict`, `Forbidden` from `@nestjs/common`.
- **Transactions**: repo methods accept `tx?: Prisma.TransactionClient` via
  `const client = tx ?? this.prisma`.

---

## ARCHITECTURAL DECISIONS

- **D1 — Confirm-token race.** `confirm(token)` is a 2-stmt `$transaction`:
  `findFirst({ where: { confirmationToken } })` → branch on status. PENDING →
  `tx.update` (clear token, set `confirmedAt`) → CONFIRMED. CONFIRMED →
  ALREADY_CONFIRMED. Missing/UNSUBSCRIBED → INVALID_TOKEN. Simpler than
  `SELECT FOR UPDATE`; worst race outcome is an idempotent ALREADY_CONFIRMED.
- **D2 — Processor in NewsletterModule, NOT QueuesModule.** Avoids circular
  import (processor needs `NEWSLETTER_PROVIDER` + `NewsletterRepository`).
  `QueuesModule.forRootAsync` registers the BullMQ connection globally;
  NewsletterModule does its own `BullModule.registerQueue({ name:
'newsletter' })`. QueuesModule untouched.
- **D3 — Anti-enumeration shape.** `/subscribe`, `/unsubscribe`,
  `/webhooks/:provider` all return `{ status: 'ACCEPTED', message }`
  regardless of state. `/confirm` returns explicit `CONFIRMED |
ALREADY_CONFIRMED | INVALID_TOKEN` (caller already has the tokenized link).
- **D4 — Token format.** `randomBytes(32).toString('hex')` = 64 hex chars.
  DTO: `@Length(64,64) @Matches(/^[a-f0-9]+$/)`. `confirmationToken` is
  UNIQUE — collisions surface as P2002.
- **D5 — Provider stamp guard.** Every row stamps `provider`. `forceResync`
  throws Conflict when `row.provider !== null && row.provider !==
boundProvider.name`. Prevents silent Mailchimp→Klaviyo mass-resync after
  env swap.
- **D6 — Webhook raw-body.** `main.ts:25` already boots with `{ rawBody: true
}`. Reuse `@Req() req: RawBodyRequest<Request>` + `req.rawBody` from the
  Stripe webhook. Mailchimp verifies via constant-time compare of `?s=<secret>`
  query param; Klaviyo via HMAC-SHA256 vs `X-Klaviyo-Signature`.
- **D7 — Admin DELETE is hard delete (GDPR).** Soft-delete leaks existence.
  `DELETE /:id` calls `repo.remove` then try/catches
  `provider.unsubscribe(email)` — provider failure logged, never 500s.

---

## IMPLEMENTATION PLAN

- **Phase 1 — Foundation**: Prisma schema + migration; `@repo/types`;
  `ConfigSchema` + `.env.example`. No new npm deps (built-in `fetch`+`crypto`).
- **Phase 2 — Provider abstraction**: port + DI token + 3 implementations.
- **Phase 3 — Module core**: entity + 7 DTOs + repo + queue producer +
  processor + service + controller.
- **Phase 4 — Wiring**: register `NewsletterModule` alphabetically.
- **Phase 5 — Tests + validation**: 5 specs + factory; lint/typecheck/test.

---

## STEP-BY-STEP TASKS

Execute every task in order. Each is atomic and independently testable.

### Task 1 — UPDATE `apps/api/prisma/schema.prisma`

Append below the chat block (line 252):

```prisma
enum NewsletterStatus { PENDING CONFIRMED UNSUBSCRIBED }
enum NewsletterSource { FOOTER CHECKOUT POPUP ADMIN UNKNOWN }
enum NewsletterSyncState { SYNCED PENDING_SYNC FAILED NOT_APPLICABLE }

model NewsletterSubscriber {
  id                   String              @id @default(cuid())
  email                String              @unique
  status               NewsletterStatus    @default(PENDING)
  source               NewsletterSource    @default(UNKNOWN)
  locale               String?             @db.VarChar(8)
  tags                 String[]            @default([])
  providerSubscriberId String?
  provider             String?             @db.VarChar(20)
  syncState            NewsletterSyncState @default(PENDING_SYNC)
  lastSyncAt           DateTime?
  lastSyncError        String?
  confirmationToken    String?             @unique
  confirmedAt          DateTime?
  unsubscribedAt       DateTime?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  @@index([status])
  @@index([syncState])
  @@index([provider])
}
```

- **PATTERN**: chat block at `schema.prisma:207-252`.
- **GOTCHA**: No FK to `User` — newsletter subscribers can be anonymous.
- **VALIDATE**: `pnpm --filter @repo/api prisma generate` succeeds.

### Task 2 — CREATE `apps/api/prisma/migrations/20260613000000_add_newsletter_subscribers/migration.sql`

- **IMPLEMENT**: Hand-rolled SQL — `CREATE TYPE` for 3 enums; `CREATE TABLE
"NewsletterSubscriber"` matching the model (TEXT[] for `tags`); 3 `CREATE
INDEX`; `email` + `confirmationToken` as `CREATE UNIQUE INDEX` lines.
- **PATTERN**: `20260608120000_add_chat_conversations/migration.sql`.
- **GOTCHA**: Timestamp must sort after chat (`20260613000000` > `20260608120000`).
- **VALIDATE**: `prisma migrate status` (if Docker up); otherwise note "to
  apply once Docker is available" per chat precedent.

### Task 3 — CREATE `packages/types/src/newsletter.types.ts`

- **IMPLEMENT**: 3 Zod enums via `z.enum([...])`; `NewsletterSubscriber`
  interface (EXCLUDING `confirmationToken`); `NewsletterSubscriberSchema
satisfies z.ZodType<NewsletterSubscriber>`. Inferred enum types via
  `z.infer`.
- **PATTERN**: `packages/types/src/chat.types.ts` (1:1).
- **VALIDATE**: `pnpm --filter @repo/types typecheck` clean.

### Task 4 — UPDATE `packages/types/src/index.ts`

- Insert `export * from './newsletter.types';` alphabetically between
  `order.types` and `pagination.types`.

### Task 5 — UPDATE `apps/api/src/config/configuration.ts`

Add to `ConfigSchema`:

```ts
NEWSLETTER_PROVIDER: z.enum(['mailchimp','klaviyo','stub']).default('stub'),
NEWSLETTER_DOUBLE_OPT_IN: z.coerce.boolean().default(true),
MAILCHIMP_API_KEY: z.string().default(''),
MAILCHIMP_AUDIENCE_ID: z.string().default(''),
MAILCHIMP_WEBHOOK_SECRET: z.string().default(''),
KLAVIYO_API_KEY: z.string().default(''),
KLAVIYO_LIST_ID: z.string().default(''),
KLAVIYO_WEBHOOK_SECRET: z.string().default(''),
PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
```

If `PUBLIC_WEB_URL` already exists, skip it.

- **VALIDATE**: `pnpm --filter @repo/api dev` boots without "Configuration
  validation failed".

### Task 6 — UPDATE `.env.example`

Append the 9 keys with placeholder values + a "Empty = dev stub mode"
comment, matching the existing RESEND_API_KEY / STRIPE_SECRET_KEY style. No
real keys.

### Task 7 — CREATE `apps/api/src/modules/newsletter/providers/newsletter-provider.interface.ts`

Mirror `payment-provider.interface.ts` 1:1:

- `UpsertSubscriberInput { email; tags?; locale?; doubleOptIn }`
- `UpsertSubscriberResult { providerSubscriberId; alreadyExisted }`
- `VerifiedNewsletterWebhook { eventId; type; email; providerSubscriberId? }`
- `NewsletterProviderAdapter { name; upsertSubscriber; unsubscribe; verifyWebhook }`
- `export const NEWSLETTER_PROVIDER = 'NEWSLETTER_PROVIDER';`

### Task 8 — CREATE `providers/stub.provider.ts`

- `name = 'stub'`; `upsertSubscriber` → `{ providerSubscriberId:
md5(email), alreadyExisted: false }` via `crypto.createHash('md5')`;
  `unsubscribe` is a no-op log; `verifyWebhook` returns `null`.
- Log `newsletter.provider.stub.{upsert|unsubscribe}_succeeded`.
- **PATTERN**: `payments/providers/stub.provider.ts`.

### Task 9 — CREATE `providers/mailchimp.provider.ts`

- `name = 'mailchimp'`. Constructor reads `MAILCHIMP_*`. Datacenter = key
  suffix after `-` (e.g. `xxx-us21` → `us21`).
- `upsertSubscriber`: `PUT https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${md5(email)}`
  with `Authorization: Basic ${b64('anystring:'+key)}` and body
  `{ email_address, status_if_new: doubleOptIn?'pending':'subscribed', tags }`.
  Non-2xx → throw structured `Error`.
- `unsubscribe`: PATCH same URL with `{ status: 'unsubscribed' }`.
- `verifyWebhook`: constant-time compare `?s=<secret>` query param via
  `crypto.timingSafeEqual` (short-circuit on length mismatch); parse
  `application/x-www-form-urlencoded` body; map `type ∈ {unsubscribe, cleaned,
spam}`; unknown → `null`.
- **PATTERN**: `mail.service.ts:36-106` (fetch); `stripe.provider.ts` (logs).

### Task 10 — CREATE `providers/klaviyo.provider.ts`

- `name = 'klaviyo'`. Constructor reads `KLAVIYO_*`.
- `upsertSubscriber`: `POST https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/`
  with `Authorization: Klaviyo-API-Key ${key}`, `revision: 2024-10-15`.
  JSON:API body wrapping email + list_id + custom_source. `providerSubscriberId`
  = response profile id (fallback email).
- `unsubscribe`: POST `.../profile-suppression-bulk-create-jobs/`.
- `verifyWebhook`: HMAC-SHA256 over raw body with `KLAVIYO_WEBHOOK_SECRET` →
  base64 → constant-time compare with `X-Klaviyo-Signature` header.

### Task 11 — CREATE `entities/newsletter-subscriber.entity.ts`

`class NewsletterSubscriberEntity implements NewsletterSubscriber { id!:
string; … }`. Pure data shell, no methods.

- **PATTERN**: `chat/entities/conversation.entity.ts`.

### Task 12 — CREATE 7 DTOs under `dto/`

| File                                    | Key validators                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribe.dto.ts`                      | `email` (`@IsEmail()` + `@Transform(({value}) => String(value).trim().toLowerCase())`); optional `source` (`@IsIn` 5 enums); `locale` (`@MaxLength(8)`); `tags` (`@IsArray() @ArrayMaxSize(20) @IsString({each:true}) @MaxLength(40,{each:true})`) |
| `confirm-query.dto.ts`                  | `token` (`@Length(64,64) @Matches(/^[a-f0-9]+$/)`)                                                                                                                                                                                                 |
| `unsubscribe.dto.ts`                    | `email` + optional `token` (same `@Length`/`@Matches`)                                                                                                                                                                                             |
| `find-newsletter-query.dto.ts`          | optional `status`, `syncState`, `provider`, `search`, `page`, `limit` — mirror `chat/dto/find-conversations-query.dto.ts`                                                                                                                          |
| `subscribe-response.dto.ts`             | literal `{ status: 'ACCEPTED'; message: string }` (D3)                                                                                                                                                                                             |
| `confirm-response.dto.ts`               | `{ status: 'CONFIRMED' \| 'ALREADY_CONFIRMED' \| 'INVALID_TOKEN' }`                                                                                                                                                                                |
| `newsletter-subscriber-response.dto.ts` | full subscriber shape + static `from(entity)` that **STRIPS confirmationToken**                                                                                                                                                                    |

Every field carries `@ApiProperty(Optional)`. Use `@Transform` from
`class-transformer` (already a dep).

### Task 13 — CREATE `newsletter.repository.ts`

Methods (all accept optional `tx?: Prisma.TransactionClient` via `const
client = tx ?? this.prisma`):

```
create(data, tx?)
findById(id)
findByEmail(email)
findByConfirmationToken(token, tx?)
update(id, patch, tx?)
markUnsubscribed(email, tx?)
listForAdmin(filters, pagination) → PaginatedResponse<Entity>
remove(id) // hard delete
```

`listForAdmin` uses `$transaction([findMany, count])` with a `where:` built
from `filters.{status, syncState, provider}` + `email: { contains: search,
mode: 'insensitive' }`. Default sort `createdAt DESC`. Private
`toEntity(row)` mapper.

- **PATTERN**: `discounts.repository.ts:41-58` (pagination); `99-120`
  (`tx?`).

### Task 14 — CREATE `newsletter-job.types.ts`

```ts
export const NEWSLETTER_QUEUE = 'newsletter';
export interface NewsletterJobBase {
  requestId?: string;
}
export interface UpsertSubscriberJob extends NewsletterJobBase {
  subscriberId: string;
}
export interface UnsubscribeJob extends NewsletterJobBase {
  email: string;
}
export type NewsletterJobData = UpsertSubscriberJob | UnsubscribeJob;
```

- **PATTERN**: `queues/emails/email-job.types.ts`.

### Task 15 — CREATE `newsletter.queue.service.ts`

Typed producer mirroring `EmailQueue`. Methods `enqueueUpsert(data)` and
`enqueueUnsubscribe(data)`. Private `withRequestId` helper stamps
`cls.getId()`.

- **PATTERN**: `queues/emails/email-queue.service.ts`.

### Task 16 — CREATE `newsletter.processor.ts`

`@Processor(NEWSLETTER_QUEUE) class NewsletterProcessor extends WorkerHost`.
Inject `@Inject(NEWSLETTER_PROVIDER)`, `NewsletterRepository`,
`LoggerService`, `ConfigService`.

`process(job)`:

- `'upsert-subscriber'`: load subscriber by id (skip + log if deleted);
  call `provider.upsertSubscriber({ email, tags, locale, doubleOptIn:
fromConfig })`; on success → `repo.update(id, { providerSubscriberId,
provider: provider.name, syncState: 'SYNCED', lastSyncAt: new Date(),
lastSyncError: null })`. On error → `repo.update(id, { lastSyncError:
err.message })`; if `job.attemptsMade + 1 >= job.opts.attempts` →
  additionally set `syncState: 'FAILED'`. RETHROW for BullMQ retry.
- `'unsubscribe'`: call `provider.unsubscribe(email)`; swallow 404-likes
  (log only); rethrow other errors.

- **PATTERN**: `queues/emails/email.processor.ts:22-66`.
- **GOTCHA**: `WorkerHost`'s `super()` MUST be called in the constructor.

### Task 17 — CREATE `newsletter.service.ts`

Inject: `repository`, `prisma`, `@Inject(NEWSLETTER_PROVIDER) provider`,
`queue`, `@Inject(MAIL_SERVICE) mail`, `config`, `logger`, `cls`.

**Public methods:**

- `subscribe(dto)` — normalize email + tags; `findByEmail` then branch:
  | existing status | action |
  |---|---|
  | missing | `$transaction`: create row (PENDING; token if doubleOptIn; confirmedAt=now if !doubleOptIn; syncState=PENDING_SYNC) → enqueue upsert → send email |
  | PENDING + lastSyncAt ≤ 60s | no-op (rate-limit) |
  | PENDING + lastSyncAt > 60s | regenerate token, re-enqueue, resend email |
  | CONFIRMED | no-op (idempotent) |
  | UNSUBSCRIBED | flip → PENDING + new token + clear unsubscribedAt + enqueue + email |
  ALWAYS returns `{ status: 'ACCEPTED', message }` (D3).
- `confirm(token)` — per D1; returns one of three statuses; NEVER throws.
- `unsubscribe(dto)` — with token: flip to UNSUBSCRIBED + enqueue provider
  unsub. Without token: send tokenized unsubscribe email. Always 200.
- `handleWebhook(providerName, verifiedEvent)` — unsubscribe/bounce/spam →
  flip to UNSUBSCRIBED; confirmed → flip PENDING → CONFIRMED; missing row →
  log + return void.
- `findById(id)` — NotFound if missing.
- `listForAdmin(filters, pagination)` — passthrough to repo.
- `forceResync(id)` — per D5; on pass: `repo.update(id, { syncState:
'PENDING_SYNC' })` + `queue.enqueueUpsert`.
- `remove(id)` — load + `repo.remove` + try/catch `provider.unsubscribe`.

**Logging** (every public method logs `_started` + `_succeeded`):
`newsletter.service.{subscribe|confirm|unsubscribe|webhook_handled|webhook_ignored|resync_enqueued|remove}_*`
plus `_idempotent`, `_rate_limited`, `_invalid_token`, `_already_confirmed`.

**Private helpers:** `generateToken()` (D4); `buildConfirmationEmail(sub)` →
link `${PUBLIC_WEB_URL}/${locale ?? 'en'}/newsletter/confirm?token=${token}`;
`normalizeTags(tags)` → dedupe + lowercase + trim + drop empty.

- **PATTERN**: `discounts.service.ts:153-272`; `chat.service.ts` (`$transaction`).

### Task 18 — CREATE `newsletter.controller.ts`

9 endpoints. Public endpoints get `@Throttle({ default: { limit: 5, ttl:
60_000 } })`. Webhook uses `@Req() req: RawBodyRequest<Request>` (D6). Inject
`@Inject(NEWSLETTER_PROVIDER) provider` so webhook can call
`provider.verifyWebhook`; the `:provider` route param is informational.

**Public (throttled):**

- `POST /subscribe` (SubscribeDto) → `service.subscribe` → ACCEPTED shape.
- `GET /confirm?token=` → `service.confirm` → `{ status }`.
- `POST /unsubscribe` (UnsubscribeDto) → ACCEPTED shape.
- `POST /webhooks/:provider` (raw body) → `provider.verifyWebhook(rawBody,
headers)`; null → 200 no-op; else `service.handleWebhook`. Always 200.

**Admin/Staff (`JwtAuthGuard + RolesGuard + @Roles(ADMIN, STAFF)`):**

- `GET /` (FindNewsletterQueryDto) → paginated; map via
  `NewsletterSubscriberResponseDto.from` (strips token).
- `GET /:id` → response DTO.
- `DELETE /:id` → hard delete (D7).
- `POST /:id/resync` → 202.
- `POST /:id/unsubscribe` → admin-forced path.

- **PATTERN**: `discounts.controller.ts`; `payments.controller.ts:72-91`.

### Task 19 — CREATE `newsletter.module.ts`

`@Module` with:

- **imports**: `PrismaModule`, `ConfigModule`,
  `BullModule.registerQueue({ name: NEWSLETTER_QUEUE, defaultJobOptions:
{ attempts: 5, backoff: { type: 'exponential', delay: 2000 },
removeOnComplete: true, removeOnFail: 100 } })`.
- **controllers**: `[NewsletterController]`.
- **providers**: `NewsletterService`, `NewsletterRepository`,
  `NewsletterQueue`, `NewsletterProcessor`, and a custom provider for
  `NEWSLETTER_PROVIDER` via `useFactory` (inject: `ConfigService`,
  `WINSTON_MODULE_NEST_PROVIDER`, `ClsService`). Factory branches:
  `'mailchimp' + MAILCHIMP_API_KEY` → `MailchimpProvider`; `'klaviyo' +
KLAVIYO_API_KEY` → `KlaviyoProvider`; else log
  `newsletter.module.stub_selected` and return `StubNewsletterProvider`.
- **exports**: `[NewsletterService]`.

- **PATTERN**: `payments.module.ts:22-46` (1:1 useFactory shape).
- **GOTCHA**: `BullModule.registerQueue` works WITHOUT re-importing
  `forRootAsync` — `QueuesModule.forRootAsync` registers the connection
  globally. `MailModule` is `@Global()`, so no import needed.

### Task 20 — UPDATE `apps/api/src/app.module.ts`

Import `NewsletterModule` and add to `imports` ALPHABETICALLY between
`DiscountsModule` and `OrdersModule`.

- **VALIDATE**: `pnpm --filter @repo/api dev` boots without errors.

### Task 21 — CREATE `apps/api/test/factories/newsletter.factory.ts`

```ts
import type { NewsletterSubscriber } from '@repo/types';
let counter = 0;
export function createMockSubscriber(
  overrides: Partial<NewsletterSubscriber> = {},
): NewsletterSubscriber {
  const n = ++counter;
  return {
    id: `sub-${String(n)}`,
    email: `user${String(n)}@example.com`,
    status: 'PENDING',
    source: 'FOOTER',
    locale: 'en',
    tags: [],
    providerSubscriberId: null,
    provider: null,
    syncState: 'PENDING_SYNC',
    lastSyncAt: null,
    lastSyncError: null,
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
```

- **GOTCHA**: `String(n)` not `${n}` — chat-factory precedent for
  `@typescript-eslint/restrict-template-expressions`.

### Task 22 — CREATE 3 provider specs

- `stub.provider.spec.ts` — 3 cases: upsert returns `md5(email)`;
  unsubscribe is a no-op; verifyWebhook returns null.
- `mailchimp.provider.spec.ts` — 6 cases: upsert PUTs correct URL + Basic
  auth + body; non-2xx → structured error; verifyWebhook constant-time
  check (mismatch null, match parsed event); unknown event → null. Use
  `jest.spyOn(global, 'fetch')` with `mockResolvedValue(new Response(...))`.
- `klaviyo.provider.spec.ts` — 5 cases analogous.

- **PATTERN**: `payments/providers/stripe.provider.spec.ts`, `stub.provider.spec.ts`.

### Task 23 — CREATE `newsletter.service.spec.ts`

17 cases. Mocks: `jest.Mocked<Pick<NewsletterRepository,'…'>>`,
`mockPrisma.$transaction` passthrough, `mockProvider`, `mockQueue`,
`mockMail`, `mockConfig.get`. Use the factory.

Cases: (1) subscribe(new) inserts+enqueues+emails; (2) subscribe(PENDING
recent) no-op; (3) subscribe(PENDING stale) regenerates+resends;
(4) subscribe(CONFIRMED) no-op; (5) subscribe(UNSUBSCRIBED) flips to PENDING;
(6) subscribe normalizes email+tags; (7) confirm(valid PENDING) → CONFIRMED

- clears token; (8) confirm(CONFIRMED) → ALREADY_CONFIRMED; (9) confirm
  (missing) → INVALID_TOKEN; (10) confirm(UNSUBSCRIBED) → INVALID_TOKEN;
  (11) unsubscribe(email+token) → UNSUBSCRIBED+queue; (12) unsubscribe(email
  only) → tokenized email; (13) handleWebhook('unsubscribe') flips;
  (14) handleWebhook('confirmed') flips PENDING only; (15) handleWebhook
  (unknown email) void; (16) forceResync → Conflict on provider mismatch;
  (17) double-opt-in=false → subscribe sets CONFIRMED immediately.

* **PATTERN**: `chat/chat.service.spec.ts`.

### Task 24 — CREATE `newsletter.controller.spec.ts`

8 cases:

1. POST /subscribe always `{ status: 'ACCEPTED' }`
2. GET /confirm — parameterize across 3 result statuses
3. POST /unsubscribe with token AND without — both ACCEPTED
4. POST /webhooks/mailchimp verified → `service.handleWebhook` called
5. POST /webhooks/mailchimp unverified (provider null) → 200, no service call
6. GET / non-admin → 403
7. GET / admin → paginated; deep-assert response objects do NOT contain
   `confirmationToken`
8. POST /:id/resync calls `service.forceResync`

- **PATTERN**: `chat/chat.controller.spec.ts`.

### Task 25 — CREATE `newsletter.processor.spec.ts`

4 cases:

1. upsert success → provider called + repo.update with SYNCED +
   providerSubscriberId
2. upsert failure (non-final) → lastSyncError set, syncState stays
   PENDING_SYNC, error rethrown
3. upsert failure (final: `job.attemptsMade + 1 === job.opts.attempts`) →
   syncState=FAILED
4. unsubscribe success → provider.unsubscribe called

- **PATTERN**: `queues/emails/email.processor.spec.ts`.

### Task 26 — CREATE `newsletter.module.spec.ts`

3 cases — compile a TestingModule per provider config:

1. `mailchimp` + key → `provider.name === 'mailchimp'`
2. `klaviyo` + key → `provider.name === 'klaviyo'`
3. missing keys → `provider.name === 'stub'`

### Task 27 — VALIDATE end-to-end

```
pnpm --filter @repo/api lint            # 0 errors, --max-warnings=0
pnpm --filter @repo/types typecheck     # clean
pnpm --filter @repo/api typecheck       # clean
pnpm --filter @repo/api test            # all suites pass; coverage OK
pnpm --filter @repo/api dev             # boots; log shows stub_selected (or mailchimp_selected)
```

Manual smoke (only when Docker is up; otherwise defer per chat precedent):

```
curl -X POST localhost:3001/newsletter/subscribe -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com"}'
# → { status: 'ACCEPTED', message: '…' }
# Confirmation HTML is in Winston log (mail.service.send_skipped event).
# Extract token → GET /newsletter/confirm?token=<token> → { status: 'CONFIRMED' }
```

---

## TESTING STRATEGY

**Unit (backend):** 17 service + 8 controller + 4 processor + 3 module-binding

- 14 provider = ~46 new cases. All use `apps/api/test/factories/newsletter.factory.ts`
  — no inline subscriber rows.

**E2E (frontend):** NOT in scope. Storefront subscribe widget is a future
ticket (chat-widget precedent).

**Edge cases covered:**

- Email case normalization (`JANE@…` keyed as `jane@…`)
- Tag dedup (`['VIP','vip','vip ']` → `['vip']`)
- Concurrent confirm-click race (D1 — `$transaction` find-then-update)
- Provider down at subscribe-time (row inserted; BullMQ retries 5× then
  FAILED)
- Webhook for unknown email (log + 200; provider has wider knowledge)
- Empty / wrong webhook signature (verifyWebhook returns null; controller
  200s)
- Provider mismatch on resync (Conflict)

---

## VALIDATION COMMANDS

### Level 1: Lint (hard gate)

```
pnpm --filter @repo/api lint
```

### Level 2: Type Check (hard gate)

```
pnpm --filter @repo/types typecheck
pnpm --filter @repo/api typecheck
```

### Level 3: Unit Tests

```
pnpm --filter @repo/api test
```

### Level 4: Build Smoke

```
pnpm --filter @repo/api build
```

### Level 5: Manual Validation (Docker required)

```
docker compose up -d postgres redis
pnpm --filter @repo/api prisma:migrate -- --name add-newsletter-subscribers
```

Then run the smoke commands from Task 27. If Docker is NOT up, document in
the commit message that the migration is generated but unapplied (chat
module precedent: commit `e7e1e77`).

---

## ACCEPTANCE CRITERIA

- [ ] Prisma schema includes `NewsletterSubscriber` + 3 enums; migration SQL
      hand-rolled and timestamped after chat.
- [ ] `@repo/types` exports `NewsletterSubscriber` + 3 enum types via barrel.
- [ ] `NewsletterModule` registered in `app.module.ts` alphabetically.
- [ ] `NEWSLETTER_PROVIDER` token bound via `useFactory` matching payments.
- [ ] 3 provider implementations + spec each.
- [ ] `newsletter` BullMQ queue + typed producer + processor live INSIDE
      `NewsletterModule`; `QueuesModule` untouched.
- [ ] 8–9 REST endpoints documented in Swagger under `@ApiTags('newsletter')`.
- [ ] Anti-enumeration: `/subscribe`, `/unsubscribe`, `/webhooks/:provider`
      ALL return `{ status: 'ACCEPTED' }` shape regardless of state.
- [ ] `confirmationToken` NEVER appears in any response or shared type.
- [ ] `forceResync` throws Conflict when stored provider mismatches bound.
- [ ] DELETE is a hard delete (GDPR), with best-effort provider unsubscribe.
- [ ] ~46 new test cases. All pass. `--max-warnings=0` clean.

---

## NOTES

**Risks**: (a) Klaviyo's `profile-subscription-bulk-create-jobs` JSON:API
shape is verbose; first impl may need one round-trip against real API.
Mitigated by Stub being the default — the module boots + serves all REST
contracts before any Klaviyo wiring runs. (b) Webhook signature formats can
drift; provider-level abstraction isolates the change. (c) Processor mutates
rows whose IDs came from a queue job — admin-deleted rows must skip
gracefully (Task 16 branch).

**Out of scope**: frontend signup widget, admin inbox UI, Playwright E2E,
CSV import, audience segmentation, multi-list routing — all future tickets.

**Confidence Score**: 8.5/10. Main uncertainty: Klaviyo body shape
(mitigation above); all other patterns have recent precedent in this repo.
