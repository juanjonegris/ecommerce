# MVP Tool Designs & Project Decisions

## White-Label E-Commerce Platform

**Date:** 2026-04-25
**Status:** Pre-scaffold — all decisions finalized, ready to build

---

## 1. Project Goal & Core Strategy

### What We Are Building

A production-grade e-commerce platform designed to **sell products, inform customers, and serve as a point of interaction** between a business and its customers. The platform must be white-label ready so it can be adapted for different clients with minimal effort.

### White-Label Strategy: Fork-Based (Not SaaS Multi-Tenant)

**Decision:** Each client deployment is a separate fork of this repository. There is no SaaS multi-tenancy, no shared database, no `tenant_id` on every table.

**Rationale:**

- No multi-tenancy complexity in the codebase (no Prisma middleware, no request-scoped DI, no subdomain routing, no `tenant_id` enforcement)
- Each client gets their own isolated database and deployment
- New client onboarding = fork repo + update brand config + deploy
- Simpler to reason about, simpler to maintain, simpler for agents to work with

**White-label readiness is achieved through code organization:**

- All brand-specific values centralized in `apps/web/src/config/brand.ts`
- All visual tokens driven by CSS variables in `globals.css` (shadcn/ui default behavior)
- Feature toggles via environment variables
- Logos stored as static assets in a predictable location

**When forking for a new client:**

1. Update `apps/web/src/config/brand.ts` (store name, contact info, locales)
2. Update CSS variables in `globals.css` (colors, fonts, radius)
3. Replace `/public/logo.svg` and `/public/favicon.ico`
4. Set client-specific environment variables
5. Deploy

---

## 2. MVP Capabilities

Three pillars map directly to the user story: _"As an e-commerce user, I want to be able to buy, receive information, and get in touch with the company."_

### Pillar 1 — Sell

| Feature                                                       | Priority | Notes                               |
| ------------------------------------------------------------- | -------- | ----------------------------------- |
| Product listing page (PLP) — filters, sorting, pagination     | MVP      | Core browsing                       |
| Product detail page (PDP) — variants, images, stock indicator | MVP      | Core conversion                     |
| Category / collection navigation                              | MVP      | Hierarchical                        |
| Product search (keyword, PostgreSQL FTS)                      | MVP      | Upgrade to Meilisearch later        |
| Product filtering (category, price range, attributes)         | MVP      |                                     |
| Shopping cart with line item management                       | MVP      | Zustand client state                |
| Guest checkout                                                | MVP      | Blocking this kills conversion      |
| Registered user checkout                                      | MVP      |                                     |
| Shipping address + billing address                            | MVP      |                                     |
| Shipping method selection (flat rate, free threshold)         | MVP      |                                     |
| Order summary with tax                                        | MVP      |                                     |
| Discount / coupon code application                            | MVP      |                                     |
| Stripe payment integration                                    | MVP      | Via provider-agnostic PaymentModule |
| Order confirmation page                                       | MVP      |                                     |
| Order confirmation email                                      | MVP      |                                     |
| Customer account: register, login, profile                    | MVP      |                                     |
| Customer order history + order detail                         | MVP      |                                     |
| Password reset                                                | MVP      |                                     |
| Basic shipping zones + flat-rate rules                        | MVP      |                                     |
| Free shipping threshold                                       | MVP      |                                     |
| Sale prices / strikethrough pricing                           | MVP      |                                     |

**Deferred to V2:** multi-currency, saved payment methods, Apple Pay / Google Pay, gift cards, buy X get Y promotions, price lists / B2B tiers, multi-location inventory, live carrier rates, backorder/pre-order.

### Pillar 2 — Inform

