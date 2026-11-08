---
paths:
  - 'apps/web/e2e/**/*.ts'
  - 'apps/web/playwright.config.ts'
---

# Playwright E2E (`apps/web/e2e`)

- Page Object Model: one class per page in `e2e/pages/` (admin pages under `e2e/pages/admin/`), specs in `e2e/tests/`, shared setup in `e2e/tests/admin/helpers.ts`.
- Page objects expose `readonly` `Locator` fields built in the constructor and `goto…(locale)` methods (`e2e/pages/admin/products.page.ts`). Specs never call `page.locator(...)` directly.
- Locate elements with `getByTestId` (preferred) or `getByRole`. Never CSS selectors, XPath, or text-only matching. If a test needs an element without a `data-testid`, add one to the component.
- Specs need the API on `:3001` with a seeded DB and the web app on `:3000`: `docker compose up -d`, `pnpm --filter @repo/api prisma:deploy`, `pnpm --filter @repo/api db:seed`, then `pnpm --filter @repo/web test:e2e`.
- Tests must be independent of order and of each other's data: create what you assert on, using unique names.
