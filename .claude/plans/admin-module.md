# Feature: admin-module

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Frontend-only admin dashboards under `apps/web/src/app/[locale]/admin/*`
consuming the existing NestJS endpoints. Eight authenticated dashboards
(home / products / categories / orders / discounts / newsletter / chat /
settings) for ADMIN and STAFF roles, plus a login route that finally
establishes the session cookie the cart Server Action already reads.
Replaces the existing `/admin/page.tsx` stub. NO new NestJS modules,
controllers, or Prisma changes — every consumed endpoint already ships.
Three backend GAPS deferred (low-stock filter, discount redemption
history, orders?discountCodeId — see D7) and called out in the execution
report.

## User Story

As an ADMIN or STAFF user
I want a dashboard to operate the storefront (catalog / orders / chat /
subscribers / discounts) without touching the API or DB directly
So that day-to-day store operation is keyboard-driven and not engineer-
driven.

## Problem Statement

Setup-guide §12.10 calls for admin dashboards: "this is mostly frontend;
the backend endpoints already exist on the per-domain modules". Today
`/[locale]/admin/page.tsx` is a 19-line placeholder that says "access
control TBD"; there is no login page, no session-cookie path, no
admin-side fetch wrapper, no shared layout, no dashboards. The
`cart.ts` Server Action already reads `cookies().get('session')`
(line 11), but nothing in the codebase writes that cookie — so even
authenticated cart additions silently fall through.

## Solution Statement

Establish the auth path (login route + `loginAction` writes the
`session` cookie + `getCurrentUser()` helper + layout-level guard);
build the admin shell (sidebar / header / breadcrumbs / shadcn-based
shared components); build eight Server-Component dashboards consuming
the existing NestJS endpoints via a new `lib/admin/api.ts` that
attaches the bearer token and disables Next's revalidate cache;
mutations through Server Actions that revalidate paths on success.
Realtime chat inbox is the ONE Client Component page using
`socket.io-client` + TanStack Query.

---

## ARCHITECTURAL DECISIONS

- **D1 — Next.js 16 + React 19**. The codebase is on `next@16.2.4`
  and `react@19.2.4`. `apps/web/AGENTS.md` is explicit: "This is NOT
  the Next.js you know. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing any code." THIS IS NOT
  OPTIONAL — Server Actions, `cookies()`, `redirect()`, `revalidatePath`,
  and the new `useActionState` hook all changed shapes in Next 15/16
  relative to common training data. Read
  `node_modules/next/dist/docs/01-app/02-guides/{authentication,server-actions,data-fetching,internationalization}.md`
  and `01-app/03-api-reference/{cookies,headers,redirect,revalidatePath,revalidateTag}.md`
  BEFORE writing any of those calls.
- **D2 — Auth guard at the LAYOUT, not middleware**. The role check
  needs a `/auth/me` roundtrip (the JWT payload carries role-less
  identity); doing that in Edge middleware is the wrong altitude.
  Layout-level check runs in Node runtime, can cache via
  `react.cache`, and only triggers on requests that actually reach
  `/admin/*`.
- **D3 — Session cookie established by this PR**. Cookie name
  `session`, attributes
  `{ httpOnly: true, secure: true, sameSite: 'lax', path: '/',
maxAge: 60*60*24*7 }`. `loginAction` writes it; `logoutAction`
  clears it. The existing `cart.ts` Server Action immediately benefits
  because it already reads this cookie name.
- **D4 — Stale-after-write via `cache: 'no-store'`** in
  `lib/admin/api.ts`. Admin data is per-user and changes immediately
  on mutation — Next's `revalidate: 60` (used by the public storefront)
  would show stale rows to admins after they edit. Server Actions
  call `revalidatePath(...)` to invalidate the affected page on
  success.
- **D5 — Filters and pagination live in URL search params**, not
  Zustand. Bookmarkable, shareable, survives reloads. The cart store
  remains the ONLY Zustand store; admin pages are stateless.
- **D6 — Login page lives at `/[locale]/login`**, OUTSIDE `/admin/*`.
  It's owned by this module (the only auth UI surface) but its route
  group is the root `[locale]` group, not the admin one.
- **D7 — Three backend gaps deferred** (none blocks MVP):
  - **Low-stock filter** on `/products` (no `stock=lt:N` query): the
    home page's "Low stock" tile fetches the first page of products
    and filters `stock < 10` in JS. Acceptable while catalog ≤ 50
    items.
  - **Discount redemption history**: no `GET /discounts/:id/redemptions`
    endpoint. Detail page shows a counter only (`_count.redemptions`,
    already returned by the existing `GET /discounts/:id`); the full
    audit table is a follow-up backend ticket.
  - **Orders by discount code**: no `GET /orders?discountCodeId=...`.
    Not needed because of the deferral above.
