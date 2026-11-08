---
paths:
  - 'apps/api/src/**/*.ts'
---

# NestJS modules (`apps/api`)

## Module anatomy — pick the closest reference and mirror it

| Kind of module                                 | Reference                             | Extra files on top of the base set                                                                  |
| ---------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Plain domain (CRUD over own tables)            | `src/modules/products/`               | —                                                                                                   |
| External service behind a port (provider-port) | `src/modules/payments/`               | `providers/<x>-provider.interface.ts`, `providers/<real>.provider.ts`, `providers/stub.provider.ts` |
| Background jobs                                | `src/modules/newsletter/`, `uploads/` | `<domain>.processor.ts`, `<domain>.queue.service.ts`, `<domain>-job.types.ts`                       |
| Realtime                                       | `src/modules/chat/`                   | `<domain>.gateway.ts`                                                                               |
| No own table (reads others / infra)            | `src/modules/search/`, `health/`      | no repository                                                                                       |

Base set: `<domain>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `dto/`, `entities/`, `.controller.spec.ts`, `.service.spec.ts`. Register every new module in `src/app.module.ts`. To scaffold one, use the `new-api-module` skill.

## Layers

| Layer      | Does                                                 | Never does                            |
| ---------- | ---------------------------------------------------- | ------------------------------------- |
| Controller | Route, parse/validate input, guards, Swagger, return | Business logic, Prisma                |
| Service    | Business logic, orchestration, throw HTTP exceptions | HTTP concerns, inject `PrismaService` |
| Repository | Prisma queries, map rows → `entities/` classes       | Business logic, HTTP exceptions       |

Repositories may throw domain errors (e.g. `OutOfStockError` in `products.repository.ts`) that the service translates.

## Provider-port pattern

- The interface file exports the port interface **and** a string DI token (`PAYMENT_PROVIDER` in `payments/providers/payment-provider.interface.ts`). Inject with `@Inject(TOKEN)`.
- The module binds the token with `useFactory`: real adapter when its key is configured, `Stub*Provider` when the key is empty (`payments.module.ts`). The API must boot and pass tests with **every provider key empty** — CI and first prod boot depend on it.
- New env vars: add to the zod schema in `src/config/configuration.ts` with a `.default('')`, then see the infra rule for the other places they must be listed.
- Modules with a factory binding get a `<domain>.module.spec.ts` asserting the stub fallback (`newsletter`, `search`, `uploads`).

## Controllers

- Admin-only routes: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` + `@ApiBearerAuth()` (`products.controller.ts`). Guest-or-user routes: `OptionalJwtAuthGuard` + `@OptionalUser()` (`cart.controller.ts`).
- Every route has `@ApiOperation` and `@ApiResponse`; every controller has `@ApiTags`.
- Webhook routes read `req.rawBody` (enabled in `src/main.ts`) — never re-serialize the parsed body for signature checks.

## Errors

Throw Nest exceptions from services; the global filter (`src/common/filters/all-exceptions.filter.ts`) produces `{ statusCode, message, error }`.

| Situation         | Exception               |
| ----------------- | ----------------------- |
| Not found         | `NotFoundException`     |
| Invalid input     | `BadRequestException`   |
| Not authenticated | `UnauthorizedException` |
| No permission     | `ForbiddenException`    |
| Duplicate         | `ConflictException`     |

## Naming

Files kebab-case (`create-product.dto.ts`); classes PascalCase; methods verb-first camelCase (`findAll`, `findBySlug`, `create`, `update`, `remove`); interfaces without `I` prefix; constants UPPER_SNAKE_CASE. Import internal code via the `@/` alias (`@/prisma/prisma.service`).
