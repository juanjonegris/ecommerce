# Product Requirements Document

## White-Label E-Commerce Platform

**Version:** 1.0
**Date:** 2026-04-25
**Author:** Solo developer, AI-agent-assisted workflow

---

## 1. Executive Summary

A reusable, white-label e-commerce platform built with Next.js 15 and NestJS. The first deployment is a personal store; the architecture is designed so that future client stores can be spun up by forking the repository and updating a single brand configuration file.

The platform supports both physical and digital products (mixed B2C). It is built by a solo developer working primarily with AI coding agents (Claude Code, Cursor), so the codebase prioritizes predictable conventions, strict typing, and machine-readable documentation over flexibility.

---

## 2. Mission

Build a production-grade e-commerce storefront and admin backoffice that can be forked, rebranded, and deployed for any small-to-medium B2C business with minimal effort.

**Design principles:**

- Open source stack only — no proprietary licenses, no vendor lock-in
- Convention over configuration — every module follows the same structure
- Agent-first development — the codebase is optimized for AI agents to read, navigate, and extend safely
- Ship the simplest thing that works — no premature abstractions

---

## 3. Target Users

### 3.1 Store Customers (End Users)

- Browse and search products (physical or digital)
- Add items to cart and complete checkout (guest or registered)
- Track orders, manage account, contact the business
- Receive transactional emails (confirmation, shipping, etc.)

### 3.2 Store Owner / Admin

- Manage products, categories, inventory, and pricing
- Process orders, fulfillments, and refunds
- Configure store branding, shipping rules, and discount codes
- View basic sales reporting

### 3.3 Platform Developer (You)

- Fork the repo for a new client
- Update brand config and CSS variables
- Deploy via Docker Compose to a VPS
- Extend with client-specific features as needed

---

## 4. MVP Scope

### 4.1 Storefront (Customer-Facing)

**Product Discovery**

- Product listing with filters (category, price), sorting, pagination
- Product detail page with variant selection, image gallery, stock indicator
- Category navigation (hierarchical)
- Keyword search (PostgreSQL full-text search)

**Cart & Checkout**

- Cart management (add, remove, update quantity)
- Guest and registered checkout
- Shipping and billing address entry
- Flat-rate shipping + free shipping threshold
- Discount code application
- Stripe payment integration
- Order confirmation page and email

**Customer Account**

- Registration, login, password reset
- Order history and order detail
- Profile editing

**Informational Pages**

- Homepage with hero banner and featured products
- About, FAQ, Contact (with form), Shipping & Returns, Privacy Policy, Terms of Service

**SEO & Performance**

- SSR for all public pages (Next.js App Router default)
- JSON-LD structured data for products
- Sitemap generation (`next-sitemap`)
- Open Graph and meta tags via Next.js Metadata API
- Image optimization via `next/image`

**i18n**

- Multi-language support via `next-intl` (Spanish + English at minimum)
- Locale segment in URL (`/es/products`, `/en/products`)

### 4.2 Admin Backoffice

- Product, variant, and image CRUD
- Category hierarchy management
- Inventory tracking (stock per variant, low-stock alerts)
- Order list, detail, status management, fulfillment, refunds
- Customer list and detail view
- Discount code CRUD
- Shipping zone and flat-rate rule configuration
- Homepage and static page content editing
- Store branding settings (logo, name, colors)
- Basic sales dashboard (revenue, order count, average order value)
- Admin RBAC (admin and staff roles)

### 4.3 Communication

- Contact form with email notification to admin
- Full transactional email suite (order confirmed, shipped, refunded, password reset, welcome)
- Newsletter signup with ESP integration (Mailchimp or Klaviyo)
- Real-time chat (Socket.io via NestJS WebSocket gateway)

### 4.4 Out of MVP Scope

Deferred to V2: blog, live chat widget (third-party), abandoned cart emails, social login, multi-currency, live carrier shipping rates, multi-location inventory, gift cards, advanced promotions (buy X get Y), bulk CSV import/export, audit logs.

Out of scope entirely: subscriptions, marketplace/multi-vendor, POS, ERP integration, loyalty programs, AI chatbot, 3PL integration.

---

## 5. Architecture Overview

### 5.1 High-Level

```
Browser ──→ Next.js 15 (SSR + Client) ──→ NestJS REST API ──→ PostgreSQL
                                              │
                                              ├── Redis (cache, sessions, pub/sub, job queue)
                                              ├── MinIO (image/file storage)
                                              └── Socket.io (real-time chat)
```

### 5.2 Monorepo (Turborepo)

```
ecommerce/
├── apps/
│   ├── web/               # Next.js 15 — storefront + admin UI
│   └── api/               # NestJS — REST API
├── packages/
│   ├── types/             # Shared TypeScript interfaces + Zod schemas
│   ├── tsconfig/          # Shared TS configs (nextjs.json, nestjs.json)
│   └── config/            # Shared ESLint + Prettier configs
├── CLAUDE.md              # Agent instructions
├── PRD.md                 # This file
├── docker-compose.yml
└── turbo.json
```

### 5.3 White-Label Strategy

Fork-based. No multi-tenancy. Each client = separate repo fork + separate deployment.

Rebrand a fork by updating two files:

1. `apps/web/src/config/brand.ts` — store name, contact info, locales
2. `apps/web/src/styles/globals.css` — CSS variables (colors, fonts, radius)

---

## 6. Core Patterns

### 6.1 NestJS Module Convention

Every domain module follows an identical 9-file structure. The `products` module is the canonical reference.