- **D8 — Chat inbox is the ONE Client Component page**. Everything
  else is Server Component. The boundary is `"use client"` at the
  top of `app/[locale]/admin/chat/page.tsx`.
- **D9 — TanStack Query is used ONLY by the chat inbox** for
  conversation list + messages cache. The provider is already mounted
  in the layout (`apps/web/src/providers/query.provider.tsx`); other
  pages don't touch it.
- **D10 — Playwright golden-path-only**. 5 specs total (login, product
  create + storefront verify, order status transition, newsletter
  resync, RBAC). Chat realtime explicitly deferred — Socket.io flakes
  in headless E2E without elaborate retry infra.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `apps/web/AGENTS.md` + `apps/web/CLAUDE.md` — the AGENTS.md mandate
  is BLOCKING; read the Next.js shipped docs first.
- `apps/web/node_modules/next/dist/docs/01-app/02-guides/` and
  `01-app/03-api-reference/` — per D1.
- `apps/web/src/app/[locale]/products/page.tsx` — canonical Server
  Component page (locale + try/catch fetch + render). Mirror every
  admin list page.
- `apps/web/src/app/[locale]/products/[slug]/page.tsx` — detail-page
  pattern.
- `apps/web/src/app/[locale]/cart/page.tsx` — Client Component pattern
  with Zustand store + `"use client"` boundary. Mirror for the chat
  inbox.
- `apps/web/src/app/actions/cart.ts` — Server Action shape (`'use server'`
  - `cookies()` + bearer + revalidatePath). Mirror EXACTLY for every
    admin mutation action.
- `apps/web/src/lib/api.ts` — typed fetch wrapper. EXTEND in a new
  `lib/admin/api.ts` (token + no-store).
- `apps/web/src/middleware.ts` — current i18n-only middleware; do NOT
  add auth here (D2).
- `apps/web/src/i18n/routing.ts` — next-intl routing + the `Link`
  export to use in the AdminShell sidebar (NOT `next/link` —
  locale-aware).
- `apps/web/src/i18n/messages/{en,es}.json` — existing key tree to
  extend with the `admin.*` namespace.
- `apps/web/src/providers/query.provider.tsx` — TanStack Query
  provider, already mounted.
- `apps/web/src/config/brand.ts` — white-label fork point #1; admin
  shell pulls `brand.name` for the sidebar title.
- `apps/web/src/components/ui/*` — installed shadcn primitives
  (button, card, dialog, form, input, label, sheet). NEEDS more (see
  Task 2).
- `apps/web/package.json` — verify before adding deps:
  `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`,
  `zod`, `zustand`, `lucide-react`, `class-variance-authority`,
  `tailwind-merge` already installed. Only `socket.io-client` to add.
- NestJS controllers that admin consumes (read at least one method
  per to understand response shapes):
  `apps/api/src/modules/products/products.controller.ts`,
  `apps/api/src/modules/categories/categories.controller.ts`,
  `apps/api/src/modules/orders/orders.controller.ts`,
  `apps/api/src/modules/discounts/discounts.controller.ts`,
  `apps/api/src/modules/newsletter/newsletter.controller.ts`,
  `apps/api/src/modules/uploads/uploads.controller.ts`,
  `apps/api/src/modules/chat/chat.controller.ts` +
  `apps/api/src/modules/chat/chat.gateway.ts` (Socket.io namespace
  `/chat`),
  `apps/api/src/modules/auth/auth.controller.ts`.

### New Files to Create

Under `apps/web/src/app/[locale]/`:

- `login/page.tsx` (Server Component shell)
- `login/login-form.tsx` (Client Component form)

Under `apps/web/src/app/[locale]/admin/`:

- `layout.tsx` (guard + AdminShell)
- `loading.tsx`, `error.tsx`, `not-found.tsx`
- `page.tsx` (REPLACES existing stub)
- `products/page.tsx`, `products/new/page.tsx`, `products/[id]/page.tsx`,
  `products/[id]/product-form.tsx` (Client Component for the form),
  `products/[id]/image-manager.tsx` (Client Component for upload + reorder)
- `categories/page.tsx`, `categories/category-tree.tsx` (Client)
- `orders/page.tsx`, `orders/[id]/page.tsx`,
  `orders/[id]/status-buttons.tsx` (Client)
