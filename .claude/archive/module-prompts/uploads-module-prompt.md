---
description: /planning prompt for the uploads domain module (Step 12.8 of setup guide — MinIO / S3 client for product images behind a StorageProvider interface).
---

# Uploads Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `uploads` module under apps/api/src/modules/uploads/.

Follow the `products` module structure exactly (controller / service / repository /
dto/ / entities/ / specs) AND the provider-port pattern from the `payments` module
(`providers/<name>.provider.ts` + a `*-provider.interface.ts` with a DI token).
Read every file in apps/api/src/modules/products/ first. Then read
apps/api/src/modules/payments/ — especially `payments.module.ts`,
`providers/payment-provider.interface.ts`, `providers/stripe.provider.ts`, and
`providers/stub.provider.ts` — because the storage provider abstraction must
mirror that shape (interface + DI token + env-driven `useFactory` binding +
stub fallback when no S3 credentials are configured). Then read
apps/api/src/modules/newsletter/ — especially `newsletter.module.ts` (extracted
`selectNewsletterProvider` factory function for spec testability — copy that
exact pattern) and `newsletter.processor.ts` (final-attempt failure-state
flip — analogous logic for cleanup jobs here). Then read
apps/api/src/modules/discounts/ (most recent admin CRUD reference for the
admin list endpoints / pagination / query DTO shape) and
apps/api/src/mail/mail.service.ts (the `external SaaS → fetch → dev stub`
pattern that the StubStorageProvider mirrors).

EXISTING ProductImage Prisma model has only `id`, `productId`, `url`, `order`.
You will EXTEND it with storage metadata + a status enum and add ONE migration
named `add-product-image-storage-metadata`.

ProductImage interface ALREADY exists in packages/types/src/product.types.ts —
extend it in the same place; do NOT create a new types file.

---

DOMAIN — what we are building:

An admin-facing product-image upload flow. The storefront does not upload —
only ADMIN and STAFF users do. Two server-supported flows so the frontend can
pick whichever fits the file size:

1. **Presigned PUT (preferred):** Admin requests a presigned URL from the API,
   then the browser PUTs the binary DIRECTLY to S3/MinIO, bypassing the API's
   bandwidth. Browser then calls a `confirm` endpoint so the API verifies the
   object actually landed (HEAD request) and flips `status` PENDING_UPLOAD → READY.
2. **Server-proxied multipart:** Admin POSTs `multipart/form-data` to the API.
   The API streams the buffer to S3 via the SDK, persists the row in one shot
   (`status` = READY directly), and returns the response. Used as the fallback
   and for tooling that can't PUT cross-origin.

Both flows produce the same end state: a `ProductImage` row with a public
`url`, a `storageKey` we can use for deletion, and image metadata
(`mimeType`, `sizeBytes`, optional `width`/`height` if the caller supplies
them — server does not run image processing).

Deleting a ProductImage row also deletes the object in S3 (best-effort —
provider 404 is swallowed since the row may have been created in
PENDING_UPLOAD and never confirmed).

Reordering images is supported via a bulk reorder endpoint that updates
`order` for a list of `(imageId, order)` pairs in one $transaction.

The bucket is auto-created on module bootstrap if it doesn't exist (S3
provider only — stub provider no-ops). This is the white-label-friendly path:
fork a deployment, point `S3_*` at a fresh MinIO, the first boot creates the
bucket.

EXPLICITLY OUT OF SCOPE for this module:

- Generic file uploads (chat attachments, newsletter campaign assets, user
  avatars). This module is **product images only** per PRD §4 and setup-guide
  §12.8. The storage provider port is reusable, but no other module wires it
  in this PR.
- Image processing / resizing / thumbnail generation. The storefront uses
  `next/image` for on-demand transformations.
- Anti-virus / malware scanning. The bucket is private-write (only admin
  tokens issue presigned PUTs); we trust the admin upload surface.
- CDN integration. `S3_PUBLIC_URL` lets a fork override the public endpoint
  (e.g. CloudFront, Cloudflare R2 custom domain) but we don't sign CloudFront
  URLs here.
- Direct-upload from the storefront — there are no customer-facing endpoints.
- EXIF stripping. Defer until a customer flow exists.
- Multi-bucket routing. One bucket per deployment (white-label fork).

