---
paths:
  - 'apps/api/**/*.spec.ts'
  - 'apps/api/test/**/*.ts'
---

# API tests (Jest)

- Specs are co-located: `products.service.spec.ts` next to `products.service.ts`. Every service and controller has one; provider adapters and processors too.
- Service specs construct the class directly with typed mocks — no `TestingModule` — following `src/modules/products/products.service.spec.ts`:
  - `mockRepo: jest.Mocked<Pick<ProductsRepository, 'findById' | ...>>`
  - `mockLogger = { log, error, warn }`, `mockCls = { getId: () => 'req-id' }`
  - `new ProductsService(mockRepo as unknown as ProductsRepository, ...)`, then `jest.clearAllMocks()` in `beforeEach`.
- Test data comes from factories in `apps/api/test/factories/` (`createMockProduct({ ...overrides })`). Never inline literal entities. A new domain gets a new `<domain>.factory.ts` following `product.factory.ts`.
- `@repo/types` resolves to raw source in Jest (`moduleNameMapper` in `apps/api/package.json`), so specs don't need a types build.
- Coverage threshold is 80%. Unit tests never hit Postgres, Redis, or external providers — mock the repository / provider token.
- Run: `pnpm test` (all) or `pnpm --filter @repo/api test -- <path-or-pattern>` (one spec; safe without turbo because of the mapper).