- `discounts/page.tsx`, `discounts/new/page.tsx`,
  `discounts/[id]/page.tsx`, `discounts/discount-form.tsx` (Client)
- `newsletter/page.tsx`, `newsletter/row-actions.tsx` (Client)
- `chat/page.tsx` (Client — the whole page)
- `settings/page.tsx`

Under `apps/web/src/app/actions/`:

- `auth.ts` (loginAction, logoutAction)
- `admin/products.ts`, `admin/categories.ts`, `admin/orders.ts`,
  `admin/discounts.ts`, `admin/newsletter.ts`, `admin/uploads.ts`,
  `admin/chat.ts`

Under `apps/web/src/lib/`:

- `auth.ts` (`getCurrentUser` server helper)
- `admin/api.ts` (typed fetch with bearer + no-store; per-domain helpers)
- `admin/format.ts` (`formatPrice`, `formatDate`, `formatRelative`)

Under `apps/web/src/components/admin/`:

- `admin-shell.tsx` (Client — sidebar + header)
- `admin-breadcrumbs.tsx`
- `kpi-tile.tsx`
- `data-table.tsx` (Client)
- `status-badge.tsx`
- `confirm-dialog.tsx` (Client)
- `empty-state.tsx`

Under `apps/web/src/i18n/messages/{en,es}.json`:

- Add `admin.*` namespace (both files MUST mirror).

Under `apps/web/e2e/`:

- `pages/admin/*.page.ts` (5 POMs)
- `tests/admin/*.spec.ts` (5 golden-path specs)

### Files to MODIFY

`apps/web/src/app/[locale]/admin/page.tsx` (replace stub);
`apps/web/package.json` (add `socket.io-client`);
`apps/web/components.json` (no change — only adds via `shadcn add`).

### Patterns to Follow

Server Components by default; `"use client"` only for forms,
drag/reorder, sidebar active-state, chat inbox, image upload, and
status-button optimistic state. Server Action shape: `'use server'`
→ `cookies().get('session')` → fetch with bearer → throw on non-2xx
→ `revalidatePath(...)` → return entity (mirror
`apps/web/src/app/actions/cart.ts:1-22`). Forms via `react-hook-form`

- `@hookform/resolvers/zod`; server actions ALSO re-validate.
  Locale-aware nav via `Link` from `@/i18n/routing` (NOT `next/link`).
  `data-testid="admin-<page>-<element>"` on every interactive element.
  i18n: server pages use `getTranslations('admin.<page>')` from
  `next-intl/server`; clients use `useTranslations(...)`. Errors:
  throw from Server Actions; `error.tsx` renders a recoverable
  boundary; 401 → layout-level catch redirects to `/login`.

---

## IMPLEMENTATION PLAN

1. **Pre-flight + foundation** — verify backend gaps (D7); install
   `socket.io-client` + 15 shadcn components; add `admin.*` i18n keys.
2. **Auth path** — login page + form + Server Action + cookie write;
   `getCurrentUser` helper; layout guard.
3. **Shared admin infra** — `lib/admin/api.ts` + `format.ts`;
   AdminShell + breadcrumbs; reusable components (DataTable,
   StatusBadge, ConfirmDialog, EmptyState, KpiTile); admin layout.
4. **Dashboards** — home → products → categories → orders →
   discounts → newsletter → chat → settings (in order; each is
   independently testable).
5. **Tests + validation** — 5 Playwright POMs + specs; lint /
   typecheck / build / E2E green.

---

## STEP-BY-STEP TASKS

Execute every task in order. The 8 dashboards (Tasks 12-19) all
follow the same shape — Server Component list page using
`getAdmin<Domain>()` + `<DataTable>` + per-row actions Server Action
files. Per-dashboard tasks are intentionally tight.

### Task 1 — Verify backend gaps (NO code)

Confirm D7 by greping the API: (a) no `stock` field in
`find-products-query.dto.ts` → client-side filter; (b) no
`:id/redemptions` route → counter only; (c) no
`orders?discountCodeId` filter → not needed. Document in the
execution report.

### Task 2 — Install deps + shadcn components

- **IMPLEMENT**:
  `pnpm --filter @repo/web add socket.io-client`
  Then 15 shadcn components in one run:
  `pnpm --filter @repo/web exec shadcn@latest add table tabs dropdown-menu badge select alert-dialog alert separator skeleton avatar scroll-area popover calendar sonner textarea switch command tooltip`
  (run in `apps/web/`).