---

SCHEMA (extend EXISTING ProductImage model — ONE migration named
`add-product-image-storage-metadata`):

    enum ProductImageStatus {
      PENDING_UPLOAD   // presign issued; object not yet confirmed in storage
      READY            // confirmed in storage (HEAD ok) OR server-proxied upload landed
    }

    model ProductImage {
      id          String              @id @default(cuid())
      productId   String
      url         String                              // existing — public URL
      order       Int                 @default(0)     // existing
      storageKey  String                              // NEW — S3 object key (e.g. "product-images/<productId>/<cuid>.jpg")
      mimeType    String              @db.VarChar(64) // NEW
      sizeBytes   Int                                 // NEW
      width       Int?                                // NEW — optional, client-supplied
      height      Int?                                // NEW
      status      ProductImageStatus  @default(PENDING_UPLOAD) // NEW
      createdAt   DateTime            @default(now())          // NEW
      updatedAt   DateTime            @updatedAt               // NEW

      product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

      @@index([productId])
      @@index([status])
      @@unique([storageKey])
    }

Application-enforced invariants:

- `storageKey` is unique and is generated server-side as
  `product-images/${productId}/${cuid()}.${ext}` — never user-supplied. The
  extension is derived from the validated MIME type (jpeg→jpg, png→png,
  webp→webp, avif→avif). This prevents path traversal AND prevents one admin
  overwriting another admin's just-uploaded object.
- A presign creates a PENDING_UPLOAD row immediately so admins can see
  in-flight uploads in the list endpoint. If the browser never PUTs the
  object, a periodic cleanup job (CRON, BullMQ repeatable) removes
  PENDING_UPLOAD rows older than 1 hour. Implement the cleanup job IN this
  module — same processor file as the other queue handlers below.
- `confirm` performs a HEAD against the storage key. Missing object → throws
  `BadRequestException('upload not found in storage')` and the row stays
  PENDING_UPLOAD (cleanup picks it up).
- `mimeType` MUST be in the env-configured allowlist (default
  `image/jpeg,image/png,image/webp,image/avif`). Rejected MIMEs return 400
  BEFORE issuing a presigned URL.
- `sizeBytes` MUST be ≤ `UPLOAD_MAX_BYTES` (default 5 MB). Presign embeds a
  `Content-Length` constraint via `s3-request-presigner`'s `signableHeaders`
  so the browser can't lie and PUT a larger file.
- DELETE on a ProductImage row also calls `provider.delete(storageKey)`
  inside a try/catch (log failure, don't 500). Idempotent: provider 404 is
  swallowed.
- Reorder accepts an array `[{ id, order }, …]` and rejects with 400 if any
  id doesn't belong to the same product as the others (anti-cross-product
  mutation).

---

Shared types (packages/types/src/product.types.ts — EXTEND the existing
ProductImage interface; do NOT create a new file):

- export type ProductImageStatus = 'PENDING_UPLOAD' | 'READY';
- export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  order: number;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: ProductImageStatus;
  createdAt: Date;
  updatedAt: Date;
  }
- Update `ProductImageSchema` to mirror the extended interface (use
  `satisfies z.ZodType<ProductImage>` — same pattern as
  newsletter.types.ts and chat.types.ts).
- DO NOT add anything to packages/types/src/index.ts — ProductImage is
  already exported via the existing `product.types` barrel line. (Verify
  the barrel includes `export *` from product.types — it does.)
- DO NOT expose `storageKey` in the public storefront response — the
  storefront only needs `url`. The DTO mapper strips it. (Type still
  includes it because the admin response uses it.)

---

PROVIDER ABSTRACTION (apps/api/src/modules/uploads/providers/):

Define a port that any S3-compatible (or non-S3) object storage can implement.
Mirror payments/providers/ and newsletter/providers/ exactly — same file
naming, same DI token approach.