| Feature                                            | Priority | Notes                             |
| -------------------------------------------------- | -------- | --------------------------------- |
| Homepage with hero banner + featured products      | MVP      | Brand entry point                 |
| About us page                                      | MVP      | Trust signal                      |
| FAQ page                                           | MVP      | Reduces support load              |
| Shipping & returns policy page                     | MVP      | Legal / trust                     |
| Privacy policy + Terms of service                  | MVP      | Legal requirement                 |
| Newsletter signup form                             | MVP      | Capture emails from day 1         |
| ESP integration (Mailchimp or Klaviyo)             | MVP      | Sync subscribers                  |
| Internationalization (i18n) via `next-intl`        | MVP      | Add day 1 — painful retroactively |
| SEO: meta tags, JSON-LD structured data, sitemap   | MVP      |                                   |
| Open Graph / social sharing tags                   | MVP      |                                   |
| Core Web Vitals compliant performance              | MVP      | LCP < 2.5s                        |
| SSR for product pages (Next.js App Router default) | MVP      | SEO + performance                 |

**Deferred to V2:** blog / content marketing, promotional landing pages, advanced CMS.

### Pillar 3 — Interact

| Feature                                  | Priority | Notes             |
| ---------------------------------------- | -------- | ----------------- |
| Contact form (name, email, message)      | MVP      |                   |
| Contact form email notification to admin | MVP      |                   |
| Real-time chat (Socket.io via NestJS)    | MVP      | Already in stack  |
| Back-in-stock alert signup               | V2       |                   |
| Live chat widget (Crisp, Tidio embed)    | V2       | Third-party embed |
| Abandoned cart recovery email            | V2       |                   |
| SMS notifications                        | V2       |                   |

### Admin Backoffice

| Feature                                            | Priority | Notes              |
| -------------------------------------------------- | -------- | ------------------ |
| Product + variant + image CRUD                     | MVP      |                    |
| Category hierarchy management                      | MVP      |                    |
| Inventory: stock per variant, low-stock alerts     | MVP      | Single location    |
| Order list with filters + search                   | MVP      |                    |
| Order detail + status management                   | MVP      |                    |
| Order fulfillment (mark shipped + tracking number) | MVP      |                    |
| Refund processing                                  | MVP      |                    |
| Customer list + detail view                        | MVP      |                    |
| Discount code CRUD                                 | MVP      |                    |
| Basic shipping zone + flat-rate config             | MVP      |                    |
| Homepage + static page content editor              | MVP      |                    |
| Store branding settings (logo, name, colors)       | MVP      | White-label hook   |
| Basic sales dashboard (revenue, orders, AOV)       | MVP      | Minimal reporting  |
| GDPR data deletion / export request                | MVP      | Legal requirement  |
| Admin user RBAC (admin, staff roles)               | MVP      |                    |
| Bulk CSV import/export                             | V2       |                    |
| Advanced reporting + cohort analysis               | V2       | Use GA4 / Metabase |
| Audit log of admin actions                         | V2       |                    |

### Infrastructure (Non-Negotiable for MVP)

| Feature                                                                         | Priority |
| ------------------------------------------------------------------------------- | -------- |
| JWT authentication + Passport.js Guards                                         | MVP      |
| Role-based access control (customer, admin, staff)                              | MVP      |
| Full transactional email suite (order confirm, shipped, refund, reset, welcome) | MVP      |
| Background job processing (BullMQ)                                              | MVP      |
| Image storage (MinIO, S3-compatible)                                            | MVP      |
| CDN image delivery via Next.js Image optimization                               | MVP      |
| HTTPS, CSRF, XSS protection, rate limiting                                      | MVP      |
| HTTP security headers (`@nestjs/helmet`)                                        | MVP      |
| Error monitoring (GlitchTip or Sentry)                                          | MVP      |
| Health check endpoints                                                          | MVP      |
| Docker + Docker Compose (all services in one command)                           | MVP      |
| Google Analytics 4 + Google Tag Manager                                         | MVP      |
| Webhook system for order/customer events                                        | MVP      |

**Out of scope for this platform type:** subscriptions, marketplace/multi-vendor, POS, ERP/accounting integrations, loyalty programs, 3PL, AI chatbot.

---

## 3. Confirmed Tech Stack

