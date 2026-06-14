# CLAUDE.md — Global Rules

White-label e-commerce platform. Turborepo monorepo with Next.js 15 (storefront + admin) and NestJS (REST API). Solo developer + AI agents. See `PRD.md` for full scope, `mvp-tool-designs.md` for architecture details.

---

## 1. Core Principles

- **TypeScript everywhere.** No `.js` files in source. `strict: true` always. Every function has an explicit return type.
- **Convention over configuration.** Every NestJS module follows the same 9-file structure. The `products` module is the canonical reference — copy its pattern for new modules.
- **Server Components by default.** Only add `"use client"` when you need browser APIs, event handlers, or hooks.
- **No raw SQL.** All queries go through Prisma via repository files. If raw SQL is unavoidable, add a comment explaining why.
- **No `any`.** If truly unavoidable, add `// TODO: fix type` comment.
- **No proprietary services.** Every dependency must be open source or have a meaningful free tier.
- **Validate at boundaries.** `class-validator` DTOs on every NestJS controller input. Zod for frontend forms.
- **Log every operation.** Structured JSON logging with contextual fields (requestId, module, operation).
- **Test what matters.** 80% coverage threshold. Every service has unit tests. Critical flows have E2E tests.

---

## 2. Tech Stack

### Backend (`apps/api`)

| Tool                | Version / Notes                                            |
| ------------------- | ---------------------------------------------------------- |
| NestJS              | v10+ — modular architecture, DI, decorators, guards        |
| Prisma              | v5+ — extends `PrismaClient`, `@Global()` module           |
| PostgreSQL          | 16 — primary database                                      |
| Redis               | 7 — cache, sessions, pub/sub, BullMQ backing store         |
| BullMQ              | `@nestjs/bullmq` — background jobs (emails, notifications) |
| Passport.js         | JWT strategy + NestJS Guards for RBAC                      |
| Winston             | `nest-winston` — structured JSON logging                   |
| Swagger             | `@nestjs/swagger` — auto-generated from decorators         |
| class-validator     | DTO validation on all controller inputs                    |
| Socket.io           | NestJS WebSocket gateway — real-time chat                  |
| MinIO               | S3-compatible object storage in Docker Compose             |
| Resend              | Email provider behind `MailService` interface              |
| Stripe              | Payment provider behind `PaymentProvider` interface        |
| Jest                | Unit + integration tests, co-located `.spec.ts` files      |
| `@nestjs/helmet`    | HTTP security headers                                      |
| `@nestjs/throttler` | Rate limiting on public endpoints                          |

### Frontend (`apps/web`)

| Tool           | Version / Notes                                           |
| -------------- | --------------------------------------------------------- |
| Next.js        | 15 — App Router only, no Pages Router                     |
| React          | 19                                                        |
| shadcn/ui      | Install via `npx shadcn@latest add`, never copy manually  |
| Tailwind CSS   | v4 — utility classes only, no custom CSS files            |
| next-intl      | i18n — locale segment in URL (`/es/...`, `/en/...`)       |
| TanStack Query | Server state — API data caching + SSR hydration           |
| Zustand        | Client state — cart (persisted to localStorage), UI state |
| Zod            | Frontend form validation + shared schemas                 |
| Playwright     | E2E tests — Page Object Model, `data-testid` selectors    |

### Shared (`packages/`)