storage-provider.interface.ts — NEW:

    /** Input for issuing a presigned PUT URL. */
    export interface PresignUploadInput {
      storageKey: string;
      mimeType: string;
      maxBytes: number;
      /** Expiry in seconds (default 300 = 5 minutes). */
      expiresIn?: number;
    }

    export interface PresignUploadResult {
      uploadUrl: string;
      /** Headers the browser MUST include in the PUT (Content-Type, etc.). */
      requiredHeaders: Record<string, string>;
      /** Final public URL the row should store. */
      publicUrl: string;
      expiresAt: Date;
    }

    /** Input for a server-proxied multipart upload. */
    export interface PutObjectInput {
      storageKey: string;
      mimeType: string;
      body: Buffer;
    }

    export interface PutObjectResult {
      publicUrl: string;
    }

    /** Result of a HEAD probe used by `confirm`. */
    export interface HeadObjectResult {
      sizeBytes: number;
      mimeType: string | null;
    }

    export interface StorageProviderAdapter {
      readonly name: 's3' | 'stub';
      /** Idempotent — creates the bucket if missing, otherwise no-op. */
      ensureBucket(): Promise<void>;
      presignUpload(input: PresignUploadInput): Promise<PresignUploadResult>;
      putObject(input: PutObjectInput): Promise<PutObjectResult>;
      headObject(storageKey: string): Promise<HeadObjectResult | null>;
      delete(storageKey: string): Promise<void>;
      /** Helper for building the public URL given a key — used by `confirm`
       * since the row was created before the object existed. */
      publicUrlFor(storageKey: string): string;
    }

    export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

Two implementations:

stub.provider.ts — used when `S3_ACCESS_KEY` is empty. Logs
`uploads.provider.stub.*` events. `ensureBucket` is a no-op.
`presignUpload` returns a non-routable
`uploadUrl = http://localhost:3001/uploads-stub/<key>` plus
`publicUrl = http://localhost:3001/uploads-stub/<key>` — the URL doesn't
actually serve anything; the stub is for unit tests + offline dev where
admins just need API contracts to work. `putObject` writes the buffer
NOWHERE (logs `bytes=<n>` and discards) and returns the same
`http://localhost:3001/uploads-stub/<key>` public URL. `headObject` returns
a fake `{ sizeBytes: 1, mimeType: input.mimeType }` so `confirm` always
succeeds in dev. `delete` is a no-op. Mirrors
apps/api/src/modules/payments/providers/stub.provider.ts.

s3.provider.ts — real implementation backed by `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`. Works against MinIO (path-style addressing,
required for MinIO) AND AWS S3 (virtual-hosted-style, default) — switch via
`S3_FORCE_PATH_STYLE`. Constructor reads:

