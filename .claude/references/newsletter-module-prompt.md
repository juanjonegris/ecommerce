---
description: /planning prompt for the newsletter domain module (Step 12.7 of setup guide — Mailchimp / Klaviyo behind a NewsletterService interface).
---

# Newsletter Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `newsletter` module under apps/api/src/modules/newsletter/.

Follow the `products` module structure exactly (controller / service / repository /
dto/ / entities/ / specs) AND the provider-port pattern from the `payments` module
(`providers/<name>.provider.ts` + a `*-provider.interface.ts` with a DI token).
Read every file in apps/api/src/modules/products/ first. Then read
apps/api/src/modules/payments/ — especially `payments.module.ts`,
`providers/payment-provider.interface.ts`, `providers/stripe.provider.ts`, and
`providers/stub.provider.ts` — because the newsletter provider abstraction must
mirror that shape (interface + DI token + env-driven `useFactory` binding +
stub fallback when no API key is configured). Then read
apps/api/src/mail/mail.service.ts (the `Resend → fetch → dev stub` pattern —
identical pattern applies to Mailchimp/Klaviyo) and
apps/api/src/queues/emails/email-queue.service.ts (typed-producer pattern —
copy it for the newsletter sync queue).

Then read apps/api/src/modules/discounts/ (most recent CRUD reference for the
admin endpoints / pagination / list shape) and apps/api/src/modules/chat/
(most recent reference module for logging style + dot-namespaced events).

NO existing newsletter schema. You will add new Prisma models + ONE migration
named `add-newsletter-subscribers`.

---

DOMAIN — what we are building:

A subscribe-to-newsletter flow for the storefront. A visitor submits their
email (footer form, checkout opt-in, or popup) and the API:

1. Persists a row in `NewsletterSubscriber` (local source of truth).
2. Pushes the subscriber to the configured provider (Mailchimp OR Klaviyo).
3. Sends a confirmation email (double opt-in) with a one-time token. The user
   clicks the link → status flips to CONFIRMED.
4. Honors unsubscribe via either a tokenized link in every newsletter email
   OR an inbound webhook from the provider (Mailchimp/Klaviyo notifies us
   when a recipient unsubscribes / bounces / marks as spam).
5. Admins can list subscribers, force-resync a row to the provider, and
   manually unsubscribe.

The local DB is the source of truth — the provider is an outbound mirror. If
the provider call fails, the subscription is still recorded locally and queued
for a retry via BullMQ. This keeps the storefront fast and resilient to
upstream outages.

EXPLICITLY OUT OF SCOPE for this module:

- Designing / sending newsletter campaigns (that's the provider's job — we only
  manage subscriber lifecycle).
- Audience segmentation UI (we pass through `tags: string[]` and `locale`, but
  no admin endpoints for managing segments).
- Email-template management (use existing MailService + inline HTML for the
  confirmation email; campaign templates live in Mailchimp/Klaviyo).
- SMS / push channel subscribers (PRD scope is email-only).
- Importing existing subscriber lists from CSV (admin-only one-off — defer).
- Per-fork audience routing — each fork sets its own MAILCHIMP_AUDIENCE_ID /
  KLAVIYO_LIST_ID. No multi-list logic.

---

SCHEMA (new — generate ONE migration named `add-newsletter-subscribers`):

    enum NewsletterStatus {
      PENDING       // double opt-in email sent, not clicked yet
      CONFIRMED     // confirmed via opt-in OR provider webhook
      UNSUBSCRIBED  // unsubscribed locally or via provider webhook
    }

    enum NewsletterSource {
      FOOTER
      CHECKOUT
      POPUP
      ADMIN          // admin-imported
      UNKNOWN
    }

    enum NewsletterSyncState {
      SYNCED            // last provider call succeeded
      PENDING_SYNC      // local insert/update done, provider call queued
      FAILED            // provider call failed terminally (max retries hit)
      NOT_APPLICABLE    // stub provider mode (no provider configured)
    }

    model NewsletterSubscriber {
      id                   String              @id @default(cuid())
      email                String              @unique
      status               NewsletterStatus    @default(PENDING)
      source               NewsletterSource    @default(UNKNOWN)
      locale               String?             @db.VarChar(8)   // e.g. "es", "en"
      tags                 String[]            @default([])
      providerSubscriberId String?             // Mailchimp md5(email) OR Klaviyo profile id
      provider             String?             @db.VarChar(20)  // "mailchimp" | "klaviyo" | "stub"
      syncState            NewsletterSyncState @default(PENDING_SYNC)
      lastSyncAt           DateTime?
      lastSyncError        String?             @db.Text
      confirmationToken    String?             @unique          // single-use, cleared on confirm
      confirmedAt          DateTime?
      unsubscribedAt       DateTime?
      createdAt            DateTime            @default(now())
      updatedAt            DateTime            @updatedAt

      @@index([status])
      @@index([syncState])
      @@index([provider])
    }

