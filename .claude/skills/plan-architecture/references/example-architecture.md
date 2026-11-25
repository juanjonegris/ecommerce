# Example architecture doc (brownfield)

This is an example of the structure only. It follows the example PRD `back-in-stock-alerts`. The facts are
invented. Copy the structure, not the content.

```markdown
---
type: architecture
slug: back-in-stock-alerts
status: agreed
version: 1
date: 2026-11-21
author: jdoe
sources: [.agents/epics/back-in-stock-alerts/prd.md]
mode: brownfield
areas: [api, web, types]
---

# Architecture — Back-in-stock email alerts

PRD: [prd.md](prd.md)

## Problem and goals

Store customers must be able to ask for an email when an out-of-stock product returns. Store owners need to see how
many alerts each product has (PRD hypothesis: 15% of alert emails lead to an order within 7 days).

## Approaches considered

| Option                                                                                                  | Pros                                                      | Cons                                            | Chosen?             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- | ------------------- |
| A. New `stock-alerts` module; the products service enqueues a job when stock goes from 0 to more than 0 | Alerts go out right after a restock; one place to trigger | Couples the products update to the alert module | Yes (pending spike) |
| B. Scheduled BullMQ job scans products that are back in stock every 15 min                              | No change to the products module                          | Up to 15 min delay; a scan over all alerts      | No                  |

## Recommended approach

Option A. A new `stock-alerts` module stores the sign-ups. When the products service saves a stock change from 0 to
more than 0, it calls the stock-alerts service, which enqueues one email job per pending alert. The emails reuse
the email queue and `MailService`. The storefront shows a sign-up form on out-of-stock pages; the admin shows
pending alerts per product.

## Key decisions

- Stack and libraries: the existing stack, with no new library.
- Data model: a new `StockAlert` entity (product, email, status, created and sent dates), one per email and
  product.
- Boundaries: guests can sign up with an email; admin endpoints need the admin role. The email address is never
  logged.
- Provider ports: none new. Email goes through the existing `MailService` port (Resend, or the stub).

## Seams and integration points

- The products service stock update → the stock-alerts service (new call).
- The stock-alerts service → the email queue in `src/queues/emails/`.
- `@repo/types`: new `stock-alert.types.ts` (sign-up request, admin list item).
- `apps/web`: a Server Action for the sign-up, and an admin page under `admin/stock-alerts`.

## Areas touched

api (new `stock-alerts` module, a products service hook) · web (product page form, admin page) · types (new
contract).

## Data and storage

| Data point     | Stored in                     | Read through            | Written by         |
| -------------- | ----------------------------- | ----------------------- | ------------------ |
| Alert sign-ups | PostgreSQL `StockAlert` (new) | `StockAlertsRepository` | storefront sign-up |
| Product stock  | PostgreSQL `Product.stock`    | `ProductsRepository`    | admin product form |

Queues: the existing email queue, with a new job type. Schema change: yes, via `schema-migration`.

## Provider ports and config

Not applicable — this reuses `MailService`, with no new keys.

## Fork impact

White-label core: every client gets it. It doesn't touch `brand.ts` or `globals.css`. Forks get one migration and
new `es`/`en` messages on merge.

## Fixed rules to respect

Controller → Service → Repository. DTOs have class-validator and `@ApiProperty`. The sign-up is a Server Action
validated with Zod. Every mutation is logged as `stock-alerts.*` with `requestId`.

## Testing approach

Unit tests for the stock-alerts service on `test/factories/` (new `stock-alert.factory.ts`). A Playwright spec for
the sign-up on an out-of-stock page.

## Languages and audiences

`es` and `en` copy for the form and the email. Audiences: store customers (form), and the store owner (admin list).

## Missing pieces

- An email template for "back in stock".

## Spikes and experiments

Question: Where does a stock change from 0 to more than 0 happen today, and is it a single code path?
Spike: Trace every write to `Product.stock` in the API (admin form, orders, seed), timebox 1 day.
Decision rule: choose A if every write goes through the products service; choose B if stock is written in more
than one place.
Deliverable: A short note listing each write path, with `file:line`, and the decision.

## Open questions

- [ ] Double opt-in for guest emails. Settled by: the store owner's legal requirement (PRD open question).
```