- **GOTCHA**: shadcn v4 + `@base-ui/react` is the current preset (not
  Radix). The components installed above pull from base-ui under the
  hood — read each newly-generated file before composing.

### Task 3 — UPDATE `apps/web/src/i18n/messages/en.json` AND `es.json`

- **IMPLEMENT**: Add a top-level `"admin"` namespace to BOTH files.
  Key tree:
  `admin.nav.{dashboard,products,categories,orders,discounts,newsletter,chat,settings,logout}`,
  `admin.common.{save,cancel,delete,confirm,loading,empty,error,back}`,
  `admin.dashboard.{ordersToday,revenue30d,lowStock,openChats,newsletterPending,recentOrders,recentChats}`,
  `admin.products.{title,new,name,description,price,stock,category,active,images,uploadImage,reorderHint}`,
  `admin.categories.{title,new,addChild,parent,deleteBlocked}`,
  `admin.orders.{title,status.PENDING,status.CONFIRMED,status.SHIPPED,status.DELIVERED,status.CANCELLED,total,customer,items,payments,timeline}`,
  `admin.discounts.{title,new,code,percentOff,amountOff,expiresAt,redemptionsCount,oneOf}`,
  `admin.newsletter.{title,resync,forceUnsubscribe,deleteGdpr,syncMismatch}`,
  `admin.chat.{title,closed,open,reply,closeConversation,unread}`,
  `admin.settings.{title,brand,locales,providers,readOnly}`,
  `admin.login.{title,email,password,submit,invalid}`.
- **GOTCHA**: next-intl's TS types compile against BOTH locale files —
  any key present in one and missing in the other fails typecheck.
  Diff the two trees before committing.

### Task 4 — CREATE `apps/web/src/lib/auth.ts`

- **IMPLEMENT**: Export `getCurrentUser(): Promise<UserResponseDto | null>`.
  Use `import { cache } from 'react'` to memoize per-request. Read the
  `session` cookie via `await cookies()` from `next/headers`. If
  missing → return null. Else GET `${API_URL}/auth/me` with
  `Authorization: Bearer <token>` and `cache: 'no-store'`. On 401/404
  return null. On 5xx throw. Type the response from `@repo/types`
  (UserResponseDto / User — verify the exact export name).
- **PATTERN**: `cart.ts:11` for the cookie read; the wrapper itself
  is new.
- **GOTCHA**: `cookies()` is async in Next 15+ — `await` it.

### Task 5 — CREATE `apps/web/src/app/actions/auth.ts`

- **IMPLEMENT**: Two Server Actions:
  - `loginAction(prevState, formData): Promise<{ error?: string }>` —
    extracts email/password from `formData`, validates via Zod, POSTs
    `${API_URL}/auth/login`, reads `accessToken`, sets the `session`
    cookie per D3, then `redirect(\`/${locale}/admin\`)`via`redirect`from`next/navigation`. On non-2xx returns
`{ error: '...' }` (the form renders it).
  - `logoutAction(locale: string)` — clears the cookie via
    `cookies().delete('session')`, redirects to `/${locale}`.
- **GOTCHA**: `redirect()` throws — DO NOT wrap in try/catch (Next.js
  intercepts). For the `useActionState` hook to receive a result, the
  action returns the error object BEFORE the redirect call; success
  path redirects, never returns.

### Task 6 — CREATE `apps/web/src/app/[locale]/login/page.tsx` and `login-form.tsx`

- **IMPLEMENT**: `page.tsx` is a Server Component — calls
  `setRequestLocale(locale)`, reads `?next=` from `searchParams`,
  renders `<LoginForm next={next}>`. `login-form.tsx` is
  `"use client"` — uses `useActionState(loginAction, { error: undefined })`
  - shadcn `Form` + react-hook-form + Zod (`email().min(1)` +
    `string().min(1)`). On error, renders the error message; on
    success, the action redirects so this component never sees it.
- **PATTERN**: `cart/page.tsx` for the client-component split.
- **GOTCHA**: Next 16's `useActionState` is from `react` not
  `react-dom` (changed in 19); `useFormStatus` is from
  `react-dom`. Verify imports in the docs.

### Task 7 — CREATE `apps/web/src/lib/admin/api.ts`