All decisions finalized. See `tech-stack-decision.md` for original rationale.

### Confirmed Stack

| Layer                        | Technology                                     | Notes                                             |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Frontend framework           | Next.js 15 (App Router)                        | SSR/SSG for SEO, Server Components by default     |
| UI components                | shadcn/ui                                      | Owned components, CSS-variable theming            |
| Styling                      | Tailwind CSS                                   | CSS variables for all brand tokens                |
| Backend framework            | NestJS                                         | Mirrors Angular DI/module architecture            |
| Language                     | TypeScript                                     | Everywhere. No `.js` files.                       |
| Database                     | PostgreSQL                                     | Open source, relational model                     |
| ORM                          | Prisma                                         | Type-safe, schema-first, migration-based          |
| Caching / Sessions / Pub-Sub | Redis                                          | Single service for all three uses                 |
| Real-time / Chat             | Socket.io via NestJS                           | Native WebSocket gateway                          |
| Authentication               | JWT + Passport.js + NestJS Guards              | Standard, open source                             |
| API documentation            | Swagger / OpenAPI                              | Auto-generated from NestJS decorators             |
| Unit/Integration testing     | Jest                                           | Co-located `.spec.ts` files                       |
| E2E testing                  | Playwright                                     | Page Object Model, `data-testid` selectors        |
| Containerization             | Docker + Docker Compose                        | Dev/prod parity                                   |
| CI/CD                        | GitHub Actions                                 | Free, native GitHub integration                   |
| Logging                      | Winston                                        | Structured logging, multiple transports           |
| Validation                   | Zod (frontend) + class-validator (NestJS DTOs) |                                                   |
| Background jobs              | BullMQ                                         | Redis-backed, `@nestjs/bullmq` integration        |
| File / image storage         | MinIO                                          | Self-hosted S3-compatible, Docker Compose         |
| Monorepo                     | Turborepo                                      | Lower overhead than Nx, internal packages pattern |
| i18n                         | next-intl                                      | Best App Router support, type-safe                |
| Server state (frontend)      | TanStack Query                                 | API data caching, background refetch              |
| Client state (frontend)      | Zustand                                        | Cart, UI state                                    |
| Security headers             | `@nestjs/helmet`                               | One import in `main.ts`                           |
| Rate limiting                | `@nestjs/throttler`                            | Auth endpoints, public API                        |
| Error tracking               | GlitchTip (self-hosted)                        | Sentry-compatible API, Docker Compose             |
| Product search               | PostgreSQL FTS → Meilisearch                   | Start simple, abstracted behind SearchService     |
| Monitoring                   | OpenTelemetry → Grafana Cloud                  | Instrument first, free tier                       |
| Email                        | Resend                                         | Best DX, React Email integration                  |
| Payment                      | Stripe (+ MercadoPago)                         | Provider-agnostic PaymentModule interface         |

### Deployment

- **VPS (Hetzner or DigitalOcean) + Docker Compose**
- Full control, predictable cost, open source stack native
- Matches project philosophy: no vendor lock-in

### Pending / Not Yet Configured

- i18n locales: decide which languages before scaffolding (Spanish + English at minimum given LatAm intent)
- MercadoPago: implement as second PaymentProvider once Stripe is working
- PgBouncer: add to Docker Compose when scaling becomes relevant (Prisma built-in pool is sufficient for MVP)

---

## 4. Monorepo Structure (Turborepo)

### Workspace Layout

