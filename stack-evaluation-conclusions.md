# Stack Evaluation — Conclusions & Open Decisions

## White-Label E-Commerce Platform

**Date:** 2026-04-12
**Based on:** Analysis of `tech-stack-decision.md`

---

## 1. Overall Feasibility Verdict

**The project is feasible.** The stack is well-chosen, all technologies are proven in production, and the developer profile (Angular + .NET background) maps closely to NestJS, reducing the learning surface to React/Next.js on the frontend only. Key analogies that make this natural:

- NestJS ≈ Angular (modules, DI, decorators, guards)
- Prisma ≈ Entity Framework (schema-first, type-safe, migration-based)
- Swagger auto-generated from decorators ≈ Swashbuckle
- NestJS Guards ≈ ASP.NET middleware / authorization policies

**Main risks to success:**

1. Multi-tenancy strategy must be decided before the data layer is built — it shapes every table, query, and middleware.
2. Scope is large — must be delivered incrementally.
3. React/Next.js App Router is the main new paradigm to learn (Server Components mental model).

---

## 2. What Is Already Well Covered

| Area                     | Decision                          | Assessment                                                                    |
| ------------------------ | --------------------------------- | ----------------------------------------------------------------------------- |
| Frontend framework       | Next.js 15 (App Router)           | Correct — SSR critical for e-commerce SEO                                     |
| UI components            | shadcn/ui                         | Correct — components owned by the project, white-label friendly               |
| Styling                  | Tailwind CSS + CSS variables      | Correct — per-client theming is straightforward                               |
| Backend framework        | NestJS                            | Correct — mirrors Angular, strong fit for developer profile                   |
| Database                 | PostgreSQL + Prisma               | Correct — relational model is right for e-commerce data                       |
| Caching / sessions       | Redis                             | Correct — also covers WebSocket pub/sub, no extra service needed              |
| Real-time chat           | Socket.io via NestJS              | Correct — avoids managed services like Pusher                                 |
| Authentication           | JWT + Passport.js + NestJS Guards | Correct — standard, flexible, open source                                     |
| API documentation        | Swagger / OpenAPI                 | Correct — auto-generated from decorators                                      |
| Unit/integration testing | Jest                              | Correct — but incomplete without E2E (see gaps)                               |
| Containerization         | Docker + Docker Compose           | Correct — dev/prod parity, required for white-label                           |
| CI/CD                    | GitHub Actions                    | Correct — free, native GitHub integration                                     |
| Logging                  | Winston                           | Correct — structured logging, multiple transports                             |
| Validation               | Zod + class-validator             | Acceptable — dual approach, Zod for frontend, class-validator for NestJS DTOs |

---

## 3. Pending Decisions (from original document)

These were already identified as deferred. They must be resolved before or during the first client deployment.

---

### 3.1 Repository Structure

**Why it matters:** Affects how shared TypeScript types (API DTOs, response shapes) are managed between frontend and backend. Choosing separate repos without a plan for shared types leads to duplication or drift.

| Option                 | Pros                                                         | Cons                                                       |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **Turborepo monorepo** | Shared types package, single repo, low ceremony, fast builds | Slightly more initial setup                                |
| **Nx monorepo**        | Powerful code generation, enterprise features                | Higher complexity, heavier tooling                         |
| **Separate repos**     | Simple isolation                                             | No native shared types, must publish packages or duplicate |

**Recommendation:** Turborepo. Lower overhead than Nx, purpose-built for multi-app TypeScript setups, widely adopted.

---

### 3.2 Multi-Tenancy Strategy

**Why it matters:** This is the highest-risk deferred decision. It fundamentally shapes the entire data layer — every Prisma schema table, every query, every auth check, every middleware. Must be decided before building the data layer.

| Option                          | Isolation       | Cost                          | Complexity                 | Best for                                 |
| ------------------------------- | --------------- | ----------------------------- | -------------------------- | ---------------------------------------- |
| **Shared schema + `tenant_id`** | Low (row-level) | Cheapest                      | High (requires discipline) | Many tenants, cost-sensitive             |
| **Separate DB per tenant**      | High            | Expensive (one DB per client) | High (ops overhead)        | Enterprise clients, strict isolation     |
| **Subdomain routing only**      | Medium          | Cheap                         | Medium                     | Simple branding differences, shared data |