- `S3_ENDPOINT` (e.g. `http://localhost:9000` for MinIO, or empty for AWS)
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_REGION` (default `us-east-1`)
- `S3_PUBLIC_URL` (optional override for the URL prefix — for CDN forks)
- `S3_FORCE_PATH_STYLE` (default true — MinIO needs it)

`ensureBucket` runs `HeadBucketCommand` → on 404, runs `CreateBucketCommand`

- logs `uploads.provider.s3.bucket_ensured`. Failure logs `_failed` and
  re-throws (bootstrap should fail loudly).

`presignUpload` uses `getSignedUrl(s3Client, new PutObjectCommand({...}),
{ expiresIn: input.expiresIn ?? 300, signableHeaders: new Set([
'content-type', 'content-length']) })`. Returns `uploadUrl` from the
presigner, `requiredHeaders: { 'Content-Type': mimeType,
'Content-Length': String(maxBytes) }`, `publicUrl =
this.publicUrlFor(storageKey)`, and `expiresAt = new Date(Date.now() +
expiresIn * 1000)`.

`putObject` runs `PutObjectCommand` with `Body: buffer, ContentType:
mimeType, ContentLength: buffer.length, ACL: 'public-read'` (MinIO ignores
ACL but AWS uses it). Returns `{ publicUrl: this.publicUrlFor(key) }`.

`headObject` runs `HeadObjectCommand`; on 404 (`name === 'NotFound'`),
returns null. On success, returns `{ sizeBytes: out.ContentLength ?? 0,
mimeType: out.ContentType ?? null }`.

`delete` runs `DeleteObjectCommand`; swallows 404 (`NoSuchKey`); rethrows
otherwise. Logs `uploads.provider.s3.delete_succeeded` or `_failed`.

`publicUrlFor(key)` returns
`${S3_PUBLIC_URL || `${S3_ENDPOINT}/${S3_BUCKET}`}/${encodeURIComponent(key)}`.
Honor the override so a CloudFront / R2 custom domain works without touching
the writer client config.

uploads.module.ts binds STORAGE_PROVIDER via `useFactory` reading
`S3_ACCESS_KEY` from ConfigService — same fallback chain as
PaymentsModule. ALSO runs `provider.ensureBucket()` on
`onModuleInit` (cast the resolved provider via `moduleRef.get` —
DON'T do it in the factory itself; async factories should stay synchronous
in NestJS). EXTRACT the binding decision into a named exported
`selectStorageProvider(config, logger, cls)` factory function so the
module spec can exercise it directly without compiling a TestingModule
(mirror `selectNewsletterProvider` in newsletter.module.ts).

Fallback chain:

- `S3_ACCESS_KEY` AND `S3_SECRET_KEY` AND `S3_BUCKET` all non-empty →
  S3Provider
- otherwise → StubStorageProvider (log `uploads.module.stub_selected`)

BOTH providers expose `name: 's3' | 'stub'` so the service can stamp
`mode` in `presign` response (informational; admin UI shows
"stub mode — uploads are no-ops").

---

REST API ENDPOINTS (controller — `/uploads`):

NO public endpoints. ALL endpoints require JwtAuthGuard + RolesGuard +
@Roles(UserRole.ADMIN, UserRole.STAFF) (mirror the discounts admin
endpoints).

POST /uploads/product-images/presign — Body: { productId, fileName, mimeType,
sizeBytes, width?, height? }. Validates MIME
allowlist + size cap + product existence. Generates
storageKey, INSERTS a ProductImage row with
status=PENDING_UPLOAD + url=provider.publicUrlFor(key)
inside a $transaction. Returns
{ imageId, uploadUrl, requiredHeaders, publicUrl,
expiresAt, mode: 's3'|'stub' }.

POST /uploads/product-images/:id/confirm — No body. Performs HEAD via
`provider.headObject(row.storageKey)`. On
success, UPDATEs status=READY in a
$transaction. On miss, throws
BadRequest('upload not found in storage')
and leaves the row PENDING_UPLOAD.
Idempotent — calling confirm on an
already-READY row returns 200 with the
existing entity (no row mutation).

POST /uploads/product-images — Multipart `multipart/form-data` with field
`file` and a JSON metadata field
`metadata` (parsed via `class-validator`
@IsObject + plainToInstance). Wraps the
presign+put+confirm flow into one server-side
hop. Uses `@UseInterceptors(FileInterceptor('file',
{ limits: { fileSize: <UPLOAD_MAX_BYTES> },
fileFilter: mimeAllowlistFilter }))` from
`@nestjs/platform-express`. Returns the full
READY ProductImageResponseDto.

GET /uploads/product-images?productId= — Admin list (paginated). Filter by
productId, status, page, limit. Sort:
`order ASC, createdAt ASC`.

GET /uploads/product-images/:id — Single fetch. 404 if missing.

DELETE /uploads/product-images/:id — Best-effort cascade: delete the row in
a $transaction, then call
provider.delete(storageKey) in try/catch
(log + continue on failure). Returns 204.

POST /uploads/product-images/reorder — Body: { productId, items: [{ id,
order }, …] }. Validates every id
belongs to the same productId, then
$transaction { updateMany }. Returns
the updated list ordered.

All endpoints: @ApiTags('uploads'), @ApiOperation, @ApiResponse,
@ApiBearerAuth. The multipart endpoint also needs
@ApiConsumes('multipart/form-data') + manually-described body shape
since Swagger auto-detection of FileInterceptor is finicky.

---

SERVICE RULES:

UploadsService methods:

- `presign(adminId, dto)` — validates MIME via env allowlist; validates
  sizeBytes ≤ UPLOAD_MAX_BYTES; validates product exists via
  ProductsRepository.findById (throw NotFound if missing); generates
  storageKey = `product-images/${productId}/${cuid()}.${extFromMime(mime)}`;
  inserts row in $transaction with status=PENDING_UPLOAD; calls
  provider.presignUpload; returns { imageId, uploadUrl, … }. Logs
  `uploads.service.presign_started` + `_succeeded`.

- `confirm(adminId, imageId)` — loads row; if already READY, return entity
  (idempotent). Else HEAD the object; missing → throw
  BadRequest('upload not found in storage'). Verify the returned sizeBytes
  is ≤ the row's stored sizeBytes (anti-overflow — the presign cap can be
  enforced by some providers but not all; we re-check). UPDATE
  status=READY in a $transaction. Return entity.

- `uploadDirect(adminId, file, metadata)` — same MIME/size validation;
  generates key; calls provider.putObject({ body: file.buffer, ... });
  inserts row with status=READY directly; returns entity.

- `findById(id)` — single fetch (NotFound). Used by all admin endpoints.

- `listForAdmin(filters, pagination)` — PaginatedResponse<ProductImage>.
  Filter by productId + status. Sort by `order ASC, createdAt ASC`.

- `remove(id)` — load row; DELETE row in $transaction; call
  provider.delete(storageKey) in try/catch outside the tx (log failure
  via `uploads.service.remove_provider_failed`, don't re-throw — the row
  is gone either way). Idempotent.

- `reorder(productId, items)` — validate every item.id belongs to productId
  (single SELECT … WHERE id IN (…) check). Throw BadRequest on mismatch.
  $transaction with one updateMany-per-row (Prisma doesn't support bulk
  CASE-WHEN updates — accept the per-row chatter for the typical 5–20
  image case).

- `cleanupStaleUploads()` — invoked by the queue processor below. Finds
  ProductImage WHERE status=PENDING_UPLOAD AND createdAt < now() - 1 hour.
  For each: tries `provider.headObject` — if present, flips to READY
  (the browser PUT eventually landed, just never called confirm). If
  absent, deletes the row + best-effort provider.delete. Logs counts.

- NEVER imports PrismaService directly. All queries go through
  UploadsRepository. ProductsRepository is imported via ProductsModule
  for the existence check in `presign` / `uploadDirect`.
- Injects ConfigService to read UPLOAD_MAX_BYTES + UPLOAD_ALLOWED_MIMES.
- Injects @Inject(STORAGE_PROVIDER) for the adapter.
- Injects CLS for `requestId` propagation.

Logging dot-namespaces (mirror newsletter.service.\* style):

- uploads.service.presign_started / \_succeeded / \_rejected_mime / \_rejected_size
- uploads.service.confirm_succeeded / \_missing_object
- uploads.service.upload_direct_succeeded
- uploads.service.remove_succeeded / \_provider_failed
- uploads.service.reorder_succeeded
- uploads.service.cleanup_swept (with counts: { confirmed, removed })
- uploads.provider.stub.\* / uploads.provider.s3.\*
- uploads.module.stub_selected

UploadsRepository methods:

- `create(data, tx?)` — accepts the full PENDING_UPLOAD row shape.
- `findById(id)`
- `findByStorageKey(key)`
- `update(id, patch, tx?)`
- `listByProductForAdmin(filters, pagination)`
- `listStalePendingUploads(olderThan: Date)`
- `remove(id, tx?)`
- `bulkUpdateOrder(items: { id: string; order: number }[], tx?)` — runs
  one updateMany per item inside the supplied tx.

All methods accept an optional `tx?: Prisma.TransactionClient` per the
established `const client = tx ?? this.prisma` pattern.

---

QUEUE INTEGRATION:

Add a third BullMQ queue for cleanup. Mirror the EmailQueue + NewsletterQueue
pattern exactly.

apps/api/src/modules/uploads/uploads.processor.ts — colocated with the
module (NOT in apps/api/src/queues/) per the newsletter precedent. Keeps
the processor inside the module that owns the provider, avoiding a
circular import between QueuesModule and UploadsModule.

Job kinds:

- 'cleanup-stale-uploads' (repeatable — registered via
  `BullModule.registerQueueAsync` with a repeat opt of `{ pattern:
'0 * * * *' }` — every hour, on the hour). Handler calls
  `service.cleanupStaleUploads()`.

The queue is named `UPLOADS_QUEUE = 'uploads'`. Register it inside
UploadsModule via `BullModule.registerQueue({ name: UPLOADS_QUEUE,
defaultJobOptions: { attempts: 3, backoff: { type: 'exponential',
delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 } })`. NOT in
QueuesModule (newsletter precedent).

Processor extends WorkerHost. Final-attempt detection via
`job.attemptsMade + 1 >= (job.opts.attempts ?? 1)` → logs
`uploads.processor.cleanup_failed_terminal` so an oncall can intervene.

Optionally schedule the repeatable cleanup job during `onModuleInit` —
the processor's queue producer adds it idempotently (BullMQ dedupes
repeatable jobs by name + pattern). Skip if NODE_ENV=test.

---

CONFIG (apps/api/src/config/configuration.ts — extend ConfigSchema):

    // Object storage (S3 / MinIO). Empty access key → StubStorageProvider.
    S3_ENDPOINT:            z.string().default('http://localhost:9000'),
    S3_ACCESS_KEY:          z.string().default(''),
    S3_SECRET_KEY:          z.string().default(''),
    S3_BUCKET:              z.string().default(''),
    S3_REGION:              z.string().default('us-east-1'),
    S3_PUBLIC_URL:          z.string().default(''),     // optional CDN override
    S3_FORCE_PATH_STYLE:    z.coerce.boolean().default(true),
    UPLOAD_MAX_BYTES:       z.coerce.number().default(5_242_880),  // 5 MB
    UPLOAD_ALLOWED_MIMES:   z.string()
      .default('image/jpeg,image/png,image/webp,image/avif')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

(Verify each key doesn't already exist before adding. `S3_ENDPOINT`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` are already in `.env.example`
from setup-guide §7.1 — add the rest. UPDATE `.env.example` with the new
keys + a "Empty = dev stub mode" comment matching the
RESEND_API_KEY / STRIPE_SECRET_KEY / NEWSLETTER style.)

