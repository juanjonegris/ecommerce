# Feature: uploads-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Admin-facing object-storage flow for **product images** backed by MinIO in dev
and any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2) in prod.
Two ingestion paths: **presigned PUT** (browser uploads direct to bucket; the
API only signs + confirms) and **server-proxied multipart** (API streams the
buffer through itself for tooling that can't PUT cross-origin). Persists
storage metadata (key, MIME, size, dimensions, status) on the existing
`ProductImage` model. Delete-row cascades to delete-object. A repeatable
BullMQ cron sweeps abandoned PENDING_UPLOAD rows hourly. Provider swap via
env vars — no caller changes — mirroring the `payments` and `newsletter`
provider-port pattern.

## User Story

As an ADMIN or STAFF user
I want to upload product images to the platform's storage backend
So that the storefront can render real product photography without the
backend becoming a bandwidth bottleneck on large files.

## Problem Statement

PRD §4 and setup-guide §12.8 require a working product-image upload pipeline.
The current `ProductImage` model has only `id`, `productId`, `url`, `order`
— no link to storage, no MIME, no size, no upload state. There is no
storage adapter wired in `app.module.ts`, no `@aws-sdk/client-s3` dependency,
and no controller surface for uploads despite MinIO being live in
`docker-compose.yml` since setup-guide §7.1. White-label forks must be able
to swap MinIO → AWS S3 → R2 by editing `.env` only.

## Solution Statement

Mirror the canonical 9-file `products` module plus the provider-port pattern
from `payments` and `newsletter`. Add a `StorageProviderAdapter` interface
with `S3Provider` (AWS SDK v3, works against MinIO + AWS + R2 via
`forcePathStyle` + `S3_PUBLIC_URL`) and `StubStorageProvider` (zero-network
fallback when `S3_ACCESS_KEY` is empty). Extend `ProductImage` with
`storageKey`, `mimeType`, `sizeBytes`, optional `width/height`, a
`ProductImageStatus` enum (`PENDING_UPLOAD | READY`), and timestamps. Six
admin-only endpoints under `/uploads/product-images`. Repeatable cleanup
cron uses BullMQ inside the module (newsletter precedent — no circular
import). Public response DTO strips `storageKey`.

---

## ARCHITECTURAL DECISIONS

- **D1 — Two ingestion paths, one adapter.** Presign for large files, proxy
  for small files / non-CORS clients. Both share the same
  `StorageProviderAdapter`. The server **never** trusts a user-supplied
  filename or key; the API always generates
  `product-images/<productId>/<cuid()>.<ext>` where `ext` comes from the
  validated MIME (jpeg→jpg, png→png, webp→webp, avif→avif).
- **D2 — `ProductImageStatus` enum.** Presign creates the row IMMEDIATELY
  with `status: PENDING_UPLOAD` so admins can see in-flight uploads.
  `confirm` HEADs the object → flips `READY`. Cleanup cron sweeps rows
  older than 1h.
- **D3 — `confirm` is a HEAD probe, not a checksum.** S3/MinIO don't expose
  body bytes back to us cheaply; we trust the presigner's
  `Content-Length`-signed header to bound the upload, then re-verify size
  via `HeadObjectCommand`. Mismatch (`HEAD.size > row.sizeBytes`) throws
  BadRequest — defense in depth.
- **D4 — Bucket auto-create on module bootstrap.** `OnModuleInit` calls
  `provider.ensureBucket()`. S3Provider runs HeadBucket → on 404,
  CreateBucket. Stub no-ops. Skipped when `NODE_ENV=test`.
- **D5 — Cleanup queue inside the module.** Register `BullModule.registerQueue('uploads')`
  inside `UploadsModule`, not `QueuesModule` — same as newsletter. Avoids
  the circular `QueuesModule → UploadsModule (provider) → QueuesModule`
  pull. `QueuesModule.forRootAsync` already registers the BullMQ
  connection token globally.
- **D6 — `storageKey` is internal-only.** It lives on the entity but the
  outbound `ProductImageResponseDto.from()` mapper strips it. Admins see
  `url`; only the service uses `storageKey` for delete/HEAD calls.
- **D7 — One SDK for every backend.** `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner`. MinIO needs `forcePathStyle: true`;
  AWS/R2 default. `S3_PUBLIC_URL` lets a fork point reads at a CDN
  (CloudFront, R2 custom domain) without touching the writer client config.
- **D8 — Stub fallback + extracted `selectStorageProvider` factory.** Empty
  `S3_ACCESS_KEY` binds `StubStorageProvider`. Factory function is exported
  from `uploads.module.ts` so the module spec can exercise selection logic
  directly (newsletter precedent).

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/api/src/modules/products/` — canonical 9-file structure. Mirror
  naming + layer separation + Winston event style.
- `apps/api/src/modules/newsletter/` — most recent reference. Specifically:
  `newsletter.module.ts:34-91` (exported `selectNewsletterProvider` +
  `BullModule.registerQueue` inside a domain module — copy verbatim);
  `newsletter.processor.ts` (final-attempt detection via
  `job.attemptsMade + 1 >= (job.opts.attempts ?? 1)`);
  `newsletter.queue.service.ts` (`@InjectQueue` + ClsService requestId
  stamp); `newsletter.module.spec.ts` (factory-function spec shape).
- `apps/api/src/modules/payments/` — provider abstraction. Read
  `providers/payment-provider.interface.ts` (port + DI token shape),
  `providers/stripe.provider.ts` + `providers/stub.provider.ts` (class
  skeleton — Inject Logger/Cls/Config via constructor),
  `payments.module.ts:22-46` (the inline `useFactory` shape we replace
  with a named factory).
- `apps/api/src/modules/discounts/` — admin CRUD reference (query DTO + pagination shape).
- `apps/api/src/main.ts:26` — `rawBody: true` already set; multipart uses `FileInterceptor` from `@nestjs/platform-express` (multer transitive).
- `apps/api/src/app.module.ts:10-21` — alphabetical module ordering;
  `UploadsModule` inserts AFTER `ProductsModule`.
- `apps/api/src/queues/queues.module.ts` — BullMQ connection registered globally; we just need `imports: [QueuesModule]`.
- `apps/api/prisma/migrations/20260613000000_add_newsletter_subscribers/migration.sql` — hand-written SQL format. Mirror.
- `apps/api/prisma/schema.prisma:93-102` — existing `ProductImage` model.
- `packages/types/src/product.types.ts:3-15` — existing `ProductImage`
  interface + `ProductImageSchema` to extend.

### New Files to Create

Under `apps/api/src/modules/uploads/`: `uploads.module.ts`,
`uploads.controller.ts` + spec, `uploads.service.ts` + spec,
`uploads.repository.ts`, `uploads.processor.ts` + spec,
`uploads.queue.service.ts`, `uploads.module.spec.ts`,
`uploads-job.types.ts`; in `dto/`: `presign-upload.dto.ts`,
`presign-upload-response.dto.ts`, `upload-direct-metadata.dto.ts`,
`find-product-images-query.dto.ts`, `reorder-images.dto.ts` (contains
`ReorderItemDto` class), `product-image-response.dto.ts`; in
`entities/`: `product-image.entity.ts`; in `providers/`:
`storage-provider.interface.ts`, `s3.provider.ts` + spec,
`stub.provider.ts` + spec.

Plus: `apps/api/prisma/migrations/20260613100000_add_product_image_storage_metadata/migration.sql`
and `apps/api/test/factories/product-image.factory.ts`.

### Files to MODIFY

`apps/api/prisma/schema.prisma` (extend `ProductImage` + new enum);
`packages/types/src/product.types.ts` (extend interface + Zod schema +
new enum); `apps/api/src/config/configuration.ts` (9 new keys);
`apps/api/src/app.module.ts` (import after `ProductsModule`);
`.env.example` (S3/UPLOAD keys + "Empty = dev stub mode" comment);
`apps/api/package.json` (add `@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner`, dev `@types/multer`).

### Patterns to Follow

- Naming kebab-case files / PascalCase classes / camelCase methods
  (CLAUDE.md §4); layer separation Controller → Service → Repository
  with NO Prisma in services (CLAUDE.md §3); DTOs implement
  `Pick<ProductImage, …>` from `@repo/types` + class-validator +
  `@ApiProperty` (CLAUDE.md §7); structured Winston JSON with `requestId`
  from CLS (CLAUDE.md §5), events `uploads.{component}.{verb}_{state}`;
  exceptions: `NotFoundException` / `BadRequestException` /
  `ForbiddenException` (RolesGuard) / `ConflictException`; optional-tx
  pattern in repositories — `const client = tx ?? this.prisma`.

---

## IMPLEMENTATION PLAN

1. **Foundation** — schema + migration; `@repo/types` extension; config +
   env; install AWS SDK + `@types/multer`.
2. **Provider port** — interface + `stub.provider.ts` + `s3.provider.ts`
   with specs; extracted `selectStorageProvider` factory.
3. **Domain layer** — repository, queue producer, processor, service +
   specs.
4. **Controller + module wiring** — 6 endpoints, `OnModuleInit`
   bucket-ensure + cron schedule, controller spec, module spec.
5. **Integration + validation** — register in `app.module.ts`; smoke
   against running stack (stub mode works offline); lint/typecheck/test
   green.

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom.

### Task 1 — UPDATE `apps/api/prisma/schema.prisma`

- **IMPLEMENT**: Add `enum ProductImageStatus { PENDING_UPLOAD READY }`.
  Extend `ProductImage` with `storageKey String @unique`, `mimeType
String @db.VarChar(64)`, `sizeBytes Int`, `width Int?`, `height Int?`,
  `status ProductImageStatus @default(PENDING_UPLOAD)`, `createdAt
DateTime @default(now())`, `updatedAt DateTime @updatedAt`. Add
  `@@index([status])`. Keep `productId`/`url`/`order`/relation/existing
  index.
- **PATTERN**: `schema.prisma:93-102` (current) + `:257-299` (Newsletter
  as enum-extension reference).
- **GOTCHA**: `storageKey` is `String @unique` (no `@db.VarChar`).

### Task 2 — CREATE migration `20260613100000_add_product_image_storage_metadata/migration.sql`

- **IMPLEMENT**: Hand-rolled SQL in order: (1) `CREATE TYPE
"ProductImageStatus" AS ENUM ('PENDING_UPLOAD','READY');` (2) ALTER TABLE
  ADD COLUMNs for storageKey/mimeType/sizeBytes/width/height nullable, plus
  status (NOT NULL default 'PENDING_UPLOAD'), createdAt + updatedAt
  TIMESTAMPs default CURRENT_TIMESTAMP. (3) Backfill: `UPDATE
"ProductImage" SET "storageKey" = 'legacy/' || "id", "mimeType" =
'image/jpeg', "sizeBytes" = 0, "status" = 'READY';` (4) ALTER COLUMN …
  SET NOT NULL for storageKey/mimeType/sizeBytes. (5) Unique index on
  storageKey, plain index on status.
- **PATTERN**: `apps/api/prisma/migrations/20260613000000_add_newsletter_subscribers/migration.sql`.
- **GOTCHA**: NULL-safe backfill BEFORE the NOT NULL pass. Legacy keys
  are placeholders so existing seeded rows survive.
- **VALIDATE**: `pnpm --filter @repo/api prisma:generate` succeeds.

### Task 3 — UPDATE `packages/types/src/product.types.ts`

- **IMPLEMENT**: Add union + Zod enum:

```ts
export type ProductImageStatus = 'PENDING_UPLOAD' | 'READY';
export const ProductImageStatusSchema = z.enum(['PENDING_UPLOAD', 'READY']);
```

Extend the existing `ProductImage` interface (keep `id`, `productId`,
`url`, `order`) with `storageKey: string; mimeType: string; sizeBytes:
number; width: number | null; height: number | null; status:
ProductImageStatus; createdAt: Date; updatedAt: Date`. Extend
`ProductImageSchema` to match and end with
`satisfies z.ZodType<ProductImage>`.

- **PATTERN**: `packages/types/src/newsletter.types.ts:40-56` for the
  `satisfies` shape.
- **GOTCHA**: `packages/types/src/index.ts` already re-exports
  `product.types` — do NOT add a duplicate line. DO NOT add
  `class-validator` decorators here.
- **VALIDATE**: `pnpm --filter @repo/types typecheck` green.

### Task 4 — UPDATE `apps/api/src/config/configuration.ts`

- **IMPLEMENT**: Append 9 keys to `ConfigSchema` (the four `S3_*` keys
  exist in `.env.example` but NOT in `configuration.ts` yet — add them
  here too): `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/
  `S3_PUBLIC_URL` as `z.string().default('')` (S3_ENDPOINT default
  `http://localhost:9000`), `S3_REGION` default `us-east-1`,
  `S3_FORCE_PATH_STYLE` `z.coerce.boolean().default(true)`,
  `UPLOAD_MAX_BYTES` `z.coerce.number().default(5_242_880)`,
  `UPLOAD_ALLOWED_MIMES` `z.string().default('image/jpeg,image/png,image/webp,image/avif').transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))`.
- **PATTERN**: `configuration.ts` Newsletter block (lines 27-37).
- **VALIDATE**: `pnpm --filter @repo/api typecheck` green.

### Task 5 — UPDATE `.env.example`

- **IMPLEMENT**: Add a "# Object storage…" block above the existing
  `S3_ENDPOINT` line (line 44). New keys: `S3_REGION=us-east-1`,
  `S3_PUBLIC_URL=`, `S3_FORCE_PATH_STYLE=true`, `UPLOAD_MAX_BYTES=5242880`,
  `UPLOAD_ALLOWED_MIMES=image/jpeg,image/png,image/webp,image/avif`. Header
  comment: "Object storage (S3 / MinIO). Empty access key → stub provider
  (no network)." Keep the existing four S3 keys untouched.
- **GOTCHA**: ordering matters for diff hygiene — group the new lines
  with the existing S3 block.

### Task 6 — INSTALL dependencies

- **IMPLEMENT**: From repo root:
  `pnpm --filter @repo/api add @aws-sdk/client-s3@^3 @aws-sdk/s3-request-presigner@^3`
  then `pnpm --filter @repo/api add -D @types/multer`.
- **GOTCHA**: Both AWS SDK packages MUST be on the same major (v3); pin
  the same version. `multer` ships transitively via
  `@nestjs/platform-express` — do NOT install it explicitly.
- **VALIDATE**: `pnpm --filter @repo/api list --depth=0 | grep aws-sdk`
  shows both packages.

### Task 7 — CREATE `apps/api/src/modules/uploads/providers/storage-provider.interface.ts`

- **IMPLEMENT**: Export interfaces `PresignUploadInput`,
  `PresignUploadResult`, `PutObjectInput`, `PutObjectResult`,
  `HeadObjectResult`, `StorageProviderAdapter` (with `name: 's3' | 'stub'`,
  `ensureBucket()`, `presignUpload(input)`, `putObject(input)`,
  `headObject(key)`, `delete(key)`, `publicUrlFor(key): string`) and
  `STORAGE_PROVIDER = 'STORAGE_PROVIDER'` token.
- **PATTERN**: `apps/api/src/modules/payments/providers/payment-provider.interface.ts`
  - `apps/api/src/modules/newsletter/providers/newsletter-provider.interface.ts`.
- **GOTCHA**: `publicUrlFor` is sync — used at presign time before the
  row is written. `headObject` returns `HeadObjectResult | null` (null =
  not present); never throws on missing.

### Task 8 — CREATE `apps/api/src/modules/uploads/providers/stub.provider.ts`

- **IMPLEMENT**: `@Injectable() StubStorageProvider implements
StorageProviderAdapter`, `name = 'stub' as const`. Constructor injects
  `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger, ClsService cls`.
  `ensureBucket` logs + returns. `presignUpload` returns localhost-prefixed
  `uploadUrl === publicUrl`, `requiredHeaders` with Content-Type +
  Content-Length(String(maxBytes)), `expiresAt = new Date(Date.now() +
(input.expiresIn ?? 300) * 1000)`. `putObject` logs `bytes` and returns
  `{ publicUrl }`. `headObject` returns fake `{ sizeBytes: 1, mimeType:
'image/jpeg' }`. `delete` no-ops. `publicUrlFor(key)` returns
  `http://localhost:3001/uploads-stub/${encodeURIComponent(key)}`.
- **PATTERN**: payments + newsletter `stub.provider.ts`.
- **GOTCHA**: `void rawBody; void headers;` on unused params (newsletter
  precedent — ESLint config doesn't honor `_` prefix).

### Task 9 — CREATE `apps/api/src/modules/uploads/providers/s3.provider.ts`

- **IMPLEMENT**: `@Injectable() S3Provider implements StorageProviderAdapter`,
  `name = 's3' as const`. Constructor reads ConfigService keys
  (`S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_REGION`/
  `S3_PUBLIC_URL`/`S3_FORCE_PATH_STYLE`); throws if `S3_BUCKET` empty;
  builds `new S3Client({ endpoint, region, credentials: { accessKeyId,
secretAccessKey }, forcePathStyle })`. Methods:
  - `ensureBucket`: HeadBucketCommand → on `.name === 'NotFound'` OR
    `$metadata.httpStatusCode === 404`, CreateBucketCommand + log
    `uploads.provider.s3.bucket_ensured`.
  - `presignUpload`: `getSignedUrl(client, new PutObjectCommand({ Bucket,
Key, ContentType, ContentLength: maxBytes }), { expiresIn: input.expiresIn
?? 300, signableHeaders: new Set(['content-type','content-length']) })`.
    Returns `{ uploadUrl, requiredHeaders: { 'Content-Type', 'Content-Length':
String(maxBytes) }, publicUrl: publicUrlFor(key), expiresAt }`.
  - `putObject`: PutObjectCommand with `Body, ContentType, ContentLength:
body.length`. Returns `{ publicUrl }`.
  - `headObject`: returns null on `NoSuchKey`/404; else `{ sizeBytes:
ContentLength ?? 0, mimeType: ContentType ?? null }`.
  - `delete`: swallows `NoSuchKey`/404; logs `_succeeded`/`_failed`.
  - `publicUrlFor(key)`: `S3_PUBLIC_URL` override (`${override}/<key>`) or
    `${S3_ENDPOINT}/${S3_BUCKET}/${encodeURIComponent(key)}`.
- **IMPORTS**: `S3Client, HeadBucketCommand, CreateBucketCommand,
PutObjectCommand, HeadObjectCommand, DeleteObjectCommand` from
  `@aws-sdk/client-s3`; `getSignedUrl` from `@aws-sdk/s3-request-presigner`.
- **GOTCHA**: AWS errors carry `.name` (`'NotFound'`/`'NoSuchKey'`) AND
  `$metadata.httpStatusCode`. Guard via
  `(err as { name?: string; $metadata?: { httpStatusCode?: number } })`.

### Task 10 — CREATE `apps/api/src/modules/uploads/uploads-job.types.ts`

- **IMPLEMENT**: Export `UPLOADS_QUEUE = 'uploads' as const`,
  `interface UploadsJobBase { requestId?: string }`,
  `interface CleanupStaleUploadsJob extends UploadsJobBase { /* no payload */ }`,
  `type UploadsJobData = CleanupStaleUploadsJob`.
- **PATTERN**: `apps/api/src/modules/newsletter/newsletter-job.types.ts`.

### Task 11 — CREATE `apps/api/src/modules/uploads/uploads.queue.service.ts`

- **IMPLEMENT**: `@Injectable()` `UploadsQueue` with
  `constructor(@InjectQueue(UPLOADS_QUEUE) queue: Queue, cls: ClsService)`.
  Method `scheduleCleanupRepeatable()` — adds a job with name
  `'cleanup-stale-uploads'`, repeat option `{ pattern: '0 * * * *' }`,
  jobId `'cleanup-stale-uploads-cron'` (BullMQ dedupes by jobId for
  repeatable jobs). Method `triggerCleanupOnce()` for tests.
- **PATTERN**: `apps/api/src/modules/newsletter/newsletter.queue.service.ts`.

### Task 12 — CREATE `apps/api/src/modules/uploads/entities/product-image.entity.ts`

- **IMPLEMENT**: `class ProductImageEntity implements ProductImage` (from
  `@repo/types`). All 12 fields as public properties. Match the
  interface exactly.
- **PATTERN**: `apps/api/src/modules/products/entities/product.entity.ts`.

### Task 13 — CREATE `apps/api/src/modules/uploads/uploads.repository.ts`

- **IMPLEMENT**: `@Injectable() UploadsRepository`. Methods (each accepts
  `tx?: Prisma.TransactionClient`): `create(data)` (defaults
  `status: PENDING_UPLOAD, order: 0`); `findById(id)` /
  `findByStorageKey(key)`; `update(id, patch)` (patch optional `status`/
  `url`/`width`/`height`/`order`/`sizeBytes`/`mimeType`);
  `listByProductForAdmin(filters, pagination)` returning
  `PaginatedResponse<ProductImageEntity>` via `$transaction([findMany,
count])`, sort `[{ order: 'asc' }, { createdAt: 'asc' }]`;
  `listStalePendingUploads(olderThan)` (`findMany` PENDING_UPLOAD +
  `createdAt: { lt: olderThan }`, `take: 500`);
  `bulkUpdateOrder(items, tx)` (one `updateMany` per item inside tx;
  caller MUST pass tx); `remove(id)` (hard delete); `toEntity(row)`
  (map nullable width/height via `?? null`).
- **PATTERN**: `products.repository.ts` for `toEntity` + tx pattern;
  `newsletter.repository.ts` for `$transaction([findMany, count])`.

### Task 14 — CREATE `apps/api/src/modules/uploads/uploads.processor.ts`

- **IMPLEMENT**: `@Processor(UPLOADS_QUEUE)` extends `WorkerHost`.
  Constructor injects `UploadsService`, `logger`. `process(job)`:
  branch on `job.name === 'cleanup-stale-uploads'` →
  `await service.cleanupStaleUploads()`. Final-attempt detection +
  `_failed_terminal` log on throw.
- **PATTERN**: `apps/api/src/modules/newsletter/newsletter.processor.ts`.

### Task 15 — CREATE `apps/api/src/modules/uploads/uploads.service.ts`

- **IMPLEMENT**: `@Injectable() UploadsService`. Constructor injects
  `UploadsRepository`, `PrismaService` (for `$transaction`),
  `@Inject(STORAGE_PROVIDER) provider`, `ProductsRepository`,
  `ConfigService`, `@Inject(WINSTON_MODULE_NEST_PROVIDER) logger`,
  `ClsService cls`. Private helpers: `allowedMimes()` reads
  `UPLOAD_ALLOWED_MIMES`; `maxBytes()` reads `UPLOAD_MAX_BYTES`;
  `extFromMime(m)` maps jpeg→jpg/png→png/webp→webp/avif→avif (BadRequest
  on miss); `buildStorageKey(productId, ext)` returns
  `product-images/${productId}/${randomUUID()}.${ext}` — use Node's
  `crypto.randomUUID()` (zero new dep).
- Public methods:
  - `presign(dto)`: validate MIME ∈ allowedMimes; sizeBytes ≤ maxBytes;
    `productsRepository.findById(dto.productId)` → NotFound on miss
    (allow soft-deleted products — check existence, not isActive);
    generate key; call `provider.presignUpload`; INSERT row in
    `$transaction` with `status: PENDING_UPLOAD, url:
provider.publicUrlFor(key)`, metadata. Returns `{ imageId, uploadUrl,
requiredHeaders, publicUrl, expiresAt, mode: provider.name }`. Log
    `uploads.service.presign_started/_succeeded/_rejected_mime/_rejected_size`.
  - `confirm(imageId)`: load row; if READY → return entity (idempotent);
    else HEAD; null → BadRequest('upload not found in storage') + log
    `_missing_object`; `head.sizeBytes > row.sizeBytes` → BadRequest;
    else UPDATE `status: READY` in `$transaction`. Return entity.
  - `uploadDirect(file, metadata)`: MIME + file.size validation; key
    generation; `provider.putObject(buffer)`; INSERT row READY directly.
  - `findById(id)`: NotFound on miss.
  - `listForAdmin(filters, pagination)`: pass-through to repository.
  - `remove(id)`: load entity; `$transaction(repository.remove)`; THEN
    try/catch `provider.delete(row.storageKey)` (log `_provider_failed`,
    don't rethrow).
  - `reorder({ productId, items })`: SELECT rows by ids; assert each
    `row.productId === payload.productId` (BadRequest); run
    `$transaction((tx) => repository.bulkUpdateOrder(items, tx))`;
    return updated list ordered.
  - `cleanupStaleUploads()`: list stale (>1h old PENDING_UPLOAD);
    for each: HEAD non-null → UPDATE READY; HEAD null →
    `$transaction(repository.remove)` + best-effort `provider.delete`.
    Log `uploads.service.cleanup_swept { confirmed, removed }`.
- **PATTERN**: `products.service.ts` for logging style + `cls.getId()`;
  `newsletter.service.ts` for `$transaction` + provider delegation.
- **GOTCHA**: NEVER pass user input into `storageKey`. The DTO `fileName`
  is logged for audit but discarded — the key is `productId + uuid +
mime-derived-extension` only.

### Task 16 — CREATE DTOs

All DTOs in `apps/api/src/modules/uploads/dto/`. Mirror newsletter DTOs
for decorator style. Each:

- **`presign-upload.dto.ts`**: `productId` (`@IsString`), `fileName`
  (`@IsString @MaxLength(200)`), `mimeType` (`@IsString
@Matches(/^image\/(jpeg|png|webp|avif)$/)`), `sizeBytes` (`@IsInt @Min(1)
@Max(26_214_400)` — hard 25 MB ceiling; service re-checks against env
  `UPLOAD_MAX_BYTES`), optional `width`/`height` (`@IsInt @Min(1) @Max(10000)`).
- **`upload-direct-metadata.dto.ts`**: same shape MINUS `sizeBytes`.
- **`find-product-images-query.dto.ts`**: optional `productId`, `status`
  (`@IsIn(['PENDING_UPLOAD','READY'])`), `page` (≥1, `@Type(() => Number)`),
  `limit` (1-100).
- **`reorder-images.dto.ts`**: TWO classes in one file —
  `ReorderItemDto { id, order }` and `ReorderImagesDto { productId,
items: ReorderItemDto[] (@ValidateNested({ each: true }) @Type(() =>
ReorderItemDto) @ArrayMinSize(1) @ArrayMaxSize(50)) }`.
- **`presign-upload-response.dto.ts`**: `imageId, uploadUrl,
requiredHeaders: Record<string,string>, publicUrl, expiresAt: string,
mode: 's3'|'stub'`. For `requiredHeaders` Swagger:
  `@ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })`.
- **`product-image-response.dto.ts`**: entity shape MINUS `storageKey`.
  Static `from(entity)` mapper strips `storageKey`. `@ApiProperty` on
  each field.

### Task 17 — CREATE `apps/api/src/modules/uploads/uploads.controller.ts`

- **IMPLEMENT**: `@ApiTags('uploads') @Controller('uploads/product-images')`.
  EVERY endpoint: `@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF) @ApiBearerAuth()`. Endpoints:
  1. `POST /presign` (body: `PresignUploadDto`) → `PresignUploadResponseDto`.
  2. `POST /:id/confirm` → `ProductImageResponseDto.from(service.confirm(id))`.
  3. `POST /` (multipart) — wrap with `@UseInterceptors(FileInterceptor(
'file', { limits: { fileSize: 26_214_400 }, fileFilter: <MIME allowlist
→ cb(null,true) or cb(new BadRequestException('mime'),false)> }))`.
     `@ApiConsumes('multipart/form-data')` + manual `@ApiBody({ schema:
{ type: 'object', properties: { file: { type: 'string', format:
'binary' }, metadata: { type: 'string' } } } })`. Signature:
     `@UploadedFile() file, @Body('metadata') metadataRaw: string`.
     Try/catch `JSON.parse(metadataRaw)` (BadRequest on fail), then
     `plainToInstance(UploadDirectMetadataDto, parsed)` +
     `validateOrReject` (manual because multipart fields aren't
     auto-pipelined). Return mapped DTO.
  4. `GET /` (query: `FindProductImagesQueryDto`) →
     `PaginatedResponse<ProductImageResponseDto>`.
  5. `GET /:id` → `ProductImageResponseDto`.
  6. `DELETE /:id` → `@HttpCode(HttpStatus.NO_CONTENT)` → void.
  7. `POST /reorder` (body: `ReorderImagesDto`) → `ProductImageResponseDto[]`.
- **IMPORTS**: `FileInterceptor` from `@nestjs/platform-express`; the
  `@types/multer` install adds the `Express.Multer.File` global type.
- **GOTCHA**: `@UploadedFile()` is `undefined` if the field is missing
  → guard with `if (!file) throw new BadRequestException('file required')`.
  `@UseInterceptors` MUST sit AFTER `@UseGuards` so the guard runs
  before multer parses the body.

### Task 18 — CREATE `apps/api/src/modules/uploads/uploads.module.ts`

- **IMPLEMENT**: Export `selectStorageProvider(config, logger, cls):
StorageProviderAdapter` — returns `new S3Provider(...)` when
  `S3_ACCESS_KEY && S3_SECRET_KEY && S3_BUCKET` all non-empty, else logs
  `uploads.module.stub_selected` and returns
  `new StubStorageProvider(logger, cls)`. Then `@Module` with:
  - **imports**: `PrismaModule, ConfigModule, ProductsModule,
QueuesModule, BullModule.registerQueue({ name: UPLOADS_QUEUE,
defaultJobOptions: { attempts: 3, backoff: { type: 'exponential',
delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 } })`.
  - **controllers**: `[UploadsController]`.
  - **providers**: `UploadsService, UploadsRepository, UploadsQueue,
UploadsProcessor, { provide: STORAGE_PROVIDER, inject: [ConfigService,
WINSTON_MODULE_NEST_PROVIDER, ClsService], useFactory: selectStorageProvider }`.
  - **exports**: `[UploadsService]`.
  - Class `UploadsModule implements OnModuleInit`. Constructor:
    ```ts
    constructor(
      private readonly moduleRef: ModuleRef,
      private readonly queue: UploadsQueue,
      private readonly config: ConfigService,
    ) {}
    async onModuleInit(): Promise<void> {
      if (this.config.get<AppConfig['NODE_ENV']>('NODE_ENV') === 'test') return;
      const provider = this.moduleRef.get<StorageProviderAdapter>(STORAGE_PROVIDER, { strict: false });
      await provider.ensureBucket();
      await this.queue.scheduleCleanupRepeatable();
    }
    }
    ```

  ```

  ```

- **PATTERN**: `apps/api/src/modules/newsletter/newsletter.module.ts`.
- **GOTCHA**: `ProductsModule` must export `ProductsRepository` for our
  service to inject it — verify before this task. If it doesn't, add
  `exports: [ProductsService, ProductsRepository]` to ProductsModule
  in a minimal edit (call this out in the implementation report).

### Task 19 — UPDATE `apps/api/src/app.module.ts`

- **IMPLEMENT**: Add
  `import { UploadsModule } from '@/modules/uploads/uploads.module';`
  alphabetically (between `ProductsModule` and `PrismaModule`). Add
  `UploadsModule` to the `imports: [...]` array in the same alphabetical
  slot (after `ProductsModule`).
- **VALIDATE**: `pnpm --filter @repo/api typecheck` green.

### Task 20 — CREATE `apps/api/test/factories/product-image.factory.ts`

- **IMPLEMENT**: `let counter = 0; export function createMockProductImage(
overrides: Partial<ProductImage> = {}): ProductImage` returning
  `{ id: 'pi-'+String(counter), productId: 'p-1', url:
'http://localhost:9000/test-bucket/product-images/p-1/'+String(counter)+'.jpg',
order: 0, storageKey: 'product-images/p-1/'+String(counter)+'.jpg',
mimeType: 'image/jpeg', sizeBytes: 200_000, width: null, height: null,
status: 'READY', createdAt: new Date('2026-01-01'),
updatedAt: new Date('2026-01-01'), ...overrides }`.
- **PATTERN**: `apps/api/test/factories/product.factory.ts` and the
  newsletter factory; use `String(counter)` to dodge
  `@typescript-eslint/restrict-template-expressions`.

### Task 21 — CREATE 7 spec files (co-located `.spec.ts`)

Mirror `newsletter.service.spec.ts` for mock shapes
(`jest.Mocked<Pick<X, '…'>>`). Per-file case list:

- **`providers/stub.provider.spec.ts`** (3): ensureBucket logs; presign
  returns localhost-prefixed urls + required headers; headObject returns
  fake success; delete no-ops.
- **`providers/s3.provider.spec.ts`** (8): mock the AWS SDK
  (`jest.mock('@aws-sdk/client-s3', …)` returning `S3Client` with `send:
jest.fn()`; `jest.mock('@aws-sdk/s3-request-presigner', () => ({
getSignedUrl: jest.fn() }))`). Cover: ensureBucket creates on 404,
  no-ops on 200; presignUpload assembles uploadUrl + headers; putObject
  passes body length; headObject null on NoSuchKey; delete swallows 404;
  publicUrlFor honors `S3_PUBLIC_URL` override AND falls back to
  endpoint/bucket.
- **`uploads.service.spec.ts`** (16): presign happy + 3 reject branches
  (NotFound product, bad MIME, oversize); 3 ext-derivation sub-assertions
  (jpg/png/webp); confirm idempotent on READY; confirm flips READY on
  HEAD ok; confirm BadRequest on missing object; confirm BadRequest on
  size mismatch; uploadDirect happy + bad-MIME reject; remove tolerates
  provider failure; reorder validates same-product + $transactions
  updates; listForAdmin pass-through; cleanupStaleUploads partitions
  `{ confirmed, removed }`.
- **`uploads.controller.spec.ts`** (7): presign shape; multipart →
  service.uploadDirect with parsed metadata; multipart rejects malformed
  metadata JSON; GET list excludes `storageKey`; DELETE → 204; reorder
  → service.reorder; non-admin → 403.
- **`uploads.processor.spec.ts`** (3): process → service.cleanupStaleUploads;
  final-attempt failure logs `_failed_terminal`; unknown job name throws.
- **`uploads.module.spec.ts`** (4): `selectStorageProvider` returns S3
  when all 3 keys set; Stub when any missing (3 sub-cases); asserts
  `uploads.module.stub_selected` log on stub fallback.
- **VALIDATE**: `pnpm --filter @repo/api test` green; coverage ≥ 80%.

---

## TESTING STRATEGY

**Unit (Backend):** services with mocked repository + mocked provider
(`{ provide: STORAGE_PROVIDER, useValue: mockProvider as
StorageProviderAdapter }`); entity defaults from the factory; AWS SDK
mocked at module level (no CI network); multer files as
`{ buffer: Buffer.from('xx'), mimetype: 'image/jpeg', size: 2,
originalname: 'x.jpg' } as Express.Multer.File`. Repository tests not
required (covered indirectly + 80% threshold).

**E2E (Frontend):** out of scope here — admin UI is setup-guide §12.10.

**Edge cases:** re-confirm READY is idempotent; two presigns for the
same `(productId, fileName)` yield distinct keys (uuid randomness);
reorder with cross-product item → BadRequest, no partial write;
empty-PENDING_UPLOAD cleanup logs `{ confirmed: 0, removed: 0 }`; with
`S3_PUBLIC_URL` set, stored `url` uses override not endpoint; stub mode
returns 200 on all endpoints; non-404 errors from `headObject` bubble
up as 500 (global filter formats); `ProductImage.product` is
`onDelete: Cascade` — DB handles product deletion; our `remove` only
covers explicit single-image deletion.

---

## VALIDATION COMMANDS

Execute in order. Stop and fix on any Level 1 or 2 failure.

### Level 1 — Lint (REQUIRED hard gate)

```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/types lint
```

### Level 2 — Type Check (REQUIRED hard gate)

```bash
pnpm --filter @repo/types typecheck
pnpm --filter @repo/api typecheck
pnpm --filter @repo/web typecheck    # ProductImage shape changes — confirm no break
```

### Level 3 — Unit Tests

```bash
pnpm --filter @repo/api test
```

Coverage check (must remain ≥ 80% across branches/functions/lines/statements):

```bash
pnpm --filter @repo/api test:cov
```

### Level 4 — Manual smoke (after Docker is up)

```bash
docker compose up -d postgres redis minio
pnpm --filter @repo/api prisma:generate
pnpm --filter @repo/api prisma:migrate -- --name add-product-image-storage-metadata
pnpm --filter @repo/api dev
```

Smoke commands listed in
`.claude/references/uploads-module-prompt.md` (presign → PUT → confirm →
list → reorder → delete). Stub-mode smoke: unset `S3_ACCESS_KEY` in `.env`
and restart — every endpoint should still 200.

### Level 5 — Visual

`open http://localhost:3001/docs` — verify `uploads` tag shows 6 endpoints
with bearer-auth requirements; `open http://localhost:9001` — verify
bucket auto-created on boot.

---

## ACCEPTANCE CRITERIA

- [ ] `ProductImage` model extended; new migration applies cleanly on a
      seeded DB with legacy rows backfilled to `status: READY` + dummy
      `storageKey`.
- [ ] `selectStorageProvider` binds `S3Provider` when all three S3 keys
      set, else `StubStorageProvider` (verified in module spec).
- [ ] All 6 admin endpoints reachable; non-admin → 403; `storageKey`
      never appears in any response payload.
- [ ] Presign / confirm flow against MinIO produces a row with
      `status: READY` and a working public `url`.
- [ ] Server-proxied multipart endpoint accepts an image, writes it to
      storage, returns a READY row.
- [ ] Reorder rejects cross-product items as 400; same-product items
      update inside one `$transaction`.
- [ ] DELETE removes both the row and the object; provider failure logs
      `_provider_failed` but does NOT 500.
- [ ] Cleanup repeatable job is scheduled on boot (`scheduleCleanupRepeatable`).
- [ ] `pnpm --filter @repo/api lint` / `typecheck` / `test` green with
      coverage ≥ 80%.

---

## NOTES

- **SDK pinning:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  at the SAME `^3.x` major (presigner imports types from the client).
- **Out of scope:** `sharp` (storefront uses `next/image`); CDN signed
  GET URLs (defer until private-bucket fork).
- **No `tenantId`** — fork-per-client (PRD §5.3; MEMORY.md
  `whitelabel_strategy`).
- **AWS error shape:** guard via `.name === 'NotFound'`/`'NoSuchKey'`
  AND `$metadata.httpStatusCode === 404`.
- **DTO 25 MB ceiling > env 5 MB default:** the DTO is a defensive
  static cap; `UPLOAD_MAX_BYTES` is the operational tunable.
- **Risk:** `ProductsModule` may not export `ProductsRepository` today
  — verify before Task 18 and add to its `exports` if needed (single
  line; call it out in the execution report).
- **Risk:** multipart Swagger "try it out" is awkward — document the
  `curl -F` invocation; the endpoint itself works.

**Confidence Score**: 8.5/10. Main uncertainty: multipart `metadata`
JSON-field parsing — mitigation: explicit `JSON.parse + plainToInstance

- validateOrReject` in the controller.