- **IMPLEMENT**: A `fetchAdmin<T>(path, opts?)` helper that:
  reads the `session` cookie, throws `AdminAuthError` (NEW typed
  class, exported) if missing OR if the response is 401/403, attaches
  `Authorization: Bearer <token>`, sets `cache: 'no-store'`, returns
  `await res.json() as T`. On other non-2xx throws `Error(\`Admin
  ${path}: \${res.status}\`)`.
  Then per-domain typed helpers — pick names and shapes from the
  NestJS controllers verified in Task 1:
  `getAdminProducts(query)`, `getAdminProduct(id)`,
  `listCategories()`, `listOrders(query)`, `getOrder(id)`,
  `listDiscounts(query)`, `getDiscount(id)`, `listSubscribers(query)`,
  `getRuntimeInfo()`(the settings page — server-side reads
 `process.env`),
  `listConversationsForAdmin(query)`, `getConversation(id)`,
  `getMessages(conversationId, cursor?)`.
- **PATTERN**: `apps/web/src/lib/api.ts`.
- **GOTCHA**: The `AdminAuthError` is what `error.tsx` catches to
  redirect to `/login`. Other errors render as the recoverable
  boundary.

### Task 8 — CREATE `apps/web/src/lib/admin/format.ts`

- **IMPLEMENT**: `formatPrice(value, locale, currency = 'USD')`,
  `formatDate(date, locale)`, `formatRelative(date, locale)`. All
  use `Intl.{NumberFormat,DateTimeFormat,RelativeTimeFormat}`. ALL
  accept locale as an arg (Server Components don't have implicit
  access to the runtime locale).

### Task 9 — CREATE shared admin components

Under `apps/web/src/components/admin/`:

- **`admin-shell.tsx`** — `"use client"`. Layout: shadcn `Sheet` for
  mobile, fixed left sidebar at md+, top header with user chip
  (`<Avatar>` + email + dropdown including `logoutAction`-bound
  form), locale switcher. Nav uses the existing `Link` from
  `@/i18n/routing` — 8 entries. `usePathname()` highlights the
  active link.
- **`admin-breadcrumbs.tsx`** — Server Component. Derives from
  pathname. Each segment is i18n'd via `admin.nav.*`.
- **`kpi-tile.tsx`** — Server Component. `<Card>` with label + big
  number + optional sublabel + optional `<Skeleton>` slot for
  Suspense-wrapped loading.
- **`data-table.tsx`** — `"use client"`. Generic over `T`. Props:
  `columns: { key, header, cell, sortable? }[]`, `rows: T[]`,
  `searchParam?: string` (controls debounced input), `sortParam?: string`,
  `pageParam?: string`. Reads/writes from URL search params via
  `useSearchParams` + `useRouter`. Uses shadcn `Table` + a small
  search `Input` above. NO TanStack Table dep.
- **`status-badge.tsx`** — Server Component. One `<Badge>` per enum
  value with a `variant` map. Handles OrderStatus, NewsletterStatus,
  NewsletterSyncState, PaymentStatus, ProductImageStatus in one file.
- **`confirm-dialog.tsx`** — `"use client"`. shadcn `AlertDialog`
  wrapper. Receives `action: () => Promise<void>` and renders a
  "Confirm" button that calls it then closes.
- **`empty-state.tsx`** — Server Component. `<Card>` with optional
  CTA.

### Task 10 — CREATE `apps/web/src/app/[locale]/admin/layout.tsx`

- **IMPLEMENT**: `export const dynamic = 'force-dynamic';` at the top.
  Server Component. Calls `setRequestLocale(locale)`. Awaits
  `getCurrentUser()`. If null → `redirect(\`/${locale}/login?next=/admin\`)`.
  If user.role !== ADMIN && user.role !== STAFF →
  `redirect(\`/${locale}\`)`. Else renders `<AdminShell user={user}>
  {children}</AdminShell>`+`<Toaster />`(the shadcn`sonner` toast
  mount, ONCE per app subtree).
- **PATTERN**: existing storefront layout for setRequestLocale;
  redirect from `next/navigation`.
- **GOTCHA**: Without `force-dynamic`, Next would try to statically
  render — and the cookies/auth read would crash at build time.

### Task 11 — CREATE `apps/web/src/app/[locale]/admin/{loading,error,not-found}.tsx`

- **IMPLEMENT**: `loading.tsx` renders a few `<Skeleton>` rows.
  `error.tsx` (`"use client"`) catches `AdminAuthError` → client-side
  redirect via `useRouter().push('/login')`; other errors render a
  recoverable boundary with "Try again" calling `reset()`.
  `not-found.tsx` renders an `<EmptyState>` with "Back to dashboard".