```
ecommerce/
├── apps/
│   ├── web/                        # Next.js 15 — customer storefront + admin
│   └── api/                        # NestJS — REST API backend
├── packages/
│   ├── types/                      # Shared TypeScript interfaces + Zod schemas
│   │   └── src/
│   │       ├── index.ts
│   │       ├── product.types.ts
│   │       ├── order.types.ts
│   │       └── dto/
│   ├── tsconfig/                   # Shared TypeScript configs
│   │   ├── base.json
│   │   ├── nextjs.json             # moduleResolution: "bundler"
│   │   └── nestjs.json             # emitDecoratorMetadata: true, moduleResolution: "node"
│   └── config/                     # Shared ESLint, Prettier configs
│       ├── eslint/
│       └── prettier/
├── CLAUDE.md                       # AI agent instructions (see Section 6)
├── AGENTS.md                       # Mirror of CLAUDE.md for OpenAI Codex
├── .cursorrules                    # Cursor IDE rules
├── turbo.json
├── package.json                    # pnpm workspaces root
├── pnpm-workspace.yaml
├── docker-compose.yml
├── docker-compose.dev.yml
├── mvp-tool-designs.md             # This file
├── tech-stack-decision.md
└── stack-evaluation-conclusions.md
```

### Internal Packages Pattern

`packages/types/package.json` points `main` and `exports` at `.ts` source files directly — no build step needed. Each app's own compiler handles transpilation.

```json
{
  "name": "@repo/types",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

**Rule:** `packages/types` contains **pure TypeScript interfaces only** — no `class-validator` decorators. Those live inside `apps/api` and implement the shared interfaces.

### Key Turborepo Rules

- Declare all build-time env vars in `turbo.json` under `"env"` per task (Turborepo cache uses these as keys)
- Deploy web only: `turbo run build --filter=@repo/web`
- Deploy API only: `turbo prune @repo/api --docker` then multi-stage Docker build
- Dev HMR across packages works automatically with internal packages pattern

---

## 5. NestJS Backend Architecture

### Module Conventions

Every business domain is an independent NestJS module. The `products` module is the **canonical reference implementation** — all other modules must follow the same structure.

```
src/
├── modules/
│   ├── products/                   # Reference implementation
│   │   ├── products.module.ts
│   │   ├── products.controller.ts  # HTTP routing + validation only
│   │   ├── products.service.ts     # Business logic
│   │   ├── products.repository.ts  # All Prisma queries
│   │   ├── dto/
│   │   │   ├── create-product.dto.ts
│   │   │   ├── update-product.dto.ts
│   │   │   └── product-response.dto.ts
│   │   ├── entities/
│   │   │   └── product.entity.ts
│   │   ├── products.controller.spec.ts
│   │   └── products.service.spec.ts
│   ├── orders/
│   ├── customers/
│   ├── categories/
│   ├── inventory/
│   ├── cart/
│   ├── payments/
│   │   └── providers/              # Stripe + MercadoPago implementations
│   ├── auth/
│   ├── users/
│   ├── chat/                       # Socket.io gateway
│   ├── notifications/              # Email via Resend + BullMQ queue
│   ├── search/                     # SearchService abstraction (FTS → Meilisearch)
│   └── storage/                    # MinIO / S3-compatible abstraction
├── prisma/
│   ├── prisma.service.ts
│   └── schema.prisma
└── main.ts
```

### Layer Separation (strict)

| Layer      | Responsibility                                             | Never does                |
| ---------- | ---------------------------------------------------------- | ------------------------- |
| Controller | Route mapping, request parsing, Guards, response mapping   | Business logic, DB access |
| Service    | Business logic, orchestration, error throwing              | HTTP concerns, DB queries |
| Repository | All Prisma queries, data mapping to domain entities        | Business logic, HTTP      |
| DTO        | Input shape, `class-validator` + `@ApiProperty` decorators | Logic                     |

### Exception Mapping (standard)

| Situation            | NestJS Exception        |
| -------------------- | ----------------------- |
| Resource not found   | `NotFoundException`     |
| Invalid input        | `BadRequestException`   |
| Not authenticated    | `UnauthorizedException` |
| Lacks permission     | `ForbiddenException`    |
| Duplicate / conflict | `ConflictException`     |

### Provider-Agnostic Module Pattern

Payment gateway and email provider follow the same pattern: define an interface, inject concrete implementations via env config.

```typescript
// Defined once, implemented by Stripe + MercadoPago
interface PaymentProvider {
  createPaymentIntent(amount: number, currency: string): Promise<PaymentIntent>;
  confirmPayment(paymentIntentId: string): Promise<PaymentConfirmation>;
  refund(paymentIntentId: string, amount?: number): Promise<Refund>;
}