| Package          | Purpose                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/types`    | Pure TypeScript interfaces + Zod schemas. **No decorators.** **Built package** — emits CJS + `.d.ts` to `dist/`; consumers resolve via `package.json` `exports`. |
| `@repo/tsconfig` | Base, Next.js, and NestJS tsconfig presets                                                                                                                       |
| `@repo/config`   | ESLint + Prettier shared configs                                                                                                                                 |

### Infrastructure

pnpm (workspaces) | Turborepo | Docker + Docker Compose | GitHub Actions (CI/CD) | GlitchTip (error tracking) | OpenTelemetry → Grafana Cloud (monitoring)

---

## 3. Architecture

### Monorepo Layout

```
ecommerce/
├── apps/
│   ├── web/                    # Next.js 15 (storefront + admin)
│   │   └── src/app/[locale]/   # All routes under locale segment
│   └── api/                    # NestJS REST API
│       └── src/modules/        # One module per domain
├── packages/
│   ├── types/                  # Shared interfaces (import as @repo/types)
│   ├── tsconfig/               # base.json, nextjs.json, nestjs.json
│   └── config/                 # ESLint + Prettier
├── CLAUDE.md
├── turbo.json
└── docker-compose.yml
```

### NestJS Module Structure (every module follows this)

```
src/modules/<domain>/
├── <domain>.module.ts            # Module declaration
├── <domain>.controller.ts        # HTTP routing only
├── <domain>.service.ts           # Business logic only
├── <domain>.repository.ts        # All Prisma queries
├── dto/
│   ├── create-<domain>.dto.ts    # class-validator + @ApiProperty
│   ├── update-<domain>.dto.ts
│   └── <domain>-response.dto.ts
├── entities/
│   └── <domain>.entity.ts
├── <domain>.controller.spec.ts
└── <domain>.service.spec.ts
```

**Layer rules — never violate:**

| Layer      | Does                                                | Never does                          |
| ---------- | --------------------------------------------------- | ----------------------------------- |
| Controller | Route, parse request, apply guards, return response | Business logic, Prisma queries      |
| Service    | Business logic, orchestrate, throw exceptions       | HTTP concerns, direct Prisma access |
| Repository | Prisma queries, map to domain entities              | Business logic, HTTP concerns       |

### Workspace Package Build Flow

`packages/types` ships **compiled CJS** in `dist/`, not raw `.ts` source. This is required because Node 22's built-in TypeScript loader applies strict ESM-style resolution at runtime (extensionless relative imports like `export * from './cart.types'` throw `ERR_MODULE_NOT_FOUND`), which breaks `nest start` against the api's compiled `dist/main.js`.

| Concern              | Behaviour                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` runtime   | Compiled `dist/main.js` does `require('@repo/types')` → resolved via `package.json` `exports` → loads `packages/types/dist/index.js` (CJS)                                                   |
| `apps/api` typecheck | Uses `paths` override in `apps/api/tsconfig.json` to resolve `@repo/types` directly to `packages/types/src/index.ts` — types are live, no rebuild needed for source changes during typecheck |
| `apps/web` (Next.js) | Resolves via `package.json` `exports` → bundles `dist/index.js`                                                                                                                              |
| Tests (`ts-jest`)    | `moduleNameMapper` in `apps/api/package.json` maps `@repo/types` to raw source for unit tests                                                                                                |

**Turborepo handles the build automatically.** `turbo.json` declares `^build` as a `dependsOn` for `build`, `dev`, `lint`, and `check-types`, so any turbo-mediated task topologically builds upstream packages first. Use `pnpm dev` (root) or `pnpm dev --filter @repo/api` — both route through turbo. Direct pnpm filter calls like `pnpm --filter @repo/api dev` **bypass turbo** and will fail with `ERR_MODULE_NOT_FOUND` on a fresh clone. If a direct call is needed, run `pnpm build` from the root once first.

**Adding a new shared package** (e.g. `@repo/utils`): mirror `packages/types/package.json` — `main` → `./dist/index.js`, `types` → `./dist/index.d.ts`, `exports` block, `build` script (`tsc`), `files: ["dist"]`. Mirror `packages/types/tsconfig.json` — CommonJS module, Node resolution, `outDir: "./dist"`, `declaration: true`. Turbo picks up the new `build` task automatically.

### Next.js Routing

```
apps/web/src/app/
├── [locale]/                   # next-intl locale segment
│   ├── layout.tsx              # Brand CSS vars, providers
│   ├── products/page.tsx       # PLP — Server Component
│   ├── products/[slug]/page.tsx # PDP — Server Component
│   ├── cart/page.tsx           # Client Component
│   ├── checkout/page.tsx
│   ├── account/
│   ├── (info)/                 # Route group: about, faq, contact, policies
│   └── admin/                  # Protected admin dashboard
└── api/webhooks/stripe/route.ts # Only Route Handler — for Stripe webhooks
```

### Data Flow: Frontend → Backend

| Scenario                               | Pattern                                          |
| -------------------------------------- | ------------------------------------------------ |
| Read data in Server Component          | `fetch(API_URL/...)` with `next: { revalidate }` |
| UI mutation (add to cart, submit form) | Server Action calls NestJS API                   |
| External webhook (Stripe)              | Route Handler at `app/api/webhooks/`             |
| Client-side data (after hydration)     | TanStack Query `useQuery` / `useMutation`        |

---

## 4. Code Style

### Naming Conventions

**Backend (NestJS):**