---

DEPENDENCIES to install in apps/api:

Runtime:

- `@aws-sdk/client-s3` — official AWS SDK v3 S3 client. Works against MinIO
  with `forcePathStyle: true`.
- `@aws-sdk/s3-request-presigner` — presigned URL generator (separate
  package; both must be at the SAME major version).

Dev:

- `@types/multer` — typings for the multipart `Express.Multer.File` object.
  `multer` itself is transitively shipped via `@nestjs/platform-express`
  (already installed); no runtime install needed.

NO `sharp` (out of scope). NO `minio` SDK (use the AWS SDK — works for both
MinIO and AWS, white-label friendly).

Verify with `pnpm --filter @repo/api list --depth=0` after install.

---

DTOs:

PresignUploadDto:
@ApiProperty({ example: 'cm0xyzabc' })
@IsString() productId: string;
@ApiProperty({ example: 'hero.jpg', maxLength: 200 })
@IsString() @MaxLength(200) fileName: string;
@ApiProperty({ example: 'image/jpeg' })
@IsString() @IsIn(<env-driven allowlist — alternatively @Matches(/^image\/(jpeg|png|webp|avif)$/)>) mimeType: string;
@ApiProperty({ example: 524288, maximum: 5242880 })
@IsInt() @Min(1) @Max(<UPLOAD_MAX_BYTES — class-validator can't read env at compile time, so this is a hard 25MB ceiling + service does the env-aware re-check>) sizeBytes: number;
@ApiPropertyOptional({ example: 1200 })
@IsOptional() @IsInt() @Min(1) @Max(10000) width?: number;
@ApiPropertyOptional({ example: 800 })
@IsOptional() @IsInt() @Min(1) @Max(10000) height?: number;

ConfirmUploadParamDto: { id: string } via @Param('id') — no body.

UploadDirectMetadataDto: same fields as PresignUploadDto MINUS sizeBytes
(known from the buffer). The multipart endpoint receives this as a
JSON-string field; controller parses + validates.

FindProductImagesQueryDto (admin list — extend FindDiscountsQueryDto shape):
@ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
@ApiPropertyOptional({ enum: ProductImageStatus values }) status?: ProductImageStatus;

- page / limit.

ReorderImagesDto:
@ApiProperty() @IsString() productId: string;
@ApiProperty({ type: [ReorderItemDto] }) @ValidateNested({ each: true })
@Type(() => ReorderItemDto) @ArrayMinSize(1) @ArrayMaxSize(50)
items: ReorderItemDto[];

ReorderItemDto:
@ApiProperty() @IsString() id: string;
@ApiProperty() @IsInt() @Min(0) order: number;

PresignUploadResponseDto:
{ imageId, uploadUrl, requiredHeaders: Record<string,string>,
publicUrl, expiresAt: string (ISO), mode: 's3' | 'stub' }

ProductImageResponseDto — outbound shape. Static `from(entity)` mapper
STRIPS `storageKey` from the response — admin sees `url`, not the raw
S3 key. (Type still includes `storageKey` for the service-internal entity
shape, but the response DTO doesn't.)

---

TESTS (co-located .spec.ts):

Create apps/api/test/factories/product-image.factory.ts:

- createMockProductImage(overrides) — defaults: status=READY,
  mimeType='image/jpeg', sizeBytes=200_000, order=0,
  storageKey='product-images/p-1/img-1.jpg',
  url='http://localhost:9000/test-bucket/...'

Provider tests (mirror payments/providers/stripe.provider.spec.ts +
stub.provider.spec.ts):

- stub.provider.spec.ts:
  - ensureBucket is a no-op
  - presignUpload returns localhost-prefixed uploadUrl + publicUrl
  - putObject discards buffer + returns publicUrl
  - headObject always returns a fake size-1 ok
  - delete is a no-op

- s3.provider.spec.ts (mock `@aws-sdk/client-s3` via `jest.mock` —
  S3Client + the command classes are class-based; mock by spying on
  `S3Client.prototype.send`):
  - ensureBucket: HeadBucket 404 triggers CreateBucket
  - ensureBucket: HeadBucket 200 → no CreateBucket call
  - presignUpload: returns uploadUrl from the presigner mock with
    expiresIn=300, requiredHeaders contains Content-Type + Content-Length
  - putObject: builds PutObjectCommand with Body, ContentType,
    ContentLength
  - headObject: returns null on NoSuchKey error
  - headObject: returns sizeBytes + mimeType on success
  - delete: swallows NoSuchKey, rethrows other errors
  - publicUrlFor: honors S3_PUBLIC_URL override; falls back to
    `${endpoint}/${bucket}/<urlencoded key>`

uploads.service.spec.ts (every branch):

- presign(valid) — validates product exists, generates key with correct
  prefix + ext, inserts PENDING_UPLOAD row, calls provider.presignUpload,
  returns { imageId, uploadUrl, … }
- presign — throws NotFound when productId missing
- presign — throws BadRequest on disallowed MIME (e.g. application/pdf)
- presign — throws BadRequest on sizeBytes > UPLOAD_MAX_BYTES
- presign — extension picked from MIME (jpeg→jpg, webp→webp, etc.)
  (assert via the stored storageKey)
- confirm(missing in storage) — HEAD returns null, throws BadRequest,
  row stays PENDING_UPLOAD
- confirm(present in storage) — HEAD ok, flips status=READY
- confirm(already READY) — idempotent, returns row without HEAD call
- confirm(size > expected) — throws BadRequest (anti-overflow)
- uploadDirect(valid) — inserts READY row, calls provider.putObject,
  returns entity
- uploadDirect — same MIME/size rejection branches
- remove — deletes row + calls provider.delete; provider failure logs +
  succeeds (assert no throw)
- reorder(valid) — updates each row's order in $transaction
- reorder(mismatched productId) — throws BadRequest
- listForAdmin — passes through filters + pagination shape
- cleanupStaleUploads — confirmed: HEAD success flips status=READY;
  missing: deletes row + calls provider.delete; assert counts in log

uploads.controller.spec.ts:

- POST /presign (admin) — returns expected shape
- POST /presign (non-admin) — 403
- POST /:id/confirm (admin) — calls service.confirm
- POST / (multipart, admin) — Wires FileInterceptor; assert
  service.uploadDirect called with the buffer
- GET / (admin) — paginated; response shape does NOT include storageKey
- DELETE /:id (admin) — calls service.remove, 204
- POST /reorder (admin) — calls service.reorder

uploads.processor.spec.ts:

- cleanup-stale-uploads — invokes service.cleanupStaleUploads
- final attempt failure logs \_failed_terminal

uploads.module.spec.ts (mirror newsletter.module.spec.ts pattern):

- `selectStorageProvider` factory:
  - S3\*ACCESS_KEY + S3_SECRET_KEY + S3_BUCKET all set → S3Provider
  - any of those missing → StubStorageProvider (assert
    `uploads.module.stub_selected` log)
- onModuleInit calls provider.ensureBucket (use a stubbed provider;
  assert call count)

Register UploadsModule in apps/api/src/app.module.ts (alphabetical:
between Products and the next module — verify current ordering and
insert BEFORE the existing Products entry would otherwise shift; since
"U" sorts after "P", uploads goes near the end of the modules block).

Update ProductImage references in the `products` module — the
ProductImageSchema extension in @repo/types will broaden the interface,
so the ProductResponseDto / repository mapping needs to surface the new
fields when products are read. CHECK: does products.repository.ts include
`images` in its findAll/findBySlug select? If yes, ensure the new fields
flow through (they will, since `images: true` selects everything). If
ProductResponseDto exposes images, add the new fields (status, mimeType,
sizeBytes, width, height — NOT storageKey).

---

VALIDATE after implementation:

docker compose up -d postgres redis minio
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate -- --name add-product-image-storage-metadata
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api lint
pnpm --filter @repo/api test
pnpm --filter @repo/api dev

# Admin login

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.accessToken')

# Pick an existing product

PRODUCT_ID=$(curl -s http://localhost:3001/products | jq -r '.data[0].id')

# Presigned upload flow (real MinIO)

PRESIGN=$(curl -s -X POST http://localhost:3001/uploads/product-images/presign \
 -H "Authorization: Bearer $TOKEN" \
 -H 'Content-Type: application/json' \
 -d "{\"productId\":\"$PRODUCT_ID\",\"fileName\":\"hero.jpg\",\"mimeType\":\"image/jpeg\",\"sizeBytes\":120000}")

UPLOAD_URL=$(echo $PRESIGN | jq -r '.uploadUrl')
IMAGE_ID=$(echo $PRESIGN | jq -r '.imageId')

# PUT a file directly to MinIO

curl -X PUT "$UPLOAD_URL" \
 -H 'Content-Type: image/jpeg' \
 -H 'Content-Length: 120000' \
 --data-binary @./tmp/hero.jpg

# Confirm

curl -s -X POST http://localhost:3001/uploads/product-images/$IMAGE_ID/confirm \
 -H "Authorization: Bearer $TOKEN"

# Expect: { ..., status: 'READY', url: 'http://localhost:9000/<bucket>/<key>' }

# List

curl -s "http://localhost:3001/uploads/product-images?productId=$PRODUCT_ID" \
 -H "Authorization: Bearer $TOKEN"

# Expect: paginated list; response objects do NOT contain storageKey.

# Server-proxied multipart fallback

curl -s -X POST http://localhost:3001/uploads/product-images \
 -H "Authorization: Bearer $TOKEN" \
 -F "file=@./tmp/hero.jpg;type=image/jpeg" \
 -F "metadata={\"productId\":\"$PRODUCT_ID\",\"fileName\":\"hero.jpg\",\"mimeType\":\"image/jpeg\"}"

# Expect: { ..., status: 'READY' }

# Reorder

curl -s -X POST http://localhost:3001/uploads/product-images/reorder \
 -H "Authorization: Bearer $TOKEN" \
 -H 'Content-Type: application/json' \
 -d "{\"productId\":\"$PRODUCT_ID\",\"items\":[{\"id\":\"$IMAGE_ID\",\"order\":1}]}"

# Delete

curl -s -X DELETE http://localhost:3001/uploads/product-images/$IMAGE_ID \
 -H "Authorization: Bearer $TOKEN"

# Verify the object is also gone from MinIO

# (use mc or the MinIO console at http://localhost:9001)

# Stub-mode smoke (unset S3_ACCESS_KEY in .env, restart API)

# Expect: presign returns uploadUrl=http://localhost:3001/uploads-stub/...,

# mode='stub', everything still 200s.

open http://localhost:3001/docs # Uploads section shows all 6 endpoints
open http://localhost:9001 # MinIO console — verify bucket auto-created on boot