// Selected by PAYMENT_PROVIDER env var per deployment
```

Same pattern for `MailService` (Resend as default implementation).

---

## 6. Next.js Frontend Architecture

### Routing

```
apps/web/src/app/
├── [locale]/                       # next-intl locale segment (e.g. /es, /en)
│   ├── layout.tsx                  # Root layout: fonts, brand CSS vars, TanStack Provider
│   ├── page.tsx                    # Homepage
│   ├── products/
│   │   ├── page.tsx                # PLP (Server Component, SSR)
│   │   └── [slug]/
│   │       └── page.tsx            # PDP (Server Component, SSR)
│   ├── categories/
│   │   └── [slug]/
│   │       └── page.tsx
│   ├── cart/
│   │   └── page.tsx                # Client Component (cart state is client-side)
│   ├── checkout/
│   │   └── page.tsx
│   ├── account/
│   │   ├── page.tsx
│   │   └── orders/
│   │       └── page.tsx
│   ├── (info)/                     # Route group for static informational pages
│   │   ├── about/
│   │   ├── faq/
│   │   ├── contact/
│   │   └── policies/
│   └── admin/                      # Admin dashboard (protected)
│       ├── layout.tsx
│       ├── dashboard/
│       ├── products/
│       ├── orders/
│       ├── customers/
│       └── settings/
└── api/                            # Next.js API routes (minimal — prefer NestJS)
    └── webhooks/
        └── stripe/
            └── route.ts
```

### Component Conventions

- **Server Components by default.** Add `"use client"` only when you need browser APIs, event handlers, or React hooks.
- **shadcn/ui** components installed via `npx shadcn@latest add <component>` — never copy-pasted manually.
- **Tailwind CSS utility classes only.** No custom CSS files unless there is no Tailwind equivalent.
- **Dynamic Tailwind class names are forbidden** (e.g., `bg-${color}` does not work). Use CSS variables for all runtime values.

### State Management

| Concern                           | Tool                       | Where                                   |
| --------------------------------- | -------------------------- | --------------------------------------- |
| API data (products, orders, etc.) | TanStack Query             | Client Components that need fresh data  |
| Cart contents                     | Zustand                    | Global store, persisted to localStorage |
| UI state (modal open, sidebar)    | Zustand                    | Global store or local `useState`        |
| Auth state                        | Zustand + HTTP-only cookie | Session validated server-side           |

### White-Label Brand Config

```typescript
// apps/web/src/config/brand.ts — the only file to edit when forking for a new client
export const brand = {
  name: 'Store Name',
  tagline: 'Your tagline here',
  logoPath: '/logo.svg',
  faviconPath: '/favicon.ico',
  defaultLocale: 'es',
  supportedLocales: ['es', 'en'],
  contact: {
    email: 'contact@store.com',
    phone: '+598 99 000 000',
    address: 'City, Country',
  },
  social: {
    instagram: '',
    facebook: '',
    twitter: '',
  },
} as const;
```

CSS variables in `globals.css` control all visual tokens — updating them + the logo is the complete visual rebrand.

---

## 7. Data Model Overview

Standard single-tenant e-commerce schema (no `tenant_id`). Clean Prisma schema, one database per deployment.

### Core Entities

```
Category (tree — parentId self-reference)
  └── Product
        ├── ProductVariant (SKU-level: size, color, etc.)
        │   ├── Price
        │   └── InventoryItem → stock quantity
        ├── ProductImage
        ├── ProductOption (e.g. "Size", "Color")
        └── ProductTag

Cart → Order (lifecycle transition)
  ├── LineItem → ProductVariant (price snapshot at order time)
  ├── ShippingAddress
  ├── BillingAddress
  ├── ShippingMethod
  └── Payment → PaymentProvider