Application-enforced invariants:

- `email` is unique and is stored lowercase (service trims + `.toLowerCase()`).
- Re-subscribing an UNSUBSCRIBED row is allowed — it flips status to PENDING,
  generates a new `confirmationToken`, clears `unsubscribedAt`, and re-enqueues
  the provider push. Service emits a fresh confirmation email.
- Subscribing an already-CONFIRMED email is a no-op (200, idempotent).
- `confirmationToken` is a random 32-byte hex (use `randomBytes(32).toString('hex')`).
  Single-use: cleared atomically in the confirm $transaction.
- `tags` are deduped + lowercased at the service boundary.
- `provider` is stamped to whichever provider implementation handled the row
  (so a later runtime provider swap doesn't try to re-sync a Mailchimp row
  against Klaviyo). Service refuses to resync when the configured provider
  doesn't match `provider` — admin must explicitly migrate.

---

Shared types (packages/types/src/newsletter.types.ts — NEW, add to barrel in src/index.ts):

- export type NewsletterStatus = 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED';
- export type NewsletterSource = 'FOOTER' | 'CHECKOUT' | 'POPUP' | 'ADMIN' | 'UNKNOWN';
- export type NewsletterSyncState = 'SYNCED' | 'PENDING_SYNC' | 'FAILED' | 'NOT_APPLICABLE';
- export interface NewsletterSubscriber { id, email, status, source, locale: string | null,
  tags: string[], providerSubscriberId: string | null, provider: string | null,
  syncState, lastSyncAt: Date | null, lastSyncError: string | null,
  confirmedAt: Date | null, unsubscribedAt: Date | null, createdAt: Date, updatedAt: Date }
- Pure Zod schemas with `satisfies z.ZodType<X>` + inferred types only. No
  class-validator, no @ApiProperty. Mirror the chat.types.ts shape EXACTLY
  (enum-as-z.enum + `Schema satisfies z.ZodType<Interface>`).
- DO NOT expose `confirmationToken` in the shared type — that field is local-only
  and must never leak in API responses.

---

PROVIDER ABSTRACTION (apps/api/src/modules/newsletter/providers/):

Define a port that ANY newsletter SaaS can implement. Mirror payments/providers/
exactly — same file naming, same DI token approach.

newsletter-provider.interface.ts — NEW:

    /** Input handed to a provider when adding/updating a subscriber. */
    export interface UpsertSubscriberInput {
      email: string;
      tags?: string[];
      locale?: string;
      doubleOptIn: boolean;  // when true, provider should send its own opt-in email
                              // (we still send ours in single-opt-in mode for branding)
    }

    export interface UpsertSubscriberResult {
      providerSubscriberId: string;
      /** True when the provider already had this email — caller MAY no-op locally. */
      alreadyExisted: boolean;
    }

    /**
     * Verified inbound webhook from the provider. Returning null = authentic
     * but uninteresting event; handler should ack and do nothing.
     */
    export interface VerifiedNewsletterWebhook {
      eventId: string;
      type: 'unsubscribe' | 'bounce' | 'spam' | 'confirmed';
      email: string;
      providerSubscriberId?: string;
    }

    export interface NewsletterProviderAdapter {
      readonly name: 'mailchimp' | 'klaviyo' | 'stub';
      upsertSubscriber(input: UpsertSubscriberInput): Promise<UpsertSubscriberResult>;
      unsubscribe(email: string): Promise<void>;
      verifyWebhook(
        rawBody: Buffer,
        headers: Record<string, string>,
      ): Promise<VerifiedNewsletterWebhook | null>;
    }

    export const NEWSLETTER_PROVIDER = 'NEWSLETTER_PROVIDER';

Three implementations:

