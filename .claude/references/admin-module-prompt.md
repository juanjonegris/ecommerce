---
description: /planning prompt for the admin domain module (Step 12.10 of setup guide — Next.js App Router admin dashboards consuming the existing NestJS endpoints).
---

# Admin Module — Planning Prompt

Paste the content below as the argument to `/planning`.

---

Build the `admin` module under apps/web/src/app/[locale]/admin/.

This is a FRONTEND-ONLY module — every backend endpoint it consumes already
exists on the per-domain NestJS modules
(products / categories / orders / payments / discounts / chat / newsletter /
uploads / search / auth). Per setup-guide §12.10: "this is mostly frontend;
the backend endpoints already exist on the per-domain modules". DO NOT add
new NestJS controllers, services, or endpoints. If a backend gap is
discovered during planning, flag it explicitly as a one-line change rather
than expanding scope.

The current stub at apps/web/src/app/[locale]/admin/page.tsx is a
placeholder ("Protected area — access control TBD via middleware") — it
gets REPLACED by the dashboard home (KPI tiles + recent activity).

---

READ FIRST (mandatory before designing):

- apps/web/AGENTS.md — explicit: "This is NOT the Next.js you know. Read
  the relevant guide in `node_modules/next/dist/docs/` before writing any
  code." DO NOT skip this. The execute agent MUST grep
  `apps/web/node_modules/next/dist/docs/01-app/` for the relevant page
  before writing Server Component / Server Action / middleware code. Key
  reference pages live under `01-app/02-guides/` (server actions,
  authentication, data fetching, internationalization) and
  `01-app/03-api-reference/` (cookies, headers, redirect, revalidatePath,
  revalidateTag, NextRequest, NextResponse, route handlers).
- CLAUDE.md root §1, §3, §4, §6, §8 — Server Components by default,
  shared types from @repo/types, Server Actions for mutations, Zod for
  form validation, Playwright with data-testid only for E2E.
- apps/web/src/app/[locale]/products/page.tsx (Server Component fetch
  - setRequestLocale + try/catch render pattern — mirror exactly for
    every admin list page).
- apps/web/src/app/[locale]/products/[slug]/page.tsx (PDP — server fetch
  pattern for detail pages).
- apps/web/src/app/[locale]/cart/page.tsx (Client Component with
  Zustand store + `"use client"` boundary — mirror for the chat inbox
  which needs realtime).
- apps/web/src/app/actions/cart.ts (Server Action pattern with cookies()
  for the bearer token + revalidatePath — mirror EXACTLY for every
  admin mutation action).
- apps/web/src/lib/api.ts (typed fetch wrapper for the storefront —
  EXTEND this pattern in a new apps/web/src/lib/admin/api.ts that
  attaches the admin's bearer token and disables Next.js's revalidate
  cache because admin data is per-user and stale-after-write).