**Recommendation:** Shared schema with `tenant_id` for the first version. Cheapest, most scalable, deployable on a single server. Requires careful Prisma middleware to enforce tenant scoping on every query.

---

### 3.3 Deployment Platform

| Option                                            | Pros                                                            | Cons                                                  |
| ------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **VPS (Hetzner / DigitalOcean) + Docker Compose** | Full control, predictable cost, open source stack runs natively | Manual ops, no auto-scaling                           |
| **Vercel (frontend) + Railway (backend)**         | Zero-config deployments, managed infra                          | Less control, Railway cost can grow, vendor proximity |
| **Vercel (frontend) + Render (backend)**          | Free tier available, managed                                    | Cold starts on free tier, some vendor dependency      |

**Recommendation:** VPS + Docker Compose for production consistency. Matches the project's open source / no vendor lock-in philosophy. Hetzner is cost-effective for European/LatAm projects.

---

### 3.4 Payment Gateway

| Option                              | Region          | Notes                                                                             |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| **Stripe**                          | International   | Best developer experience, excellent docs, webhooks                               |
| **Mercado Pago**                    | LatAm / Uruguay | Required for local payment methods (cash, debit)                                  |
| **Both (provider-agnostic module)** | —               | Design a `PaymentProvider` interface; inject Stripe or MercadoPago per deployment |

**Recommendation:** Design a provider-agnostic `PaymentModule` from day one with a common interface. Inject the concrete provider per client deployment via environment config.

---

### 3.5 Email Provider

| Option                | Free tier                              | Notes                                             |
| --------------------- | -------------------------------------- | ------------------------------------------------- |
| **Resend**            | 3,000 emails/month                     | Modern API, excellent DX, React Email integration |
| **SendGrid**          | 100 emails/day                         | Established, feature-rich                         |
| **AWS SES**           | 62,000 emails/month (if sent from EC2) | Cheapest at scale, more setup                     |
| **Nodemailer + SMTP** | Depends on SMTP provider               | Open source, self-contained, no vendor            |

**Recommendation:** Resend for first deployment — best developer experience and React Email templates work well with Next.js projects. Abstract behind a `MailService` interface to swap providers later.

---

### 3.6 Monitoring / Observability

| Option                           | Type                   | Notes                                                                       |
| -------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| **Grafana + Loki + Tempo**       | Full self-hosted stack | Open source, runs in Docker, no external dependency                         |
| **Grafana Cloud**                | Managed                | Generous free tier, zero ops                                                |
| **Datadog**                      | Managed                | Best features, expensive                                                    |
| **OpenTelemetry → any exporter** | Instrumentation layer  | Already mentioned in the document — instrument first, decide exporter later |

**Recommendation:** Instrument with OpenTelemetry from day one (already planned). Use Grafana Cloud free tier for early stages; migrate to self-hosted if costs become relevant.

---

## 4. Gaps Identified — Missing from the Stack

These were absent from the original document and should be added.

---

### 4.1 Background Job Queue — CRITICAL

**Why it matters:** The architecture explicitly mentions background jobs (emails, inventory updates, notifications) but no tool is listed. This is a core infrastructure piece, not optional.

| Option      | Notes                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| **BullMQ**  | Redis-backed (Redis already in stack), native NestJS integration via `@nestjs/bullmq`, open source, actively maintained |
| **Agenda**  | MongoDB-backed, not a fit here                                                                                          |
| **pg-boss** | PostgreSQL-backed, no Redis needed, simpler but less feature-rich                                                       |

**Recommendation:** BullMQ. Redis is already in the stack — this is one package away with zero new infrastructure.

---

### 4.2 File / Image Storage — CRITICAL

**Why it matters:** E-commerce requires product image storage. Next.js image optimization handles delivery, but does not handle storage origin. This is a gap.

| Option               | Type                       | Notes                                                                                |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| **MinIO**            | Self-hosted, S3-compatible | Runs in Docker Compose, zero vendor dependency, open source, fits project philosophy |
| **Cloudflare R2**    | Managed, S3-compatible     | No egress fees, generous free tier, but managed service                              |
| **AWS S3**           | Managed                    | Industry standard, but AWS dependency                                                |
| **Local filesystem** | Self-hosted                | Simple but not scalable, not suitable for multi-tenant                               |