Customer (guest or registered)
  ├── User account (optional — guest checkout allowed)
  └── Address[]

Discount / CouponCode

Page (about, FAQ, policies — CMS-lite)

AdminUser (separate from Customer)
  └── Role (ADMIN, STAFF)
```

### Key Schema Decisions

- `LineItem` stores `unitPrice` at order time — price changes do not affect historical orders
- `ProductVariant.stock` is the inventory level — no separate InventoryItem for MVP (add multi-location in V2)
- `@@unique([slug])` on Product and Category — clean URLs, enforced at DB level
- No soft deletes on MVP — use `status: ARCHIVED` on products instead of deletion

---

## 8. Starting Point Strategy

**There is no single community template that matches the full stack.** The composite scaffold approach:

### Step 1 — Monorepo Skeleton

```bash
npx create-turbo@latest ecommerce
```

Select pnpm as package manager. This gives correct `turbo.json` pipeline, workspace layout, shared `packages/tsconfig` and `packages/eslint-config`.

### Step 2 — Next.js App

```bash
cd apps/web  # (or create-next-app into apps/web)
npx shadcn@latest init
```

Configure App Router, Tailwind, shadcn/ui. Add `next-intl` immediately.

### Step 3 — NestJS App

Reference: `github.com/vercel/turborepo/tree/main/examples/with-nestjs`

```bash
cd apps/api
npx @nestjs/cli new . --skip-git --package-manager pnpm
```

Configure Prisma, Docker Compose, shared type paths.

### Step 4 — Build Products Module First

The `products` module is built end-to-end before anything else:
`schema.prisma` → `products.repository.ts` → `products.service.ts` → `products.controller.ts` → `products.service.spec.ts` → PLP + PDP pages in Next.js → Playwright E2E test

This module becomes the **living reference implementation** for every subsequent domain module and for every agent session.

### UI References to Study (not clone)

| Project                          | What to study                                                                |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `medusajs/nextjs-starter-medusa` | PDP, cart drawer, checkout flow — best shadcn/ui ecommerce UI in open source |
| `sadmann7/skateshop`             | Admin dashboard + product management with shadcn/ui                          |
| `vercel/commerce`                | Correct Server Component usage in product pages, image patterns              |

---

## 9. Agent-Optimization Strategy

The project is built for sustained AI-agent-assisted development. These conventions reduce agent errors and eliminate re-discovery overhead.

### Instruction Files

| File                              | Tool           | Purpose                                                           |
| --------------------------------- | -------------- | ----------------------------------------------------------------- |
| `CLAUDE.md`                       | Claude Code    | Auto-loaded every session. Commands, conventions, what-not-to-do. |
| `AGENTS.md`                       | OpenAI Codex   | Mirror of CLAUDE.md                                               |
| `.cursorrules`                    | Cursor IDE     | Key rules in Cursor format                                        |
| `.github/copilot-instructions.md` | GitHub Copilot | Workspace-level Copilot instructions                              |

**`CLAUDE.md` must contain:**

1. Essential commands (dev, build, test, migrate, seed)
2. Monorepo structure map
3. Architecture rules (Server Components by default, no raw SQL, no `any`, etc.)
4. NestJS module conventions
5. What NOT to do (the most important section)
6. Reference to `products` as canonical module
7. Environment variable locations

### TypeScript Configuration for Agents

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "forceConsistentCasingInFileNames": true
}
```

`noUncheckedIndexedAccess` is the single most impactful flag — prevents agents from producing runtime errors via unchecked array/object access.

### ESLint Configuration for Agents

Use `strictTypeChecked` (not just `strict`). This adds type-aware rules:

- `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`
- `no-floating-promises` — catches unhandled async errors agents commonly produce
- `explicit-function-return-type` — agents document their own output types
- `consistent-type-imports` — enforces `import type` for type-only imports

### Testing Conventions for Agents

**Jest:**