### Task 12 — CREATE `apps/web/src/app/[locale]/admin/page.tsx` (REPLACE stub)

- **IMPLEMENT**: Server Component. Five `<KpiTile>`s — fetch in
  parallel via `Promise.all` and render. "Orders today" =
  `listOrders({ limit: 50 })` then JS-filter
  `r.createdAt >= startOfDay`. "Revenue 30d" =
  `listOrders({ limit: 100, status: 'CONFIRMED|SHIPPED|DELIVERED' })`
  client-side sum (acceptable for MVP — flagged in D7 as future
  paginate). "Low stock" = `getAdminProducts({ limit: 50 })` then
  `.filter(p => p.stock < 10).length`. "Open chats" =
  `listConversationsForAdmin({ status: 'OPEN', limit: 1 }).total`.
  "Newsletter pending" =
  `listSubscribers({ status: 'PENDING', limit: 1 }).total`. Below: two
  Cards with 5-row recent-orders and 5-row recent-chats tables.

### Task 13 — Products dashboard

Three files under `[locale]/admin/products/`:

- **`page.tsx`** (list): Server Component. Reads search params (q,
  categoryId, isActive, page, sortBy, order). `<DataTable>` with
  thumbnail / name (locale-aware Link to edit) / price (formatPrice)
  / stock / category name / `<StatusBadge>` / row-actions
  dropdown ("Edit" / "Delete" via `<ConfirmDialog>`). Top-right "New"
  button → `/admin/products/new`.
- **`new/page.tsx`** + **`[id]/page.tsx`**: shared `<ProductForm>`
  Client Component. Fields: name, description (`<Textarea>`), price
  (number), stock (number), categoryId (`<Select>` — fetched
  server-side in the page, passed as a prop). Submit calls
  `createProductAction` or `updateProductAction`.
- **`[id]/page.tsx`** ALSO renders `<ImageManager productId={id}
images={product.images}>` — Client Component. Lists thumbnails with
  drag-to-reorder (HTML5 native — no dep), per-thumb delete button.
  "Upload image" button: opens file picker, calls
  `presignAndUploadAction(productId, file)` which (1) POSTs
  `/uploads/product-images/presign`, (2) frontend `fetch` PUTs the
  raw bytes to the returned `uploadUrl` with the
  `requiredHeaders`, (3) POSTs
  `/uploads/product-images/:imageId/confirm` — then
  `revalidatePath` and the parent re-renders with the new image.
- **Server Actions** in `app/actions/admin/products.ts`:
  `createProductAction`, `updateProductAction`, `deleteProductAction`,
  `reorderImagesAction`, `deleteImageAction`. In
  `app/actions/admin/uploads.ts`: `presignAndUploadAction`.

### Task 14 — Categories dashboard

One page `[locale]/admin/categories/page.tsx` (Server) renders the
existing category tree via `listCategories()`, then a Client
Component `<CategoryTree>` recursively renders nodes with inline
Edit / Delete / Add-child via shadcn `Dialog`s. Backend 409 on
delete-with-children/products surfaces as a `sonner` toast.
Server Actions in `app/actions/admin/categories.ts`:
`createCategoryAction`, `updateCategoryAction`,
`deleteCategoryAction`.

### Task 15 — Orders dashboard

- **`page.tsx`** (list): `<DataTable>` columns [id-short, customer
  email or "Guest", total formatted, `<StatusBadge>`, createdAt,
  "View" link]. Filters: status `<Select>`, customer search,
  createdAt date range (`<Calendar>` + `<Popover>`).
- **`[id]/page.tsx`** (detail): 3-section grid. Left: items table
  (product name + qty + priceAtPurchase). Right top: customer card
  (email or "Guest" + session header). Right middle: payments
  list (provider, providerPaymentId, amount, status). Right bottom:
  discount card if applied. Below: `<StatusButtons>` Client Component
  with one button per legal next status (enforce the state machine
  client-side — backend validates anyway).
- **Server Action**: `updateOrderStatusAction(id, newStatus)` in
  `app/actions/admin/orders.ts`. PATCHes `/orders/:id/status` (verify
  the exact endpoint shape in `orders.controller.ts`).

### Task 16 — Discounts dashboard

- **`page.tsx`** (list): `<DataTable>` [code, percentOff||amountOff,
  expiresAt, isActive, "Redemptions" count (from `_count.redemptions`,
  already returned), row-actions].
