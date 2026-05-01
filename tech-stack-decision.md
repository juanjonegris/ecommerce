# Technology Stack Decision Record

## White-Label E-Commerce Platform

**Date:** 2026-04-12
**Status:** In progress — some decisions pending

---

## 1. Purpose

This document records the outcome of a structured technology exploration process for a white-label e-commerce platform. It is intended to guide development decisions and serve as context for any collaborator, including code agents.

**Constraints and goals that drove the exploration:**

- Reusable across multiple client projects (white-label architecture)
- No proprietary licenses or vendor lock-in — all technologies must be open source and free
- Widely adopted, actively maintained, large communities
- Production-grade from day one: authentication, logging, testing, CI/CD, real-time communication
- Developer profile: extensive background in Angular and .NET, comfortable with TypeScript, transitioning toward modern full-stack JavaScript

---

## 2. Project Overview

A white-label e-commerce platform designed to be reused across different client deployments with minimal reconfiguration. The first deployment will serve as the reference implementation.

**Core functional areas:**

- Product catalog and inventory management
- Admin area for products, orders, and inventory
- Company information sections (About, Contact, etc.)
- Communication features: contact forms and real-time chat
- Authentication and role-based access control (customer, admin, super-admin)
- Logging, monitoring, and automated testing

---

## 3. Selected Stack — Option A: Next.js + NestJS

Two clearly separated applications, both in TypeScript:

| Layer              | Technology                  | Notes                                                             |
| ------------------ | --------------------------- | ----------------------------------------------------------------- |
| Frontend framework | **Next.js 15 (React)**      | SSR, SSG, App Router, image optimization                          |
| UI components      | **shadcn/ui**               | Components copied into the project, fully customizable per client |
| Styling            | **Tailwind CSS**            | Utility-first, white-label theming via CSS variables              |
| Backend framework  | **NestJS (Node.js)**        | Mirrors Angular architecture: modules, DI, decorators, guards     |
| Backend language   | **TypeScript**              | Full-stack TypeScript, shared types between front and back        |
| Database           | **PostgreSQL**              | Open source, battle-tested, no licensing costs                    |
| ORM                | **Prisma**                  | Type-safe, declarative migrations, comparable to Entity Framework |
| Caching / Sessions | **Redis**                   | Session storage, caching, WebSocket pub/sub                       |
| Real-time / Chat   | **Socket.io via NestJS**    | Native WebSocket gateway, no external managed service needed      |
| Authentication     | **JWT + NestJS Guards**     | Role-based access control via Passport.js strategies              |
| API documentation  | **Swagger (OpenAPI)**       | Auto-generated from NestJS decorators                             |
| Testing            | **Jest**                    | Default runner for both Next.js and NestJS                        |
| Containerization   | **Docker + Docker Compose** | Dev and production parity, required for multi-tenant deployments  |
| CI/CD              | **GitHub Actions**          | Free, native GitHub integration                                   |
| Logging            | **Winston**                 | Structured logging with multiple transports (backend)             |
| Validation         | **Zod + class-validator**   | Zod for frontend/shared schemas; class-validator for NestJS DTOs  |

---

## 4. Architecture Overview

### Frontend (Next.js 15)

- SSR for SEO-critical pages (product listings, landing pages)
- Client-side interactivity for cart, checkout, and admin dashboard
- White-label theming via Tailwind design tokens and shadcn/ui overrides
- PWA support for mobile browsers

### Backend (NestJS)

- RESTful API consumed by the frontend and potentially future mobile or third-party clients
- Modular structure: each domain (products, orders, users, inventory, chat) is an independent NestJS module
- JWT authentication with role-based access control
- WebSocket gateway for real-time chat (Socket.io)
- Background job processing for emails, inventory updates, and notifications

### Data Layer

- PostgreSQL as the primary relational database
- Prisma for schema management, migrations, and type-safe queries
- Redis for session storage, caching, and WebSocket pub/sub

### Infrastructure

- Docker Compose for local development (frontend, backend, PostgreSQL, Redis in one command)
- GitHub Actions for automated testing and deployment pipelines
- Deployment target: **TBD** (see Pending Decisions)

---

## 5. Why This Stack (Rationale)

Option A was selected over Option B (T3 Stack / Next.js only) for the following reasons:

- **NestJS mirrors Angular.** The developer has years of Angular experience. NestJS uses the same architectural concepts (modules, dependency injection, decorators, guards), reducing the learning surface to React/Next.js on the frontend only.
- **Real-time chat is better served by a dedicated backend.** NestJS provides a native WebSocket gateway via Socket.io. The alternative (T3 Stack) would require an external managed service like Pusher or Ably, adding cost and dependency.
- **Independent API layer.** The NestJS backend exposes a standard REST API that can be consumed by future mobile apps or third-party integrations without architectural changes.
- **Separation of concerns.** Two distinct applications are easier to reason about for a developer coming from enterprise frontend + backend projects.
- **Full open source stack.** No licensing costs at any layer.

---

## 6. Pending Decisions

These decisions are intentionally deferred. They should be resolved before or during the first client deployment.

| Decision                       | Options under consideration                                                  | Notes                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Repository structure**       | Monorepo (Nx or Turborepo) vs. separate repos                                | Depends on how white-label reuse strategy is finalized     |
| **Multi-tenancy strategy**     | Subdomain routing / DB per tenant / shared schema with tenant_id             | Requires further architectural analysis                    |
| **Deployment platform**        | Vercel + Railway / VPS (Hetzner, DigitalOcean) with Docker Compose           | Decision per client deployment                             |
| **Payment gateway**            | Stripe (international), Mercado Pago (LatAm / Uruguay)                       | Module should be designed provider-agnostic from the start |
| **Email provider**             | Resend, SendGrid, AWS SES                                                    | Deferred                                                   |
| **Monitoring / Observability** | OpenTelemetry instrumentation planned; exporter TBD (Grafana, Datadog, etc.) | Deferred                                                   |

---

## 7. What to Expect When Working on This Project

If you are a code agent or collaborator reading this document:

- **Language:** TypeScript everywhere. No JavaScript files.
- **Frontend:** Next.js 15 with App Router. Use Server Components by default; add `"use client"` only when necessary.
- **Backend:** NestJS with a modular structure. Each business domain is a module.
- **Styling:** Tailwind CSS utility classes only. No custom CSS files unless strictly necessary. Components from shadcn/ui.
- **Database access:** Always go through Prisma. No raw SQL unless there is a specific performance justification.
- **Validation:** Validate at the API boundary using class-validator DTOs in NestJS. Use Zod for frontend form validation and shared schemas.
- **Testing:** Every module should have unit tests (Jest). Integration tests for critical flows.
- **No proprietary services** should be introduced without discussion. Every new dependency must be open source or have a meaningful free tier.

---

_This document will be updated as pending decisions are resolved._
