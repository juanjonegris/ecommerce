---
paths:
  - 'apps/api/src/**/*.ts'
---

# Logging (`apps/api`)

- Inject the logger with `@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService` and the request context with `private readonly cls: ClsService`. Reference: `src/modules/products/products.service.ts` (`create`).
- Log an object, never a bare string: `{ message, requestId, ...contextFields }`. Get `requestId` from `this.cls.getId()`.
- `message` is a dot-namespaced event: `{domain}.{component}.{verb}_{state}` — e.g. `product.service.create_started`, `product.service.create_succeeded`, `http.exception_filter.catch_failed`.
  - `domain`: business domain or infra layer (`product`, `order`, `api`, `http`).
  - `component`: the class role in snake_case (`service`, `processor`, `gateway`, `interceptor`).
  - `state`: `started` | `succeeded` | `failed`.
- Log at operation boundaries of mutations: `_started` with the input identifiers, `_succeeded` with the created/updated entity ID. Plain reads don't need logs — the HTTP interceptor already logs every request.
- Errors: `this.logger.error({ message: '..._failed', requestId, error: err.message }, err.stack)`.
- Never log passwords, JWTs, API keys, webhook secrets, or card data.