**Recommendation:** MinIO for development and self-hosted deployments. S3-compatible API means migration to R2 or S3 later requires no code changes.

---

### 4.3 End-to-End Testing — CRITICAL

**Why it matters:** Jest covers unit and integration tests. Critical e-commerce flows (product → cart → checkout → payment → confirmation) require browser-level E2E testing. Jest does not cover this.

| Option         | Notes                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| **Playwright** | Microsoft-backed, native Next.js support, TypeScript-first, open source, fast |
| **Cypress**    | Mature, large community, slightly heavier setup, also open source             |

**Recommendation:** Playwright. Best fit for Next.js App Router, official testing guide uses it, excellent TypeScript support.

---

### 4.4 Frontend State Management — CRITICAL

**Why it matters:** The frontend stack has no state management decision. E-commerce requires both server state (API data: products, orders) and client state (cart, UI state). These are different problems.

| Problem          | Option                           | Notes                                                                                                     |
| ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Server state** | **TanStack Query (React Query)** | Caching, background refetch, loading/error states, deduplication. Standard for Next.js client components. |
| **Server state** | SWR                              | Simpler alternative to TanStack Query, made by Vercel                                                     |
| **Client state** | **Zustand**                      | Lightweight, minimal boilerplate, widely adopted                                                          |
| **Client state** | Jotai                            | Atomic model, even simpler than Zustand                                                                   |
| **Client state** | Redux Toolkit                    | Overkill for this use case                                                                                |

**Recommendation:** TanStack Query for server state + Zustand for client state (cart, UI). This is the most common and well-documented combination in the Next.js ecosystem.

---

### 4.5 Security Middleware — IMPORTANT

**Why it matters:** No security hardening is listed. A public e-commerce API needs baseline HTTP security headers and rate limiting as a minimum.

| Tool                    | Purpose                                                        | Notes                                                                        |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **`@nestjs/helmet`**    | HTTP security headers (XSS, HSTS, content-type sniffing, etc.) | One import in `main.ts`, zero configuration needed to get value              |
| **`@nestjs/throttler`** | Rate limiting                                                  | Prevents brute-force on auth endpoints, contact forms, and public API routes |

**Recommendation:** Add both. They are official NestJS packages, open source, and require minimal configuration.

---

### 4.6 Error Tracking — IMPORTANT

**Why it matters:** Winston covers structured logging (what happened). Error tracking is a different concern: capturing unhandled exceptions, aggregating them, and alerting on spikes. These are complementary, not interchangeable.

| Option        | Type                     | Notes                                                                                                  |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Sentry**    | Managed (free tier)      | Industry standard, handles Next.js (frontend) and NestJS (backend), source maps, alerting              |
| **GlitchTip** | Open source, self-hosted | Sentry-compatible API, runs in Docker, zero vendor dependency — best fit for this project's philosophy |

**Recommendation:** GlitchTip for a self-hosted setup consistent with the project's open source constraint. Sentry if developer experience and zero ops is preferred (free tier is generous).

---

### 4.7 Product Search — IMPORTANT

**Why it matters:** E-commerce invariably requires search (by name, category, price range, attributes). Not acknowledged in the current document.

| Option                          | Notes                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL full-text search** | Built-in, zero new infrastructure, good enough for small-to-medium catalogs. Natural first choice.            |
| **Meilisearch**                 | Open source, self-hosted, runs in Docker, typo-tolerant, fast, excellent DX. Upgrade path when catalog grows. |
| **Typesense**                   | Similar to Meilisearch, also open source and self-hosted                                                      |
| **Elasticsearch**               | Powerful but heavy, operational overhead                                                                      |

**Recommendation:** Start with PostgreSQL FTS. Define a `SearchService` abstraction early so Meilisearch can be dropped in later without changing consumers.

---

### 4.8 SEO Tooling — ACKNOWLEDGE

**Why it matters:** SSR is covered. But e-commerce SEO also requires structured data, sitemaps, and social metadata — important for product discoverability on Google Shopping and social sharing.

| Concern                                | Solution                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Structured data (JSON-LD for products) | Next.js App Router — add `<script type="application/ld+json">` in Server Components |
| Sitemap                                | `next-sitemap` package                                                              |
| Open Graph / Twitter meta              | Next.js built-in `Metadata` API                                                     |