- **`new/page.tsx`** + **`[id]/page.tsx`** + **`discount-form.tsx`**
  (Client): form with [code, type radio percent|amount, percentOff
  OR amountOff (conditional render based on the radio), expiresAt
  date picker via shadcn `Calendar` + `Popover`, isActive switch].
  Zod schema enforces "exactly one of percentOff/amountOff".
- **Detail page** ALSO shows a counter "X redemptions — full audit
  log coming soon" (D7 deferral).
- **Server Actions** in `app/actions/admin/discounts.ts`:
  `createDiscountAction`, `updateDiscountAction`,
  `deleteDiscountAction`.

### Task 17 — Newsletter dashboard

- **`page.tsx`** (list): `<DataTable>` [email, status, source,
  provider, syncState, lastSyncAt, row-actions]. Filters: status,
  syncState, provider, search (debounced email substring).
- **`row-actions.tsx`** (Client): shadcn `DropdownMenu` with "Force
  resync" (409 → sonner toast), "Force unsubscribe", "Delete (GDPR)"
  wrapped in `<ConfirmDialog>`.
- **Server Actions** in `app/actions/admin/newsletter.ts`:
  `forceResyncAction`, `forceUnsubscribeAction`,
  `deleteSubscriberAction`.

### Task 18 — Chat inbox

The ONE full Client Component page (D8). `"use client"` at the top
of `[locale]/admin/chat/page.tsx`. Split-pane layout:

- Left pane: conversation list — `useQuery(['admin-conversations',
filters], () => listConversationsForAdmin(filters))`. Sorted by
  status ASC then lastMessageAt DESC (matches backend order). Each
  row shows customer/guest identifier, last-message preview, unread
  badge, status `<StatusBadge>`. Clicking selects the conversation.