```
src/modules/<domain>/
├── <domain>.module.ts
├── <domain>.controller.ts     # HTTP only — no business logic
├── <domain>.service.ts        # Business logic — no HTTP, no DB
├── <domain>.repository.ts     # Prisma queries — no business logic
├── dto/
│   ├── create-<domain>.dto.ts
│   ├── update-<domain>.dto.ts
│   └── <domain>-response.dto.ts
├── entities/
│   └── <domain>.entity.ts
├── <domain>.controller.spec.ts
└── <domain>.service.spec.ts
```

### 6.2 Frontend Conventions

- Server Components by default; `"use client"` only when required
- TanStack Query for API data; Zustand for client state (cart, UI)
- Tailwind CSS utility classes only — no custom CSS files
- All brand colors and fonts via CSS variables (shadcn/ui tokens)
- `data-testid` attributes on interactive/observable elements

### 6.3 Shared Types

`packages/types` contains **pure TypeScript interfaces only** — no decorators. NestJS DTOs inside `apps/api` implement these interfaces and add `class-validator` decorators.

### 6.4 Provider-Agnostic Interfaces

Payment and email are abstracted behind interfaces. Concrete implementations (Stripe, MercadoPago, Resend) are injected via environment config:

- `PaymentProvider` interface → `StripeProvider`, `MercadoPagoProvider`
- `MailService` interface → `ResendMailService`

### 6.5 Testing

- **Unit/Integration (Jest):** co-located `.spec.ts` files, test factories in `test/factories/`, 80% coverage threshold
- **E2E (Playwright):** Page Object Model, `data-testid` selectors, checkout flow as first test

---

## 7. Tech Stack

| Layer            | Technology                                       |
| ---------------- | ------------------------------------------------ |
| Frontend         | Next.js 15 (App Router), shadcn/ui, Tailwind CSS |
| Backend          | NestJS, Prisma, PostgreSQL, Redis                |
| Real-time        | Socket.io via NestJS                             |
| Auth             | JWT + Passport.js + NestJS Guards                |
| i18n             | next-intl                                        |
| Server state     | TanStack Query                                   |
| Client state     | Zustand                                          |
| Background jobs  | BullMQ (@nestjs/bullmq)                          |
| File storage     | MinIO (S3-compatible)                            |
| Email            | Resend                                           |
| Payments         | Stripe (primary), MercadoPago (secondary)        |
| Search           | PostgreSQL FTS (upgrade path: Meilisearch)       |
| Testing          | Jest + Playwright                                |
| Monorepo         | Turborepo (pnpm workspaces)                      |
| Containerization | Docker + Docker Compose                          |
| CI/CD            | GitHub Actions                                   |
| Logging          | Winston                                          |
| Security         | @nestjs/helmet, @nestjs/throttler                |
| Error tracking   | GlitchTip (self-hosted)                          |
| Monitoring       | OpenTelemetry → Grafana Cloud                    |
| API docs         | Swagger / OpenAPI (auto-generated)               |

---

## 8. Agent Workflow & Tooling

### 8.1 Development Model

Solo developer + AI coding agents. The codebase must be self-documenting enough that an agent with no prior context can orient itself, make changes, and run tests without human hand-holding.

### 8.2 Agent Instruction Files

| File                              | Agent                                   |
| --------------------------------- | --------------------------------------- |
| `CLAUDE.md`                       | Claude Code — auto-loaded every session |
| `AGENTS.md`                       | OpenAI Codex                            |
| `.cursorrules`                    | Cursor IDE                              |
| `.github/copilot-instructions.md` | GitHub Copilot                          |

Contents: commands, monorepo map, architecture rules, module conventions, "what not to do" list, reference module pointer.

### 8.3 Guardrails for Agent Safety

| Guardrail              | Mechanism                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| Type safety            | `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Unsafe code prevention | ESLint `strictTypeChecked` (`no-unsafe-*`, `no-floating-promises`)       |
| Explicit contracts     | `explicit-function-return-type` ESLint rule                              |
| Consistent formatting  | Prettier + `lint-staged` + `husky` pre-commit hooks                      |
| Test coverage          | Jest 80% threshold enforced in CI                                        |
| Consistent test data   | Test factories (`test/factories/`)                                       |
| DB query safety        | Repository pattern — Prisma never imported outside repository files      |
| Predictable structure  | Identical 9-file module layout across all domains                        |
| Living reference       | `products` module = canonical example agents follow                      |

### 8.4 Agent Workflow Per Feature

1. Agent reads `CLAUDE.md` (automatic)
2. Agent reads the `products` reference module to understand the pattern
3. Agent scaffolds new module following the identical structure
4. Agent writes unit tests using test factories
5. Pre-commit hooks auto-format and lint
6. CI runs full test suite + coverage check

---

## 9. Deployment

- **Platform:** VPS (Hetzner or DigitalOcean) + Docker Compose
- **Services:** Next.js, NestJS, PostgreSQL, Redis, MinIO, GlitchTip
- **CI/CD:** GitHub Actions — lint, test, build, deploy
- **Per-client:** Fork repo → update brand config → deploy to a new VPS (or same VPS with separate compose stack)

---

## 10. Success Criteria for MVP

- [ ] A customer can browse products, add to cart, and complete a Stripe checkout
- [ ] A customer receives an order confirmation email
- [ ] An admin can create products, manage orders, and process refunds
- [ ] The store renders in at least two languages
- [ ] The store scores 90+ on Lighthouse (performance, SEO, accessibility)
- [ ] Forking the repo and rebranding takes under 30 minutes
- [ ] All critical paths have E2E test coverage (browse → cart → checkout)
- [ ] `docker compose up` starts the full stack in one command

---

## References

- `tech-stack-decision.md` — original stack selection rationale
- `stack-evaluation-conclusions.md` — gap analysis and resolved decisions
- `mvp-tool-designs.md` — detailed architecture, data model, and agent conventions

---

_This PRD defines the MVP. Update it as scope evolves._