**Recommendation:** Use Next.js Metadata API for all meta tags. Add `next-sitemap` for sitemap generation. No extra infrastructure needed.

---

### 4.9 Internationalization (i18n) — ACKNOWLEDGE / DECIDE

**Why it matters:** The stack references Mercado Pago for LatAm/Uruguay, suggesting multi-market intent. Adding i18n retroactively to an existing Next.js frontend is painful. A yes/no decision upfront avoids future rework.

| Option              | Notes                                                       |
| ------------------- | ----------------------------------------------------------- |
| **`next-intl`**     | Best App Router support, type-safe, widely adopted          |
| **`react-i18next`** | Mature, large community, more complex setup with App Router |
| **Not now**         | Valid if all client deployments are single-language         |

**Recommendation:** Decide yes/no before scaffolding. If any client deployment will be multi-language, add `next-intl` from day one.

---

### 4.10 Database Connection Pooling — ACKNOWLEDGE

**Why it matters:** PostgreSQL connections are expensive (memory per connection). Under horizontal scaling or high concurrency, unmanaged connections become a bottleneck.

| Option                   | Notes                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| **Prisma built-in pool** | Default behavior, sufficient for single-instance deployments              |
| **PgBouncer**            | Dedicated connection pooler, runs in Docker, standard production solution |

**Recommendation:** Prisma built-in pool is sufficient for the first deployment. Add PgBouncer as a Docker Compose service when scaling becomes relevant.

---

## 5. Complete Stack Picture (After Analysis)

### Confirmed

| Layer                        | Technology                                     |
| ---------------------------- | ---------------------------------------------- |
| Frontend                     | Next.js 15 (App Router)                        |
| UI                           | shadcn/ui                                      |
| Styling                      | Tailwind CSS                                   |
| Backend                      | NestJS                                         |
| Language                     | TypeScript (everywhere)                        |
| Database                     | PostgreSQL                                     |
| ORM                          | Prisma                                         |
| Caching / Sessions / Pub-Sub | Redis                                          |
| Real-time                    | Socket.io via NestJS                           |
| Authentication               | JWT + Passport.js + NestJS Guards              |
| API documentation            | Swagger / OpenAPI                              |
| Unit/Integration testing     | Jest                                           |
| Containerization             | Docker + Docker Compose                        |
| CI/CD                        | GitHub Actions                                 |
| Logging                      | Winston                                        |
| Validation                   | Zod (frontend) + class-validator (NestJS DTOs) |

### To Add (gaps identified)

| Layer                   | Recommended                  | Status |
| ----------------------- | ---------------------------- | ------ |
| Background jobs         | BullMQ                       | Decide |
| File/image storage      | MinIO                        | Decide |
| E2E testing             | Playwright                   | Decide |
| Server state (frontend) | TanStack Query               | Decide |
| Client state (frontend) | Zustand                      | Decide |
| Security headers        | `@nestjs/helmet`             | Add    |
| Rate limiting           | `@nestjs/throttler`          | Add    |
| Error tracking          | GlitchTip or Sentry          | Decide |
| Product search          | PostgreSQL FTS → Meilisearch | Decide |

### Pending Decisions (from original document)

| Decision                   | Recommended                                     |
| -------------------------- | ----------------------------------------------- |
| Repository structure       | Turborepo monorepo                              |
| Multi-tenancy strategy     | Shared schema + `tenant_id`                     |
| Deployment platform        | VPS + Docker Compose                            |
| Payment gateway            | Provider-agnostic module (Stripe + MercadoPago) |
| Email provider             | Resend                                          |
| Monitoring / Observability | OpenTelemetry → Grafana Cloud                   |

### Acknowledge / Decide Before Scaffolding

| Concern               | Action                                             |
| --------------------- | -------------------------------------------------- |
| SEO tooling           | Plan JSON-LD, `next-sitemap`, Next.js Metadata API |
| i18n                  | Decide yes/no — painful to add retroactively       |
| DB connection pooling | Prisma pool now, PgBouncer later                   |
| API versioning policy | Define strategy (NestJS built-in versioning)       |

---

_This document summarizes the conclusions of the initial stack analysis conversations. Update as decisions are resolved._