- Right pane: messages — `useQuery(['admin-messages', convId,
cursor], () => getMessages(convId, cursor))`. Renders newest-at-
  bottom; infinite-scroll-up loads earlier via the cuid cursor
  (D7's "EXISTS" check confirmed).
- Realtime: `useEffect` opens `io('http://localhost:3001/chat',
{ auth: { token: <session cookie value, received as a prop from a
tiny Server Component wrapper> } })`. Subscribes to `message:new`;
  appends to the open conversation OR bumps the conversation to the
  top of the left pane with an incremented unread count.
- Reply form: shadcn `Input` + `Button`. On submit, emit
  `message:send` on the socket (the gateway handles persistence)
  AND optimistically append; rollback on socket ack error.
- "Close" button → REST `PATCH /chat/:id` via
  `closeConversationAction` Server Action (so `revalidatePath`
  works).
- **Server Action**: `closeConversationAction(id)` in
  `app/actions/admin/chat.ts`.

### Task 19 — Settings page

`[locale]/admin/settings/page.tsx` — Server Component. Calls a
new Server Action `getAdminRuntimeInfo()` (also in
`app/actions/admin/runtime.ts` — NEW file) that reads
`process.env.{SEARCH_FTS_LANGUAGE, NEWSLETTER_PROVIDER,
SEARCH_PROVIDER, STRIPE_SECRET_KEY?, RESEND_API_KEY?, ...}` and
returns a SANITIZED DTO (NEVER returns secret values — only
booleans `hasStripeKey`, `hasResendKey`, etc.). Renders a grid of
`<Card>`s: brand name + supportEmail from `brand.ts`, locales from
`routing.locales`, then per-provider cards showing the bound
provider name + "configured" boolean. Read-only.

### Task 20 — Playwright E2E

Under `apps/web/e2e/pages/admin/`:

- `login.page.ts` — methods: `goto(locale)`, `fillCredentials`,
  `submit`, `expectError`.
- `dashboard.page.ts` — `expectKpiTile(name)`,
  `expectRecentOrdersTable`.
- `products.page.ts` — `gotoList`, `clickNew`, `fillProductForm`,
  `submit`, `expectListed(name)`.
- `orders.page.ts` — `gotoDetail(id)`, `clickStatusButton(status)`,
  `expectStatus(status)`.
- `newsletter.page.ts` — `gotoList`, `clickResync(email)`,
  `expectSyncState(email, state)`.

Under `apps/web/e2e/tests/admin/`:

- `admin-login.spec.ts`, `admin-product-create.spec.ts`,
  `admin-order-status.spec.ts`, `admin-newsletter-resync.spec.ts`,
  `admin-rbac.spec.ts` (logged-out + CUSTOMER variants).

ALL selectors are `data-testid`. Add the attributes during
implementation: `admin-<page>-<element>` (e.g.
`admin-products-new-button`, `admin-products-name-input`,
`admin-order-status-CONFIRMED`).

---

## TESTING STRATEGY

**Playwright E2E (Backend):** golden-path-only (5 specs, see Task
20). Each spec logs in with a seeded admin from `db:seed`, performs
ONE happy path, asserts the outcome. RBAC spec covers logged-out

- CUSTOMER-role redirects.

**Edge cases:** chat realtime intentionally deferred — covered only
by manual smoke; expired session cookie → action throws → error
boundary redirects; backend 409 (delete-with-children, provider
mismatch) → sonner toast with the API error message; concurrent
admin edits → backend wins (no optimistic locking in this PR);
non-admin landing on `/admin` → redirected to `/` not 403 (D2/D8).

---

## VALIDATION COMMANDS

Execute in order. Stop and fix on any Level 1/2 failure.

### Level 1 — Lint

```bash
pnpm --filter @repo/web lint
```

### Level 2 — Typecheck

```bash
pnpm --filter @repo/web typecheck
```

### Level 3 — Build

```bash
pnpm --filter @repo/web build
```

### Level 4 — E2E (needs backend running + seeded)

```bash
docker compose up -d postgres redis minio
pnpm --filter @repo/api prisma:migrate
pnpm --filter @repo/api db:seed
pnpm --filter @repo/api dev    # in one terminal
pnpm --filter @repo/web test:e2e   # in another
```

### Level 5 — Manual smoke

`open http://localhost:3000/en/login` as admin
(`admin@example.com / admin123`). Walk through the 8 dashboards.
Verify the cart action now succeeds for authenticated users.

---

## ACCEPTANCE CRITERIA

- [ ] `/[locale]/login` issues a `session` cookie on success; the
      cart Server Action's existing cookie read starts working for
      authenticated users.
- [ ] `/[locale]/admin/*` redirects logged-out to `/login`, CUSTOMER
      to `/`.
- [ ] All 8 dashboards render without 500 against a freshly-seeded DB.
- [ ] Products CRUD + image upload (presigned PUT) work end-to-end;
      created product appears on the public storefront.
- [ ] Order status transitions enforce the state machine.
- [ ] Newsletter force-resync + force-unsubscribe + GDPR delete work.
- [ ] Chat inbox connects via Socket.io and receives a guest's
      message in real time.
- [ ] Settings page never leaks a secret value.
- [ ] `pnpm --filter @repo/web lint` / `typecheck` / `build` green.
- [ ] 5 Playwright golden-path specs pass.

---

## NOTES

- **AGENTS.md mandate (D1)** — Next.js 16 + React 19. The execute
  agent MUST read the shipped docs BEFORE writing Server Actions,
  cookie calls, `useActionState`, or `revalidatePath`. Training-data
  Next.js 13/14 patterns will silently fail (e.g. `cookies()` is
  now async).
- **Scope is large** — 8 dashboards in one PR. The plan keeps
  per-domain tasks tight by establishing the shared shape once
  (Task 9 + Server Action pattern + DataTable URL-param filters).
  The execute agent should NOT re-design per-dashboard.
- **D7 follow-ups** — three backend gaps documented; admin ships
  without them. Track as separate tickets.
- **No new env keys**. `API_URL` reused; settings page reads
  `process.env` server-side, never inlines values.
- **Risk:** shadcn v4 + `@base-ui/react` is newer than common
  references — verify imports match what `shadcn add` generates
  (subtle diffs from Radix-era shadcn).
- **Risk:** Socket.io from a Client Component needs the bearer
  token but `cookies()` is server-only. Pass the token as a prop
  from a tiny Server Component wrapper (admin-gated already, D2).
- **Risk:** Playwright + Socket.io flakes — chat realtime NOT in
  the spec suite (D10).
- **Risk:** `dynamic = 'force-dynamic'` at the layout level opts
  the whole admin subtree out of static rendering — correct for
  per-user data; revisit if perf becomes an issue.

**Confidence Score**: 7.5/10 — lower than prior modules. Provider
abstraction muscle memory does NOT transfer to a frontend module,
and Next.js 16 is enough of a moving target that the AGENTS.md
mandate must be followed strictly. Top risks: (a) `useActionState`
shape, (b) shadcn v4 component imports, (c) chat realtime + bearer
token plumbing. Mitigations: Task 1 verifies backend gaps first;
the shared component layer is built BEFORE any dashboard;
chat inbox is LAST (Task 18) so its complexity doesn't block others.
