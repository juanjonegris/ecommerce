---
paths:
  - 'apps/web/src/**/*.{ts,tsx}'
  - 'apps/web/next.config.ts'
---

# Next.js app (`apps/web`)

- This is **Next.js 16** (React 19.2). APIs differ from older training data: before using an API you are unsure of, read the matching guide in `apps/web/node_modules/next/dist/docs/` and heed deprecation notices.
- App Router only. Every page lives under `src/app/[locale]/`; the only Route Handler is `src/app/api/webhooks/stripe/route.ts`.

## Server vs client

- Server Components by default. Add `'use client'` only for hooks, event handlers, or browser APIs — and push it down to a small island (`admin/products/product-form.tsx`, `row-actions.tsx`) rather than the whole page.

## Data flow

| Need                                  | Do this                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Storefront read in a Server Component | Add a typed function to `src/lib/api.ts` built on `apiFetch` (sets `revalidate` + cache `tags`)         |
| Admin read in a Server Component      | Add a function to `src/lib/admin/api.ts` (sends the session token, throws `AdminAuthError`)             |
| Mutation from the UI                  | Server Action in `src/app/actions/<domain>.ts` (admin: `actions/admin/<domain>.ts`) with `'use server'` |
| Realtime / client-only server state   | TanStack Query (`src/providers/query.provider.tsx`); today only `admin/chat/chat-inbox.tsx`             |
| Client UI state                       | Zustand store in `src/stores/` (cart is persisted to localStorage: `cart.store.ts`)                     |

Server Actions: validate `FormData` with a Zod schema and return a `<Domain>FormState` with `fieldErrors` (`actions/admin/products.ts`), read the token via `SESSION_COOKIE` from `src/lib/auth.ts` (never the literal `'session'`), call the NestJS API, then `revalidatePath`. Forms are client islands using `useActionState` + `useFormStatus` bound to the action (`admin/products/product-form.tsx`) — not `react-hook-form`.

## i18n

- `next-intl` with locales from `src/config/brand.ts`. Every user-facing string goes into **both** `src/i18n/messages/en.json` and `es.json`.
- Use `Link` and client-side `useRouter` from `src/i18n/navigation.ts` (not `next/link`) so the locale segment is kept. Server-side `redirect` / `notFound` come from `next/navigation` with an explicit `/${locale}/...` path (`admin/layout.tsx`).

## UI

- shadcn components: add with `npx shadcn@latest add <name>` (lands in `src/components/ui/`); never hand-copy them. Shared admin pieces live in `src/components/admin/`.
- Tailwind v4 utility classes only — no new CSS files. Theme tokens live in `src/app/globals.css`; brand values in `src/config/brand.ts` (white-label fork point).
- Put `data-testid` on every interactive or asserted element, named `<area>-<entity>-<element>` (e.g. `admin-products-submit`). E2E tests select only by these.

## Naming

- Files kebab-case (`add-to-cart-button.tsx`, `cart.store.ts`); components exported PascalCase; hooks `use-` prefix; props interfaces `<Component>Props`.
- React components may omit explicit return types (ESLint allows it for `.tsx`); everything else declares them.
