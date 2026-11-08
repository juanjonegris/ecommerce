---
paths:
  - 'apps/api/src/**/dto/**/*.ts'
  - 'apps/api/src/**/entities/**/*.ts'
  - 'packages/types/src/**/*.ts'
---

# DTOs and shared contracts

## `packages/types` (`@repo/types`)

- Pure TypeScript interfaces, enums-as-unions, and Zod schemas only. **No decorators, no runtime deps on Nest or Prisma.**
- One file per domain (`product.types.ts`), re-exported from `src/index.ts`.
- It is a built package: the API typechecks against `src/` (tsconfig `paths`), but the web app and the API runtime load `dist/`. After changing it, run any turbo task (`pnpm typecheck`, `pnpm build`) so `dist/` is rebuilt.

## DTOs (`apps/api/src/modules/<domain>/dto/`)

- Input DTOs implement a slice of the shared interface: `class CreateProductDto implements Pick<Product, 'name' | 'price' | ...>` (`products/dto/create-product.dto.ts`).
- **Every field** has a `class-validator` decorator **and** `@ApiProperty` (or `@ApiPropertyOptional` + `@IsOptional`). No exceptions — Swagger is generated from these.
- Required fields use definite assignment (`name!: string`); optional fields get a default.
- Query-string DTOs (`find-<domain>-query.dto.ts`) use `@Type(() => Number)` for numeric params; the global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, `transform`.
- Response DTOs (`<domain>-response.dto.ts`) have a `static from(entity)` mapper; controllers return `XResponseDto.from(entity)`, never the raw entity (`products.controller.ts`).
- File names: `create-<domain>.dto.ts`, `update-<domain>.dto.ts`, `<domain>-response.dto.ts`.

## Entities (`entities/<domain>.entity.ts`)

Classes the repository maps Prisma rows into (e.g. `Decimal` → `number`). Services and controllers only see entities, never Prisma types.