stub.provider.ts — used when NEWSLETTER*PROVIDER=stub OR when the selected
provider's API key is empty. Logs `newsletter.provider.stub.upsert*\*`events
and returns a deterministic`providerSubscriberId = md5(email)`. NEVER hits
the network. Mirrors apps/api/src/modules/payments/providers/stub.provider.ts.

mailchimp.provider.ts — POSTs to
`https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${md5(email)}`
using PUT (idempotent upsert) with `Authorization: Basic ${base64('anystring:apikey')}`.
Region/datacenter is parsed from the API key suffix (e.g. `xxx-us21` → `us21`).
Webhook verification uses the shared secret in the URL query string per
Mailchimp docs (no HMAC) — verify constant-time equality against
`MAILCHIMP_WEBHOOK_SECRET` from the query string. Webhook bodies are
form-encoded; parse and map `type=unsubscribe|cleaned|spam` → our types.

klaviyo.provider.ts — POSTs to `https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/`
with `Authorization: Klaviyo-API-Key ${apikey}` + `revision: 2024-10-15`.
Maps tags → Klaviyo properties. Webhook verification: HMAC-SHA256 over the
raw body with `KLAVIYO_WEBHOOK_SECRET`, compared against `X-Klaviyo-Signature`.

newsletter.module.ts binds NEWSLETTER_PROVIDER via `useFactory` reading
`NEWSLETTER_PROVIDER` + the relevant key from ConfigService — same pattern as
PaymentsModule. Fallback chain:

- `NEWSLETTER_PROVIDER=mailchimp` AND `MAILCHIMP_API_KEY` set → MailchimpProvider
- `NEWSLETTER_PROVIDER=klaviyo` AND `KLAVIYO_API_KEY` set → KlaviyoProvider
- everything else → StubNewsletterProvider (log `newsletter.module.stub_selected`)

ALL THREE providers expose `name: 'mailchimp' | 'klaviyo' | 'stub'` so the
service can stamp `subscriber.provider` correctly.

---

REST API ENDPOINTS (controller — `/newsletter`):

PUBLIC (throttled stricter — ip-based, ThrottlerGuard with explicit
@Throttle({ default: { limit: 5, ttl: 60_000 } }) per CLAUDE.md security
defaults):

POST /newsletter/subscribe — Body: { email, source?, locale?, tags? }.
Public. Idempotent. Returns
{ status: 'PENDING'|'CONFIRMED', message }.
NEVER reveals whether the email already exists
(anti-enumeration — return the same shape whether
the row is new, already PENDING, or already
CONFIRMED). Persists locally, enqueues a sync job,
sends confirmation email if status=PENDING.

GET /newsletter/confirm?token= — Public. Single-use token from the
confirmation email. Returns
{ status: 'CONFIRMED'|'ALREADY_CONFIRMED'|
'INVALID_TOKEN' }. NEVER 401 — returning
INVALID_TOKEN as a 200 body keeps the URL
shareable without leaking which side failed.
Logs `newsletter.controller.confirm_invalid_token`
on miss.

POST /newsletter/unsubscribe — Body: { email, token? }. If `token` present and
valid → unsubscribe immediately. If absent →
generate + email a new confirmation-style token
that will unsubscribe on click. Same
anti-enumeration: always 200, never reveal
membership.

POST /newsletter/webhooks/:provider — Public (provider IP whitelisting belongs
at the reverse-proxy layer, not here).
:provider ∈ {'mailchimp', 'klaviyo'}.
Reads raw body. Delegates verification
to the bound NewsletterProviderAdapter.
Honors `unsubscribe`/`bounce`/`spam` by
flipping the row to UNSUBSCRIBED. Honors
`confirmed` by flipping PENDING →
CONFIRMED. ACKs 200 even on null
verified webhook (provider retry hygiene).
Use `@Req() req: RawBodyRequest<...>`
and configure `rawBody: true` for this
route (same setup as the Stripe webhook
in payments.controller.ts).

ADMIN / STAFF (JwtAuthGuard + RolesGuard + @Roles(UserRole.ADMIN, UserRole.STAFF) —
mirror the discounts admin endpoints):