```typescript
// Files: kebab-case
// products.controller.ts, create-product.dto.ts

// Classes: PascalCase
export class ProductsService {}
export class CreateProductDto {}

// Methods: camelCase, verb-first
async findAll(): Promise<Product[]> {}
async findBySlug(slug: string): Promise<Product> {}
async create(dto: CreateProductDto): Promise<Product> {}
async update(id: string, dto: UpdateProductDto): Promise<Product> {}
async remove(id: string): Promise<void> {}

// Interfaces: PascalCase, no "I" prefix
interface PaymentProvider {}  // not IPaymentProvider

// Enums: PascalCase members
enum OrderStatus { PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED }

// Constants: UPPER_SNAKE_CASE
const MAX_PRODUCTS_PER_PAGE = 50;
```

**Frontend (Next.js):**

```typescript
// Components: PascalCase files and exports
// ProductCard.tsx, CartSummary.tsx

// Hooks: camelCase, use- prefix
// useCartStore.ts, useProducts.ts

// Utilities: camelCase
// formatPrice.ts, buildQueryString.ts

// Types: PascalCase, suffix with Props for component props
interface ProductCardProps {
  product: Product;
}
```

### Import Order

```typescript
// 1. Node built-ins
import { randomUUID } from 'crypto';
// 2. External packages
import { Injectable, NotFoundException } from '@nestjs/common';
// 3. Monorepo packages
import type { Product } from '@repo/types';
// 4. Internal absolute imports
import { PrismaService } from '@/prisma/prisma.service';
// 5. Relative imports
import { CreateProductDto } from './dto/create-product.dto';
```

Always use `import type` for type-only imports.

---

## 5. Logging

Use `nest-winston` for structured JSON logging with dot-namespaced event names. Every log entry includes `requestId` and relevant contextual fields.

Inject via `@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService`.

### Event Naming Convention

**Format:** `{domain}.{component}.{verb}_{state}`

| Segment     | Definition                              | Examples                                                  |
| ----------- | --------------------------------------- | --------------------------------------------------------- |
| `domain`    | Business domain or infrastructure layer | `api`, `http`, `product`, `order`                         |
| `component` | NestJS class responsible (snake_case)   | `bootstrap`, `service`, `interceptor`, `exception_filter` |
| `verb`      | Action performed                        | `start`, `create`, `update`, `remove`, `request`, `catch` |
| `state`     | Lifecycle phase                         | `started`, `succeeded`, `failed`                          |

**Example:**

```typescript
// Log at operation boundaries with contextual fields
async create(dto: CreateOrderDto): Promise<Order> {
  const requestId = this.cls.getId();

  this.logger.log({
    message: 'order.service.create_started',
    requestId,
    customerId: dto.customerId
  });

  const order = await this.repository.create(dto);

  this.logger.log({
    message: 'order.service.create_succeeded',
    requestId,
    orderId: order.id
  });
  return order;
}

// Errors: include error message + stack
this.logger.error(
  {
    message: 'http.exception_filter.catch_failed',
    requestId,
    error: err.message
  },
  err.stack
);
```

**Rules:** Always include `requestId`. Log entity ID on success. Never log passwords, tokens, or card numbers.

---

## 6. Testing

### Backend — Jest (unit + integration)

**Run:** `pnpm --filter api test`

Tests are co-located: `products.service.spec.ts` next to `products.service.ts`.

```typescript
// products.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { createMockProduct } from '../../../test/factories/product.factory';

const mockRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: ProductsRepository, useValue: mockRepo }],
    }).compile();
    service = module.get(ProductsService);
    jest.clearAllMocks();
  });

  it('returns product when found', async () => {
    const product = createMockProduct({ id: 'p1' });
    mockRepo.findById.mockResolvedValue(product);

    expect(await service.findById('p1')).toEqual(product);
  });

  it('throws NotFoundException when not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});
```

### Test Factories (`apps/api/test/factories/`)

```typescript
// test/factories/product.factory.ts
import type { Product } from '@repo/types';

let counter = 0;
export function createMockProduct(overrides: Partial<Product> = {}): Product {
  counter++;
  return {
    id: `product-${counter}`,
    name: `Test Product ${counter}`,
    slug: `test-product-${counter}`,
    price: 29.99,
    stock: 100,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}
```

### Frontend — Playwright E2E

**Run:** `pnpm --filter web test:e2e`

Page Object Model in `apps/web/e2e/pages/`, tests in `apps/web/e2e/tests/`.