- Co-located tests: `products.service.spec.ts` next to `products.service.ts`
- Test factories in `apps/api/test/factories/` — shared `createMockProduct()`, `createMockOrder()`, etc.
- 80% coverage threshold enforced in CI — agents must cover edge cases
- Mock repositories at the service layer, never mock Prisma directly in service tests

**Playwright:**

- Page Object Model in `apps/web/e2e/pages/` (one class per page)
- Tests in `apps/web/e2e/tests/`
- `data-testid` selectors exclusively — stable, readable, agent-friendly
- First E2E: checkout flow (the highest-value path)

### Pre-Commit Hooks (husky + lint-staged)

Agents don't need to remember to format. Hooks run automatically on commit:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

### What Gives Agents the Most Leverage (in order)

1. `CLAUDE.md` with commands + conventions + "what not to do" — eliminates ~70% of agent mistakes
2. `noUncheckedIndexedAccess` TypeScript flag — safer array/object access
3. ESLint `strictTypeChecked` — catches unsafe patterns before they reach review
4. Repository pattern — agents never scatter Prisma queries
5. Test factories — agents write consistent test data
6. Identical 9-file module structure — agents can write new modules without reading docs
7. Pre-commit hooks — code is always formatted regardless of how the agent submits

---

## 10. Docker Compose Services (Development)

```yaml
services:
  web: # Next.js 15 (port 3000)
  api: # NestJS (port 3001)
  postgres: # PostgreSQL 16 (port 5432)
  redis: # Redis 7 (port 6379)
  minio: # MinIO object storage (port 9000, console 9001)
  glitchtip: # Error tracking (port 8000) — or use Sentry cloud
```

All services start with a single `docker compose up`. Dev/prod parity from day one.

---

## 11. Decision Log (Resolved)

| Decision               | Resolution                                                          | Reasoning                                                              |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Monorepo tool          | Turborepo                                                           | Lower overhead than Nx, purpose-built for multi-app TypeScript         |
| Multi-tenancy strategy | None (fork-based)                                                   | Removes entire complexity layer, each client gets their own deployment |
| White-label approach   | Fork + brand config file + CSS variables                            | Simplest possible, no runtime overhead, zero architectural complexity  |
| Deployment             | VPS + Docker Compose                                                | Full control, open source, no vendor dependency                        |
| Repository structure   | `apps/web` + `apps/api` + `packages/types`                          | Clean separation, shared types without duplication                     |
| Payment gateway        | Stripe primary + MercadoPago secondary, provider-agnostic interface | LatAm market needs local payment methods                               |
| Email provider         | Resend                                                              | Best DX, React Email templates, easy to abstract                       |
| Background jobs        | BullMQ                                                              | Redis already in stack, zero new infrastructure                        |
| File storage           | MinIO                                                               | Self-hosted, S3-compatible, runs in Docker Compose                     |
| E2E testing            | Playwright                                                          | Best Next.js 15 App Router support, TypeScript-first                   |
| Server state           | TanStack Query                                                      | Industry standard for Next.js client components                        |
| Client state           | Zustand                                                             | Lightweight, minimal boilerplate                                       |
| Error tracking         | GlitchTip                                                           | Self-hosted, Sentry-compatible, runs in Docker                         |
| Product search         | PostgreSQL FTS → Meilisearch                                        | Start simple, abstracted behind SearchService                          |
| Monitoring             | OpenTelemetry → Grafana Cloud                                       | Instrument first, free tier initially                                  |
| i18n                   | next-intl                                                           | Add day 1, best App Router support, painful retroactively              |
| Admin UI               | In-app (Next.js route group)                                        | No separate admin app for MVP, keep simple                             |
| Auth strategy          | JWT + Passport.js + NestJS Guards                                   | Standard, flexible, open source                                        |
| Security               | `@nestjs/helmet` + `@nestjs/throttler`                              | Official packages, minimal config                                      |

---

_This document is the master reference for the MVP. Update it as decisions are resolved or revised. The `products` module, once built, supersedes this document as the living architectural reference._