GET /newsletter — Paginated list. Query: ?status, ?syncState, ?provider, ?page,
?limit, ?search (matches email substring). Default sort:
createdAt DESC. NEVER returns confirmationToken.
GET /newsletter/:id — Single subscriber by id. 404 if missing.
DELETE /newsletter/:id — HARD-deletes the local row AND calls
`provider.unsubscribe(email)` in a try/catch (log
failure, don't 500). Use for GDPR right-to-erasure.
POST /newsletter/:id/resync — Force a provider upsert. Useful when syncState=FAILED.
No body. 409 if `subscriber.provider` exists and
doesn't match the currently-bound provider name
(admin must migrate explicitly).
POST /newsletter/:id/unsubscribe — Admin-forced unsubscribe (no token round-trip).

All endpoints: @ApiTags('newsletter'), @ApiOperation, @ApiResponse,
@ApiBearerAuth on admin endpoints. @ApiHeader documentation on the public
endpoints is NOT needed — these are anonymous.

---

SERVICE RULES:

NewsletterService methods:

- `subscribe({ email, source, locale, tags })` — normalizes email
  (`.trim().toLowerCase()`), de-dupes + lowercases tags, finds or creates
  the row in a $transaction. New row: generates confirmationToken, status=PENDING,
  syncState=PENDING_SYNC; enqueues provider sync job; sends confirmation email
  via existing MailService. Existing PENDING row: re-uses the token, re-sends
  the confirmation email (rate-limited via a `lastSyncAt` ≥ 60s check — return
  same anti-enumeration response without resending). Existing CONFIRMED row:
  return no-op response, do not touch the row. Existing UNSUBSCRIBED row:
  flip back to PENDING, regenerate token, clear unsubscribedAt, re-enqueue
  sync, re-send confirmation email.

- `confirm(token)` — atomic update: WHERE confirmationToken=token AND
  status=PENDING → SET status=CONFIRMED, confirmedAt=now(), confirmationToken=null.
  Returns 'CONFIRMED'. If no row matched, check for status=CONFIRMED with same
  token (race) → 'ALREADY_CONFIRMED'. Else → 'INVALID_TOKEN'.

- `unsubscribe({ email, token? })` — if token + matching row → flip to
  UNSUBSCRIBED, set unsubscribedAt, enqueue provider unsubscribe job. If no
  token → generate one and re-send the confirmation-style email (same anti-
  enumeration as subscribe). Provider call is asynchronous so the user gets a
  fast 200; failure is retried by the queue.

- `handleWebhook(provider, verifiedEvent)` — branch on event type:
  - 'unsubscribe' | 'bounce' | 'spam' → UPDATE row WHERE email=verifiedEvent.email,
    SET status=UNSUBSCRIBED, unsubscribedAt=now(). Idempotent.
  - 'confirmed' → UPDATE PENDING row WHERE email=verifiedEvent.email,
    SET status=CONFIRMED, confirmedAt=now(), confirmationToken=null.
    Returns void. Never throws on missing row (provider might know an email we
    don't — log and ignore).

- `findById(id)` — single fetch (NotFound). Strips confirmationToken before return.
- `listForAdmin(filters, pagination)` — PaginatedResponse<NewsletterSubscriber>.
- `forceResync(id)` — looks up row, validates `row.provider === provider.name`
  (throw Conflict otherwise), enqueues sync job with bypassExisting=true,
  bumps syncState to PENDING_SYNC.
- `remove(id)` — hard-delete + best-effort provider unsubscribe.

- NEVER imports PrismaService directly. All queries go through NewsletterRepository.
- Injects ConfigService to read NEWSLETTER_DOUBLE_OPT_IN flag (default true).
  When false, `subscribe` skips the confirmation-email step and immediately
  sets status=CONFIRMED. Local row still inserts via $transaction.
- Injects @Inject(NEWSLETTER_PROVIDER) — but the service NEVER calls the provider
  directly except in the `handleWebhook` verification step. All outbound provider
  calls go through the queue processor (so failures retry with backoff).
- Injects @Inject(MAIL_SERVICE) to send the confirmation email. Email body:
  inline HTML with the click-through URL =
  `${config.PUBLIC_WEB_URL}/${locale}/newsletter/confirm?token=${token}`.
- Injects CLS for `requestId`.

Logging dot-namespaces (mirror chat.service.\* style):

- newsletter.service.subscribe_started / \_succeeded / \_idempotent
- newsletter.service.confirm_succeeded / \_invalid_token
- newsletter.service.unsubscribe_succeeded
- newsletter.service.webhook_handled / \_ignored
- newsletter.service.resync_enqueued
- newsletter.service.remove_succeeded
- newsletter.provider.stub.upsert_succeeded
- newsletter.provider.mailchimp.upsert_succeeded / \_failed
- newsletter.provider.klaviyo.upsert_succeeded / \_failed

NewsletterRepository methods:

- `create(data, tx?)`
- `findById(id)`
- `findByEmail(email)`
- `findByConfirmationToken(token)`
- `update(id, patch, tx?)` — generic patch updater
- `confirmByToken(token, tx?)` — atomic single-query update that returns the
  affected row or null (uses `UPDATE … WHERE confirmationToken=$1 AND
status='PENDING' RETURNING *` — Prisma's `updateMany` + a separate `findFirst`
  works but mention the race; for SAFETY use `prisma.$queryRaw<NewsletterSubscriber>`
  ONLY if a single-statement guarantee is needed; otherwise wrap a SELECT FOR
  UPDATE + UPDATE in a transaction — pick one in the plan and justify).
- `markUnsubscribed(email, tx?)`
- `listForAdmin(filters, pagination)`
- `remove(id, tx?)`

All methods accept an optional `tx?: Prisma.TransactionClient` per the chat
module's `const client = tx ?? this.prisma` pattern.

---

QUEUE INTEGRATION:

Add a second BullMQ queue for newsletter provider sync. Mirror the EmailQueue
pattern exactly.

apps/api/src/queues/newsletter/newsletter-job.types.ts — NEW:

    export const NEWSLETTER_QUEUE = 'newsletter';

    export interface UpsertSubscriberJob {
      subscriberId: string;
      requestId?: string;
    }

    export interface UnsubscribeJob {
      email: string;
      requestId?: string;
    }

apps/api/src/queues/newsletter/newsletter-queue.service.ts — NEW typed producer
identical in shape to EmailQueue (constructor injects @InjectQueue(NEWSLETTER_QUEUE)

- ClsService; methods `enqueueUpsert` + `enqueueUnsubscribe`).

apps/api/src/queues/newsletter/newsletter.processor.ts — @Processor('newsletter'):

- 'upsert-subscriber' job: load subscriber by id, call provider.upsertSubscriber,
  on success → update row with providerSubscriberId + syncState=SYNCED +
  lastSyncAt + clear lastSyncError; on failure → update lastSyncError + leave
  syncState=PENDING_SYNC (BullMQ retries 3x with exponential backoff). On final
  attempt failure → set syncState=FAILED.
- 'unsubscribe' job: call provider.unsubscribe(email). Idempotent — log + swallow
  404-equivalent responses.

Register NEWSLETTER_QUEUE in queues.module.ts alongside EMAILS_QUEUE. Update
QueuesModule's imports to include NewsletterModule via forwardRef IF the processor
needs to call provider methods AND the provider is exported by NewsletterModule.
CLEANER alternative: move the provider binding into a small shared
`NewsletterProviderModule` that both NewsletterModule and the processor import.
PICK ONE in the plan and justify (no circular deps).

---

CONFIG (apps/api/src/config/configuration.ts — extend ConfigSchema):

    NEWSLETTER_PROVIDER:        z.enum(['mailchimp','klaviyo','stub']).default('stub'),
    NEWSLETTER_DOUBLE_OPT_IN:   z.coerce.boolean().default(true),
    MAILCHIMP_API_KEY:          z.string().default(''),
    MAILCHIMP_AUDIENCE_ID:      z.string().default(''),
    MAILCHIMP_WEBHOOK_SECRET:   z.string().default(''),
    KLAVIYO_API_KEY:            z.string().default(''),
    KLAVIYO_LIST_ID:            z.string().default(''),
    KLAVIYO_WEBHOOK_SECRET:     z.string().default(''),
    PUBLIC_WEB_URL:             z.string().url().default('http://localhost:3000'),

(`PUBLIC_WEB_URL` is shared infra — if the chat module / future modules also
need the storefront URL, the addition lives in configuration.ts. Verify the
key doesn't already exist before adding.)

Update `.env.example` with all seven keys + comments matching the existing
RESEND_API_KEY / STRIPE_SECRET_KEY style.

---

DTOs:

SubscribeDto:
@ApiProperty({ example: 'jane@example.com' })
@IsEmail() @Transform(({ value }) => String(value).trim().toLowerCase()) email: string;
@ApiPropertyOptional({ enum: ['FOOTER','CHECKOUT','POPUP','ADMIN','UNKNOWN'] })
@IsOptional() @IsIn(['FOOTER','CHECKOUT','POPUP','ADMIN','UNKNOWN']) source?: NewsletterSource;
@ApiPropertyOptional({ example: 'en' })
@IsOptional() @IsString() @MaxLength(8) locale?: string;
@ApiPropertyOptional({ type: [String], example: ['vip','launch-2026'] })
@IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true })
@MaxLength(40, { each: true }) tags?: string[];

ConfirmQueryDto:
@ApiProperty() @IsString() @Length(64, 64) @Matches(/^[a-f0-9]+$/) token: string;

UnsubscribeDto:
@ApiProperty() @IsEmail() @Transform(...) email: string;
@ApiPropertyOptional() @IsOptional() @IsString() @Length(64, 64) token?: string;

FindNewsletterQueryDto (admin list — extend FindDiscountsQueryDto shape):
@ApiPropertyOptional({ enum: NewsletterStatus values }) status?: NewsletterStatus;
@ApiPropertyOptional({ enum: NewsletterSyncState values }) syncState?: NewsletterSyncState;
@ApiPropertyOptional({ enum: ['mailchimp','klaviyo','stub'] }) provider?: string;
@ApiPropertyOptional() search?: string;

- page / limit.

SubscribeResponseDto:
{ status: 'PENDING' | 'CONFIRMED' | 'ACCEPTED', message: string }
(Single, anti-enumeration response shape — caller can't distinguish
new-PENDING vs already-PENDING; 'ACCEPTED' is used when status is bounced
by rate-limit to avoid leaking.)

ConfirmResponseDto:
{ status: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'INVALID_TOKEN' }

NewsletterSubscriberResponseDto / NewsletterSubscriberListItemResponseDto —
mirror DiscountResponseDto shape with @ApiProperty on every field. STRIP
`confirmationToken` in the static `from(entity)` mapper — non-negotiable.

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/newsletter.factory.ts:

- createMockSubscriber(overrides) — defaults: PENDING, source=FOOTER,
  syncState=PENDING_SYNC, locale='en', tags=[].

Provider tests (mirror payments/providers/stripe.provider.spec.ts +
stub.provider.spec.ts):

- stub.provider.spec.ts:
  - upsertSubscriber returns md5(email) as providerSubscriberId
  - unsubscribe is a no-op
  - verifyWebhook returns null always
- mailchimp.provider.spec.ts:
  - upsertSubscriber: PUTs to the right URL with Basic auth derived from the key
    suffix datacenter, on 200 returns { providerSubscriberId, alreadyExisted }
  - upsertSubscriber: on 4xx surfaces a structured error with the response body
  - verifyWebhook: constant-time secret check against query string param
  - verifyWebhook: form-encoded `type=unsubscribe&data[email]=…` maps to our
    VerifiedNewsletterWebhook shape
- klaviyo.provider.spec.ts:
  - upsertSubscriber: POSTs profile-subscription-bulk-create-jobs with the
    Klaviyo-API-Key header and revision header
  - verifyWebhook: HMAC-SHA256 mismatch returns null, match returns mapped event

newsletter.service.spec.ts (every branch):

- subscribe(new email) — inserts PENDING row, enqueues upsert job, sends
  confirmation email
- subscribe(existing PENDING) — does NOT re-insert; returns ACCEPTED; resends
  email only when lastSyncAt > 60s old (assert both branches)
- subscribe(existing CONFIRMED) — returns CONFIRMED, no email, no enqueue
- subscribe(existing UNSUBSCRIBED) — flips to PENDING, regenerates token,
  re-enqueues
- subscribe — emails / tags are normalized (assert lowercase + trim)
- confirm(valid PENDING token) — flips to CONFIRMED, clears token, returns CONFIRMED
- confirm(already CONFIRMED) — returns ALREADY_CONFIRMED
- confirm(missing/unknown token) — returns INVALID_TOKEN (NEVER throws)
- unsubscribe(email + token) — flips to UNSUBSCRIBED, enqueues provider unsub
- unsubscribe(email only) — sends confirmation-style email, no status change
- handleWebhook('unsubscribe') — flips matching row, idempotent on second call
- handleWebhook('confirmed') — flips PENDING → CONFIRMED only
- handleWebhook(unknown email) — logs and returns void without throwing
- forceResync — throws Conflict when row.provider !== bound provider
- forceResync — enqueues job + sets syncState=PENDING_SYNC on match
- remove — calls repo.remove + best-effort provider.unsubscribe (assert no
  throw when provider call rejects)
- NEWSLETTER_DOUBLE_OPT_IN=false branch — subscribe sets status=CONFIRMED
  directly + skips confirmation email

newsletter.controller.spec.ts:

- POST /subscribe — 200 with anti-enumeration payload regardless of underlying
  status (assert ConfirmationTokens are NEVER in the response)
- GET /confirm — 200 with each of the three result statuses
- POST /unsubscribe — 200 with token, 200 without (token-issued path)
- POST /webhooks/mailchimp — verified signature → service.handleWebhook called;
  unverified → 200 but service NOT called
- POST /webhooks/klaviyo — same coverage
- GET /newsletter (non-admin) — 403
- GET /newsletter (admin) — returns paginated list, response objects do NOT
  contain confirmationToken
- DELETE /newsletter/:id (admin) — calls service.remove
- POST /newsletter/:id/resync (admin) — calls service.forceResync
- POST /newsletter/:id/unsubscribe (admin) — calls service with token=null path

newsletter.processor.spec.ts:

- upsert-subscriber success — provider returns id, repo.update receives correct
  patch (providerSubscriberId, syncState=SYNCED, lastSyncAt set)
- upsert-subscriber failure — sets lastSyncError, leaves syncState=PENDING_SYNC
- upsert-subscriber final attempt failure — sets syncState=FAILED (mock
  BullMQ job.attemptsMade === job.opts.attempts)
- unsubscribe — calls provider.unsubscribe, swallows 404-equivalent errors

newsletter.module.spec.ts (one tiny test — mirror payments.module's provider
selection test):

- NEWSLETTER_PROVIDER=mailchimp + MAILCHIMP_API_KEY set → MailchimpProvider bound
- NEWSLETTER_PROVIDER=klaviyo + KLAVIYO_API_KEY set → KlaviyoProvider bound
- NEWSLETTER_PROVIDER=stub OR missing key → StubNewsletterProvider bound

Register NewsletterModule in apps/api/src/app.module.ts (alphabetical: between
Discounts and Orders — verify current ordering since the alphabetical insertion
depends on chat being already wired between Categories and Discounts).

---

VALIDATE after implementation:

docker compose up -d postgres redis
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate -- --name add-newsletter-subscribers
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api lint
pnpm --filter @repo/api test
pnpm --filter @repo/api dev

# End-to-end smoke — anonymous subscribe + confirm

curl -s -X POST http://localhost:3001/newsletter/subscribe \
 -H 'Content-Type: application/json' \
 -d '{"email":"jane@example.com","source":"FOOTER","locale":"en"}'

# Expect: { status: 'PENDING', message: '...' }

# Inspect dev-stub-mode confirmation email in Winston logs — extract the token

# from the logged HTML (mail.service.send_skipped event when RESEND_API_KEY="").

curl -s "http://localhost:3001/newsletter/confirm?token=<token>"

# Expect: { status: 'CONFIRMED' }

# Re-subscribe is idempotent

curl -s -X POST http://localhost:3001/newsletter/subscribe \
 -H 'Content-Type: application/json' \
 -d '{"email":"jane@example.com"}'

# Expect: { status: 'CONFIRMED' } (no resend, no new token)

# Admin login + list

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

curl -s -X GET 'http://localhost:3001/newsletter?status=CONFIRMED' \
 -H "Authorization: Bearer $TOKEN"

# Expect: PaginatedResponse with the row above; confirmationToken MUST be absent.

# Admin force-resync

curl -s -X POST http://localhost:3001/newsletter/<id>/resync \
 -H "Authorization: Bearer $TOKEN"

# Expect: { syncState: 'PENDING_SYNC' } and a queued job visible in BullMQ.

# Webhook smoke (stub mode — verifyWebhook returns null → handler 200/no-op)

curl -s -X POST http://localhost:3001/newsletter/webhooks/mailchimp \
 -H 'Content-Type: application/x-www-form-urlencoded' \
 -d 'type=unsubscribe&data[email]=jane@example.com'

# Expect: 200, no row mutation in stub mode.

open http://localhost:3001/docs # Newsletter section shows all 8 endpoints