- apps/web/src/middleware.ts (currently only does i18n routing —
  admin auth gating is added at the layout level, NOT here; see "Auth
  & RBAC" below for the rationale).
- apps/web/src/i18n/routing.ts and src/i18n/messages/{en,es}.json
  (existing next-intl wiring — admin adds a top-level "admin" namespace
  to both locale JSONs).
- apps/web/src/config/brand.ts (white-label fork point #1 per PRD §5.3
  — admin sidebar logo / title pull from `brand.name`).
- apps/web/src/providers/query.provider.tsx (TanStack Query provider —
  ALREADY mounted in the layout; admin chat inbox uses
  `useQuery`/`useMutation` here; everywhere else stays Server Component).
- apps/web/components.json + existing shadcn components (button, card,
  dialog, form, input, label, sheet) — admin needs MORE; add them via
  `pnpm dlx shadcn@latest add <name>` (never copy-paste from elsewhere).
- The NestJS modules that admin consumes — read at least the
  controllers to understand the response shapes:
  apps/api/src/modules/products/products.controller.ts,
  apps/api/src/modules/categories/categories.controller.ts,
  apps/api/src/modules/orders/orders.controller.ts,
  apps/api/src/modules/discounts/discounts.controller.ts,
  apps/api/src/modules/newsletter/newsletter.controller.ts,
  apps/api/src/modules/uploads/uploads.controller.ts,
  apps/api/src/modules/chat/chat.controller.ts +
  apps/api/src/modules/chat/chat.gateway.ts (Socket.io namespace
  `/chat`),
  apps/api/src/modules/auth/auth.controller.ts.

NO Prisma changes. NO new @repo/types entries (every shape already
exists). NO new NestJS modules.

---

DOMAIN — what we are building:

Eight authenticated dashboards under `/[locale]/admin/*` for ADMIN and
STAFF users to operate the storefront. Each dashboard is a Server Component
list page with row-level actions (edit / delete / status-transition)
wrapped in shadcn dialogs, plus a Server-Component detail page for
hierarchical or rich-content domains (orders, chat).

White-label posture: every page renders against `brand.name` /
`brand.supportEmail`, and the sidebar's logo + colors come from the same
brand config the storefront uses (PRD §5.3 fork point). No tenantId. No
multi-store routing.

1. **Dashboard home (`/admin`)** — KPI tiles (orders today, revenue
   30d, low-stock products count, open chats count, newsletter
   subscribers PENDING/CONFIRMED) + a 5-row recent-orders table + a
   5-row recent-chats table.
2. **Products (`/admin/products`)** — list + create + edit + soft-delete +
   image upload via presigned PUT (uploads module) + image reorder.
3. **Categories (`/admin/categories`)** — tree view (parent/child),
   create / edit / delete (delete blocked when children exist or
   products reference it — backend already returns 409).
4. **Orders (`/admin/orders`)** — list + detail. Detail shows items,
   customer, payments, discount, status-transition buttons
   (PENDING → CONFIRMED → SHIPPED → DELIVERED, plus CANCELLED at any
   prior status).
5. **Discounts (`/admin/discounts`)** — list + create + edit + delete +
   per-code redemption history (read-only).
6. **Newsletter (`/admin/newsletter`)** — subscriber list (filter by
   status/syncState/provider/search) + per-row force-resync /
   force-unsubscribe / hard-delete buttons.
7. **Chat inbox (`/admin/chat`)** — split view: conversation list on
   left, selected conversation messages on right. Connects to the
   `/chat` Socket.io namespace as ADMIN/STAFF (auto-joins the `admin`
   room) so new customer messages stream in. REST fallback for older
   messages above the scrollback. Reply form + close-conversation button.
8. **Settings (`/admin/settings`)** — read-only page for the MVP: shows
   brand name, locales, current FTS language, current providers
   (payment / newsletter / storage / search), all from env. NO writes —
   env changes are a fork-deploy concern, not a runtime admin task.

EXPLICITLY OUT OF SCOPE for this module:

- User / role management. Admins are created via the seed script or by
  promoting a user in the DB. A future "team management" ticket adds
  this UI.
- Analytics beyond the home-page KPI tiles. No charts, no time-series,
  no funnel reporting. Defer to a dedicated analytics module.
- Audit logs UI. (Backend audit logs aren't even implemented yet.)
- Background job queue monitoring (BullBoard). Defer.
- Newsletter campaign authoring — that lives in Mailchimp/Klaviyo's own
  UI; we only manage subscriber state here.
- Settings WRITE (changing env at runtime). White-label posture is
  fork-deploy; runtime mutation is out of scope.
- Multi-store / tenant switcher. Fork-per-client (PRD §5.3) means one
  admin = one store.
- Bulk import / export. Defer.
- Payments admin (refund UI, dispute UI). The Stripe Dashboard handles
  these — embedding them is a separate ticket.

---

ROUTING LAYOUT (under apps/web/src/app/[locale]/admin/):

The admin section is a **route group** with its own layout so the auth
guard runs once per route group, not per page:

    [locale]/admin/
      layout.tsx                  # auth+role gate; renders AdminShell
      page.tsx                    # dashboard home (REPLACES current stub)
      loading.tsx                 # global admin loading skeleton
      error.tsx                   # global admin error boundary
      not-found.tsx               # 404 for unmatched admin routes
      products/
        page.tsx                  # list
        new/page.tsx              # create form
        [id]/page.tsx             # edit form
      categories/
        page.tsx                  # tree
      orders/
        page.tsx                  # list
        [id]/page.tsx             # detail with status transitions
      discounts/
        page.tsx                  # list
        new/page.tsx              # create
        [id]/page.tsx             # edit + redemption history
      newsletter/
        page.tsx                  # subscriber list
      chat/
        page.tsx                  # split-pane inbox (Client Component)
      settings/
        page.tsx                  # read-only env summary

ALL pages call `setRequestLocale(locale)` first (existing pattern —
mirror `products/page.tsx`). ALL pages export a default async function
that returns Promise<React.ReactElement>.

Pre-render statically? NO — admin routes are dynamic per-request
(per-user data, no caching). Add `export const dynamic = 'force-dynamic';`
to `[locale]/admin/layout.tsx` so the whole subtree opts out of static
generation. This is the cleanest hook; per-page dynamic = 'force-dynamic'
would be repetitive.

---

AUTH & RBAC:

Backend already issues JWTs via `/auth/login` and exposes `/auth/me` for
the current-user check. The frontend currently stores no session cookie
— the cart's `cookies().get('session')` lookup in `app/actions/cart.ts`
references a cookie that isn't being written yet. THE ADMIN MODULE ADDS
THE SESSION COOKIE PATH.

Three pieces:

1. **Login route** — `apps/web/src/app/[locale]/login/page.tsx` (NEW —
   does not yet exist; this is the one piece outside `/admin/*` that
   the admin module owns). Server Component shell + Client Component
   form (`"use client"`). Form submits to a Server Action
   `apps/web/src/app/actions/auth.ts → loginAction(email, password)`
   that calls `POST /auth/login` on the NestJS API, reads
   `accessToken` from the response, and writes it to a `session`
   cookie via Next.js `cookies()` API:
   `cookies().set('session', token, { httpOnly: true, secure: true,
sameSite: 'lax', path: '/', maxAge: 60*60*24*7 })`. After cookie set
   → `redirect('/${locale}/admin')`. Logout action clears the cookie +
   redirects to `/${locale}`.

2. **Auth helper** — `apps/web/src/lib/auth.ts` (NEW):
   `export async function getCurrentUser(): Promise<UserResponseDto | null>`
   reads the session cookie, hits `GET /auth/me` with a bearer header,
   returns null on 401/404, throws on other 5xx. Cached per-request via
   `react.cache` so the layout + page can both call it without two API
   roundtrips.

3. **Layout guard** — `apps/web/src/app/[locale]/admin/layout.tsx`
   (NEW): server-side check via `getCurrentUser()`. If null →
   `redirect('/${locale}/login?next=/admin')`. If user.role !== ADMIN
   AND user.role !== STAFF → `redirect('/${locale}')` (not 403 —
   redirect to the homepage so CUSTOMER users that accidentally land
   on /admin don't see a scary error). Otherwise render the
   <AdminShell user={user}>{children}</AdminShell> wrapper.

DO NOT put the auth check in `middleware.ts`. The existing middleware
runs at the Edge with next-intl routing; adding the JWT verification +
the `/auth/me` roundtrip there is the wrong altitude (Edge cold-start,
no access to the same fetch caching, and we'd need to duplicate the
role check anyway because the JWT payload doesn't include the role —
we have to call `/auth/me` to get it). Layout-level check in Node
runtime is correct.

The session cookie's name is `session` (matches the existing
`addToCartAction` reference — that action becomes useful as soon as
the cookie exists). UpdateMemory note: the cart action stub at
apps/web/src/app/actions/cart.ts line 11 already reads
`cookies().get('session')?.value`; once this module writes the cookie,
the cart action starts working for authenticated users automatically.

---

SHARED ADMIN INFRASTRUCTURE:

Pieces every dashboard uses. ALL Server Components unless explicitly
marked `"use client"`.

apps/web/src/components/admin/admin-shell.tsx — Client Component
(uses `usePathname` for the active-nav highlight). Renders a 3-column
flex layout: left = sidebar nav with 8 links + brand name + user
chip + locale switcher; main = `{children}`; (no right column for MVP).
shadcn components: `Sheet` for mobile drawer, `Separator`, `Avatar`.
Uses next-intl's `Link` from `@/i18n/routing` (NOT next/link) for
locale-aware navigation.

apps/web/src/components/admin/admin-breadcrumbs.tsx — Server Component.
Derives breadcrumbs from the URL pathname. Each segment is a localized
label from the `admin.nav.*` message keys.

apps/web/src/components/admin/kpi-tile.tsx — Server Component. Card
with label, big number, optional sublabel (delta vs previous period).
Renders a small skeleton variant if data is loading via Suspense
boundary.

apps/web/src/components/admin/data-table.tsx — Client Component
(needs sorting/filtering state). Generic over row type. Built on shadcn
Table + the table-row composition pattern; takes
`columns: { key, header, cell }[]` and `rows: T[]`. Sorting + filtering
state stays in URL search params (NOT useState) so admins can
bookmark/share a filtered view. NO TanStack Table dependency — for
MVP the manual composition is enough; revisit if a dashboard needs
virtualization.

apps/web/src/components/admin/status-badge.tsx — Server Component.
Maps OrderStatus / NewsletterStatus / NewsletterSyncState / PaymentStatus
/ ProductImageStatus enums to colored shadcn `Badge` variants. ONE file
per enum mapping or one shared map — pick in the plan.

apps/web/src/components/admin/confirm-dialog.tsx — Client Component.
shadcn `AlertDialog` wrapper for destructive actions (delete, force
unsubscribe). Receives a Server Action prop and calls it on confirm.

apps/web/src/components/admin/empty-state.tsx — Server Component.
Card with icon + label + optional CTA button. Used by every list page's
no-rows render path.

apps/web/src/lib/admin/api.ts — typed fetch wrapper. Mirror
`apps/web/src/lib/api.ts` but: (a) reads the session cookie via
`cookies()` and attaches `Authorization: Bearer <token>`, (b) sets
`cache: 'no-store'` instead of `revalidate: 60` because admin data is
per-user and stale-after-write, (c) re-exports typed helpers per
domain (getAdminProducts, listOrders, listSubscribers, etc.). Each
helper returns the shape from @repo/types directly. 401 responses
throw a typed `AdminAuthError` the layout's error.tsx catches and
redirects.

apps/web/src/lib/admin/format.ts — formatters for price (locale-aware
`Intl.NumberFormat`), date (`Intl.DateTimeFormat`), relative date
(`Intl.RelativeTimeFormat` for "3 minutes ago" timestamps in the chat
inbox). PASS LOCALE EXPLICITLY — these are called from Server
Components which DON'T have access to the runtime locale; the calling
page passes it down.

apps/web/src/app/actions/admin/<domain>.ts — Server Actions per
domain. EACH ACTION:

- is `'use server'`
- reads the session cookie via `cookies()`
- calls the NestJS endpoint with `Authorization: Bearer <token>`
- throws on non-2xx (the form's `useFormState` catches it)
- `revalidatePath('/${locale}/admin/<domain>')` on success
- returns the updated entity (or void) for optimistic UI

---

PER-DOMAIN DASHBOARDS:

For each, the plan should specify: route, server-component data fetches,
client-component boundaries, Server Actions, and shadcn components
used. The descriptions below are MVP scope — keep them tight.

### Dashboard home — `/admin`

REPLACES the existing page.tsx stub. Five KPI tiles via `<KpiTile>`:
"Orders today" (`GET /orders?status=&page=1&limit=50` — count today's
client-side), "Revenue 30d" (sum of order.total for last 30d), "Low
stock" (`GET /products?stock=lt:10` — IF the backend supports this
filter; otherwise CLIENT-side filter the first page and flag the gap
as a backend follow-up), "Open chats" (`GET /chat?status=OPEN&limit=1`
→ use response.total), "Newsletter pending"
(`GET /newsletter?status=PENDING&limit=1` → response.total). Below the
tiles: 5-row recent-orders + 5-row recent-chats Cards.

### Products — `/admin/products`

List page: `<DataTable>` columns = [thumbnail (first image),
name (link to edit), price, stock, category, status (isActive Badge),
actions menu]. Filters: search (debounced 300ms client-side, passed as
URL param), category select, isActive toggle. Sorts: name / price /
stock / createdAt. Top-right: "New product" button → `/admin/products/new`.

New page: shadcn `Form` (`react-hook-form` + `zodResolver`) with fields
[name, description (Textarea — ADD), price, stock, categoryId
(Select — ADD)]. Submit calls `createProductAction` Server Action which
POSTs to `/products`, then `redirect('/admin/products/[id]')`.

Edit page (`/admin/products/[id]`): same form pre-filled. PLUS an
"Images" section with: drag-to-reorder thumbnails (use HTML5 drag
events — no extra dep), per-thumb "Delete" button, "Upload image" CTA
that calls `presignAndUploadAction` (Server Action: POSTs
`/uploads/product-images/presign` → returns presigned URL → frontend
PUTs the file directly to S3 → POSTs `/uploads/product-images/:id/confirm`).
Confirm + reorder both trigger `revalidatePath`.

Server Actions: createProductAction, updateProductAction, deleteProductAction,
presignAndUploadAction, deleteImageAction, reorderImagesAction.

### Categories — `/admin/categories`

Single page with a recursive `<CategoryTreeNode>` Client Component. Each
node has [name, slug, children count, "Add child" button, "Edit" button,
"Delete" button]. Edit / delete via shadcn `Dialog`s. Backend 409 on
delete-with-children OR delete-with-products surfaces as a `<Toast>`
("Cannot delete: category has X children / Y products"). Toast added
via shadcn `sonner` (the modern shadcn toast preset).

Server Actions: createCategoryAction, updateCategoryAction,
deleteCategoryAction.

### Orders — `/admin/orders`

List page: `<DataTable>` columns = [order ID short, customer email or
"Guest", total formatted, status Badge, createdAt formatted, actions
"View"]. Filters: status select, customer search (email substring),
date range. Sorts: createdAt / total.

Detail page (`/admin/orders/[id]`): 3-section layout — left:
items table; right top: customer card; right middle: payment(s) card
(provider, providerPaymentId, amount, status); right bottom: discount
card (if applied) showing code + amountApplied; bottom: status
transition buttons. Status buttons are server-side: each calls
`updateOrderStatusAction(id, newStatus)`. Buttons disabled per the
state machine (CANCELLED is terminal; SHIPPED → DELIVERED only;
DELIVERED is terminal; CANCELLED button available at every prior
state).

Server Actions: updateOrderStatusAction.

### Discounts — `/admin/discounts`

List page: `<DataTable>` columns = [code, percent or amount off,
expiresAt, isActive Badge, redemptions count, actions]. Top-right:
"New discount" button.

New / edit pages: form with [code, type radio (percent / amount),
percentOff OR amountOff (conditional render), expiresAt (date picker
— ADD `Calendar` + `Popover` shadcn components), isActive switch].
Zod schema enforces "exactly one of percentOff / amountOff".

Detail page: `<DataTable>` of redemptions [orderId link, amountApplied,
createdAt]. Backend already returns this via
`GET /discounts/:id/redemptions` (verify the endpoint exists; if not,
flag as a one-line backend addition).

Server Actions: createDiscountAction, updateDiscountAction,
deleteDiscountAction.

### Newsletter — `/admin/newsletter`

List page: `<DataTable>` columns = [email, status Badge, source,
provider, syncState Badge, lastSyncAt, actions menu]. Filters: status
select, syncState select, provider select, search (email substring,
debounced). Actions menu (shadcn `DropdownMenu`): "Force resync"
(POST `/newsletter/:id/resync` — disabled if provider doesn't match
the backend's bound provider; backend returns 409 → Toast), "Force
unsubscribe" (`POST /newsletter/:id/unsubscribe`), "Delete (GDPR)"
(`DELETE /newsletter/:id` — wrapped in `<ConfirmDialog>`).

Server Actions: forceResyncAction, forceUnsubscribeAction,
deleteSubscriberAction.

### Chat inbox — `/admin/chat`

The ONE major Client Component page (`"use client"`). Split-pane:
left = conversation list (sorted by status ASC then lastMessageAt
DESC — matches the backend's existing sort), right = message thread

- reply form.

Realtime via `socket.io-client` (ADD as dependency). Connect to
`http://localhost:3001/chat` with `auth: { token: <bearer from
cookies — fetched via a tiny Server Component wrapper that passes it
as a prop> }`. Subscribe to `message:new` events; on receive, optimistically
append to the conversation if it's the open one OR bump the conversation
to the top of the list with an unread badge.

REST fallback for paginated message history:
`GET /chat/:id/messages?before=<cursor>` (verify the cursor shape
matches the backend's chat module).

Reply form: shadcn `Input` + `Button`. Submit emits `message:send` on
the socket (the gateway already handles this) AND optimistically
appends locally; rollback on socket ack error.

Close conversation: button calls `PATCH /chat/:id` with
`{ status: 'CLOSED' }` via a Server Action (NOT the socket — the
gateway handles closes too but using REST keeps the action
revalidatePath-able).

Use TanStack Query (`useQuery`/`useMutation` — already mounted in the
layout via `query.provider.tsx`) for the conversation list + messages
so the cache survives between left-pane selections.

### Settings — `/admin/settings`

Read-only card grid showing: brand name (from `brand.ts`), supported
locales, FTS language (from a NEW `/admin/runtime-config` endpoint? NO
— pass via env at build time: `process.env.SEARCH_FTS_LANGUAGE` →
served via a tiny Server Action `getAdminRuntimeInfo()` that reads
`process.env` server-side and returns a sanitized DTO). Lists the
currently-bound provider names (payment / newsletter / storage /
search) likewise. NO writes.

---

SERVER ACTIONS PATTERN:

Every Server Action follows this shape (copy verbatim — the typing is
non-obvious otherwise):

    'use server';

    import { cookies } from 'next/headers';
    import { revalidatePath } from 'next/cache';
    import { redirect } from 'next/navigation';
    import type { Product } from '@repo/types';

    const API_URL = process.env.API_URL ?? 'http://localhost:3001';

    export async function updateProductAction(
      id: string,
      input: { name?: string; price?: number; … },
    ): Promise<Product> {
      const token = (await cookies()).get('session')?.value;
      if (!token) redirect('/login');

      const res = await fetch(`${API_URL}/products/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
        cache: 'no-store',
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Update failed: ${res.status} ${err}`);
      }
      const product = (await res.json()) as Product;
      revalidatePath('/[locale]/admin/products', 'page');
      revalidatePath(`/[locale]/admin/products/${id}`, 'page');
      return product;
    }

Form components consume actions via the new (Next.js 15) `useActionState`
hook + the form's `action` prop. Validation client-side via Zod +
`react-hook-form` + `@hookform/resolvers/zod` (already installed) so
the form can refuse to submit invalid input without a server roundtrip.
Server Actions ALSO validate via Zod as the boundary
("validate at boundaries" — CLAUDE.md §1).

---

SHADCN/UI COMPONENTS TO ADD:

Run `pnpm dlx shadcn@latest add <name>` for each (NEVER copy-paste):

table, tabs, dropdown-menu, badge, select, alert-dialog, alert,
separator, skeleton, avatar, scroll-area, popover, calendar,
sonner (toast), textarea, switch, command (for the search-bar
combo in conversation/customer search), tooltip

`sonner` is the current shadcn toast preset (replaces the deprecated
`toast` component). The `Toaster` mounts ONCE in the admin layout.

---

I18N:

Add a top-level `admin` namespace to `apps/web/src/i18n/messages/en.json`
AND `es.json`. Both files MUST have the same key tree — next-intl
TypeScript types catch divergence at compile time.

Suggested structure:

    "admin": {
      "nav": { "dashboard": "...", "products": "...", … },
      "common": { "save": "Save", "cancel": "Cancel", "delete": "Delete",
                  "confirm": "Confirm", "loading": "Loading…",
                  "empty": "No results", "error": "Something went wrong" },
      "products": { … },
      "categories": { … },
      "orders": { "status": { "PENDING": "Pending", "CONFIRMED": "Confirmed", … } },
      "discounts": { … },
      "newsletter": { … },
      "chat": { … },
      "settings": { … }
    }

Pages use `useTranslations('admin.products')` (Client Components) OR
`getTranslations('admin.products')` (Server Components — from
`next-intl/server`).

---

DEPENDENCIES TO INSTALL (apps/web):

Runtime:

- `socket.io-client` — for the chat inbox realtime connection.

NO new dev deps. NO TanStack Table (the manual data-table is
sufficient for MVP). NO date-fns (use `Intl.*` formatters per
CLAUDE.md §3 — locale-aware out of the box).

Verify with `pnpm --filter @repo/web list --depth=0` after install.

---

ENV / CONFIG:

NO new env keys for this module. Reuses:

- `API_URL` — already set.
- `process.env.SEARCH_FTS_LANGUAGE`, `process.env.NEWSLETTER_PROVIDER`,
  `process.env.SEARCH_PROVIDER`, etc. — read server-side via the
  `getAdminRuntimeInfo` Server Action for the settings page. These
  must be present in apps/web's env (forward them in
  `next.config.ts`'s `env` block IF the build-time inlining is
  needed — but Server Actions read `process.env` at runtime, so
  they don't need next.config.ts inlining). The plan should pick one
  approach.

---

TESTS:

Playwright E2E ONLY (per CLAUDE.md §6). Page Object Model under
`apps/web/e2e/pages/admin/*.page.ts`, tests under
`apps/web/e2e/tests/admin/*.spec.ts`. ALL selectors are `data-testid`.

Golden-path coverage (each is one spec file):

- **admin-login.spec.ts** — visit `/en/login`, submit valid admin
  credentials (seeded admin), assert redirect to `/en/admin`, assert
  the dashboard renders with the admin's email visible in the header.
- **admin-product-create.spec.ts** — login as admin, click "New
  product", fill name + price + category, submit, assert redirect to
  edit page, assert the product appears in the list at
  `/en/admin/products` AND on the public storefront at `/en/products`.
- **admin-order-status.spec.ts** — login as admin, navigate to an
  existing PENDING order's detail, click "Mark confirmed", assert
  status Badge updates to CONFIRMED, assert the timeline reflects it.
- **admin-newsletter-resync.spec.ts** — login as admin, navigate to
  `/en/admin/newsletter`, find a subscriber with syncState=FAILED
  (seeded), click "Force resync", assert syncState transitions to
  PENDING_SYNC.
- **admin-rbac.spec.ts** — log out, visit `/en/admin` →
  redirect to `/en/login`. Log in as a CUSTOMER → visit `/en/admin`
  → redirect to `/en/`.

Chat inbox is NOT covered by Playwright in this PR — Socket.io flakes
in E2E unless you fix-up tons of timing. Add it as a future ticket
with a `playwright-test/test-with-real-server` retry strategy.

Page Object Model expectations:

- Each Page Object exposes intent-level methods (`fillEmail`, `submit`,
  `expectSuccess`, `expectError`) — no CSS selectors inside spec files.
- All interactive elements get `data-testid` attributes during
  implementation. Naming: `admin-<page>-<element>` (e.g.
  `admin-products-create-button`, `admin-products-name-input`).

---

VALIDATE after implementation:

# Backend must be running with seeded data

docker compose up -d postgres redis minio
pnpm --filter @repo/api prisma:migrate
pnpm --filter @repo/api db:seed
pnpm --filter @repo/api dev

# Frontend checks

pnpm --filter @repo/web typecheck
pnpm --filter @repo/web lint
pnpm --filter @repo/web build # admin should pre-render only NOT at all
pnpm --filter @repo/web dev

# Manual smoke (in another terminal):

# 1. Visit http://localhost:3000/en/login as admin (admin@example.com / admin123)

# → redirected to /en/admin

# 2. Sidebar shows 8 dashboards. Click each — none 404.

# 3. Create a product, upload an image (presigned PUT), reorder images.

# 4. Visit /en/products on the storefront — the new product appears.

# 5. Find an order, transition through statuses.

# 6. Open the chat inbox; from another browser (incognito) start a guest

# conversation; verify the message arrives in admin in real time.

# 7. Subscribe to the newsletter from /en footer (when implemented) OR

# via curl; verify it shows in /en/admin/newsletter.

# 8. Log out → /en/admin redirects to /en/login.

# 9. Log in as a seeded CUSTOMER user → /en/admin redirects to /en/.

# Playwright

pnpm --filter @repo/web test:e2e

open http://localhost:3000/en/admin # the dashboard home
open http://localhost:3001/docs # the backend endpoints admin consumes