```typescript
// e2e/pages/product.page.ts
import type { Page, Locator } from '@playwright/test';

export class ProductPage {
  readonly addToCartButton: Locator;
  readonly productName: Locator;

  constructor(private readonly page: Page) {
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
    this.productName = page.getByTestId('product-name');
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/en/products/${slug}`);
  }
}
```

Use `data-testid` attributes on all interactive/observable elements. Never use CSS selectors in tests.

---

## 7. API Contracts

### Shared Types (`@repo/types` → pure interfaces, no decorators)

```typescript
// packages/types/src/product.types.ts
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### NestJS DTOs (implement shared interfaces, add decorators)

```typescript
// apps/api — DTOs implement @repo/types interfaces and add class-validator + @ApiProperty
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, Min, MaxLength } from 'class-validator';
import type { Product } from '@repo/types';

export class CreateProductDto implements Pick<Product, 'name' | 'price' | 'categoryId'> {
  @ApiProperty({ example: 'Wireless Headphones' }) @IsString() @MaxLength(200) name: string;
  @ApiProperty({ example: 79.99, minimum: 0 }) @IsNumber() @Min(0) price: number;
  @ApiProperty({ example: 'cat_electronics' }) @IsString() categoryId: string;
}
```

### Error Responses (NestJS exceptions → consistent JSON shape)

```json
{ "statusCode": 404, "message": "Product with ID xyz not found", "error": "Not Found" }
```

| Situation         | Exception               | Code |
| ----------------- | ----------------------- | ---- |
| Not found         | `NotFoundException`     | 404  |
| Invalid input     | `BadRequestException`   | 400  |
| Not authenticated | `UnauthorizedException` | 401  |
| No permission     | `ForbiddenException`    | 403  |
| Duplicate         | `ConflictException`     | 409  |

---

## 8. Common Patterns

### Pattern 1 — NestJS Service Method

```typescript
@Injectable()
export class ProductsService {
  constructor(
    private readonly repository: ProductsRepository,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
  ) {}

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.repository.findBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Product "${slug}" not found`);
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const existing = await this.repository.findBySlug(slugify(dto.name));
    if (existing) {
      throw new ConflictException(`Product slug already exists`);
    }
    return this.repository.create({ ...dto, slug: slugify(dto.name) });
  }
}
```

### Pattern 2 — Server Component Data Fetching + Server Action Mutation

```typescript
// Server Component — fetch from NestJS directly (NO "use client")
// app/[locale]/products/page.tsx
import type { PaginatedResponse, Product } from '@repo/types';

async function getProducts(page = 1): Promise<PaginatedResponse<Product>> {
  const res = await fetch(`${process.env.API_URL}/products?page=${page}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export default async function ProductsPage() {
  const { data: products } = await getProducts();
  return <ProductGrid products={products} />;
}

// Server Action — thin wrapper for UI mutations
// app/actions/cart.ts
'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function addToCartAction(productId: string, quantity: number): Promise<void> {
  const token = (await cookies()).get('session')?.value;
  const res = await fetch(`${process.env.API_URL}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ productId, quantity }),
  });
  if (!res.ok) throw new Error('Failed to add to cart');
  revalidatePath('/cart');
}
```

---

## 9. Development Commands

**Always route through turbo** so `^build` dependencies (notably `@repo/types`) are resolved automatically. Use `pnpm dev` (root) or `pnpm dev --filter @repo/api`. Direct pnpm filter calls (`pnpm --filter @repo/api dev`) bypass turbo and require a manual `pnpm build` first or they crash with `ERR_MODULE_NOT_FOUND` on `@repo/types`.

**Migrations:** prefer `prisma migrate deploy` for local dev too. The schema declares `searchVector` as `Unsupported("tsvector")?` (a Postgres GENERATED column), and `prisma migrate dev` will re-detect "drift" on every run and emit a broken `ALTER TABLE ... DROP DEFAULT` migration. Use `prisma migrate dev --create-only` then hand-edit if you must.

```bash
# Root — turbo-mediated, dependencies handled automatically
pnpm install                          # Install all dependencies
pnpm dev                              # Start all apps in dev mode (builds @repo/types first)
pnpm dev --filter @repo/api           # Start ONLY the api (still builds @repo/types first)
pnpm dev --filter @repo/web           # Start ONLY the web app
pnpm build                            # Build all apps (topological)
pnpm lint                             # Lint all packages (builds upstream first)
pnpm typecheck                        # Type-check all packages (builds upstream first)
pnpm test                             # Run all Jest tests
pnpm format                           # Prettier format all files

# Backend-only — pnpm direct filter (bypasses turbo, requires prior `pnpm build`)
pnpm --filter @repo/api test          # Run backend tests
pnpm --filter @repo/api test:cov      # Run tests with coverage report
pnpm --filter @repo/api prisma:generate # Regenerate Prisma client
pnpm --filter @repo/api prisma:deploy # Apply pending migrations (use over migrate:dev — see above)
pnpm --filter @repo/api prisma:studio # Open Prisma Studio GUI
pnpm --filter @repo/api db:seed       # Seed database

# Frontend-only — pnpm direct filter
pnpm --filter @repo/web build         # Production build
pnpm --filter @repo/web test:e2e      # Run Playwright E2E tests

# Shared packages — build manually if not going through turbo
pnpm --filter @repo/types build       # Compile types to dist/ (CJS + .d.ts)

# Infrastructure
docker compose up -d                  # Start all services (PG, Redis, MinIO)
docker compose down                   # Stop all services
```

---

## 10. AI Coding Assistant Instructions

1. **Read this file first.** It is the source of truth for all conventions. If something contradicts this file, this file wins.
2. **Copy the `products` module pattern exactly** when creating new NestJS modules. Same file names, same layer separation, same test structure.
3. **Never import `PrismaService` in a service file.** All database access goes through the repository layer.
4. **Use Server Components by default.** Only add `"use client"` when you actually need interactivity. Fetch data in Server Components, not in client hooks, unless the data needs real-time updates.
5. **Run `pnpm lint` and `pnpm typecheck` after making changes.** Fix all errors before considering the task done.
6. **Write tests using test factories.** Use `createMockProduct()` etc. from `test/factories/`. Never hardcode test data inline.
7. **Every DTO field needs both `class-validator` and `@ApiProperty` decorators.** No exceptions — Swagger docs must stay accurate.
8. **Import shared types as `@repo/types`.** Never use relative paths across app boundaries. Never put decorators in `packages/types`.
9. **Check for an existing solution before adding a new package.** Read `package.json` files first. The stack is intentionally complete — most problems are solvable with what is already installed.
10. **When in doubt, look at how the `products` module does it.** It is the living reference for every pattern in this codebase.
11. **Always run dev/lint/typecheck via turbo** (`pnpm dev --filter @repo/api`, not `pnpm --filter @repo/api dev`). Workspace packages like `@repo/types` are _built packages_ — direct pnpm filter calls skip the `^build` dependency and crash with `ERR_MODULE_NOT_FOUND`. If you must use a direct filter call, run `pnpm build` from the root first.
12. **Do not run `prisma migrate dev`** in this repo — the `Product.searchVector` GENERATED column makes Prisma generate a broken `ALTER TABLE ... DROP DEFAULT` migration on every run. Use `prisma migrate deploy` for applying existing migrations, or `prisma migrate dev --create-only` + hand-edit the SQL for new schema work.

---

## 11. CI

Every push and PR to `main` runs `.github/workflows/ci.yml`. Five required status checks: `lint`, `typecheck`, `test`, `e2e`, `build`. The `test` and `e2e` jobs spin up `postgres:16-alpine` + `redis:7-alpine` service containers, apply Prisma migrations via `prisma:deploy` (NEVER `migrate dev` in CI — see §10.12), seed the DB, and run Jest + Playwright.

No real API keys are required for first run — provider modules (Stripe, Resend, Mailchimp, S3) fall back to stub mode when their key env vars are empty (see `apps/api/src/config/configuration.ts`).

**Required GitHub repository secrets:** none for first run.

**Optional secrets** for live-mode provider testing in CI:

| Secret name                                   | Purpose                                                        |
| --------------------------------------------- | -------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                           | Real Stripe test-mode key (otherwise StubPaymentProvider runs) |
| `STRIPE_WEBHOOK_SECRET`                       | Required for live signed webhook verification                  |
| `RESEND_API_KEY`                              | Real email send instead of log-only stub                       |
| `MAILCHIMP_API_KEY` + `MAILCHIMP_AUDIENCE_ID` | Live Mailchimp adapter                                         |
| `KLAVIYO_API_KEY` + `KLAVIYO_LIST_ID`         | Live Klaviyo adapter                                           |

To enable any of the above, add them under `Settings → Secrets and variables → Actions` and reference them in the workflow's `.env` write step via `${{ secrets.<NAME> }}`.

**Branch protection** is configured manually after the workflow lands once. Settings → Branches → Add rule for `main` → require `lint`, `typecheck`, `test`, `e2e`, `build` as required status checks.
