---
description: Step-by-step setup guide for the white-label e-commerce platform (Turborepo + Next.js 15 + NestJS + Prisma + PostgreSQL + Redis), optimized for AI-agent-assisted development.
---

# White-Label E-Commerce Platform — Setup Guide

This guide walks you through initializing the project from an empty folder to a working full-stack scaffold. It is designed to be executed alongside an AI coding agent (Claude Code, Cursor, Codex). Each step explains _why_ the tool matters for AI-assisted development, then provides a structured prompt you can hand to the agent so it does the work and self-corrects via the linter/type-checker/test feedback loop.

**Read first:** `CLAUDE.md`, `PRD.md`, `tech-stack-decision.md`, `stack-evaluation-conclusions.md`. They are the source of truth — this guide implements them.

---

## 0. Stack at a Glance

The stack is already decided. Do not re-evaluate it during setup.

| Layer            | Tool                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                                                |
| Frontend         | Next.js 15 (App Router), React 19, shadcn/ui, Tailwind CSS v4              |
| Backend          | NestJS 10+, Prisma 5+, PostgreSQL 16, Redis 7, BullMQ                      |
| Real-time        | Socket.io (NestJS WebSocket gateway)                                       |
| Object storage   | MinIO (S3-compatible, in Docker Compose)                                   |
| Auth             | JWT + Passport.js + NestJS Guards                                          |
| i18n             | next-intl                                                                  |
| Frontend state   | TanStack Query (server) + Zustand (client)                                 |
| Validation       | class-validator (NestJS DTOs), Zod (frontend forms + shared schemas)       |
| Logging          | Winston via `nest-winston` (structured JSON)                               |
| Testing          | Jest (backend, co-located `.spec.ts`), Playwright (E2E, Page Object Model) |
| Lint / format    | ESLint (`strictTypeChecked`) + Prettier                                    |
| Pre-commit       | husky + lint-staged                                                        |
| Containerization | Docker + Docker Compose                                                    |
| CI/CD            | GitHub Actions                                                             |
| Error tracking   | GlitchTip (self-hosted)                                                    |
| Observability    | OpenTelemetry → Grafana Cloud                                              |

**Non-negotiable rules** (from `CLAUDE.md`):

- TypeScript everywhere, `strict: true`, no `.js` files in source.
- Every NestJS module follows the same 9-file structure. The `products` module is the canonical reference.
- Server Components by default; only `"use client"` when needed.
- No raw SQL — all DB access through Prisma in repository files.
- No `any` (use `// TODO: fix type` if truly unavoidable).
- All boundaries validated (class-validator on controllers, Zod on forms).
- Structured JSON logs with `requestId`, `module`, `operation` fields.

---

## 1. Prerequisites

Install these once on your machine. The agent cannot install system-level tools for you.

| Tool                  | Version         | Install                                         |
| --------------------- | --------------- | ----------------------------------------------- |
| Node.js               | 20 LTS or newer | https://nodejs.org/ or `nvm`/`fnm`              |
| pnpm                  | 9+              | `npm install -g pnpm`                           |
| Docker Desktop        | latest          | https://www.docker.com/products/docker-desktop/ |
| Git                   | latest          | https://git-scm.com/                            |
| GitHub CLI (optional) | latest          | https://cli.github.com/                         |

Verify in a terminal:

```bash
node --version    # >= v20
pnpm --version    # >= 9
docker --version  # any recent
git --version
```

If any is missing, stop and install it before continuing.

---

## 2. Initialize the Turborepo Monorepo

We start from `create-turbo` and then carve our app shells inside it. Working directory: `C:\Users\juanj\Documents\personal\repos\ecommerce` (the empty folder this guide lives in).

```bash
# From the parent of the project folder
pnpm dlx create-turbo@latest ecommerce --package-manager pnpm
cd ecommerce
```

This produces a starter with two demo `apps/` and a few `packages/`. We will replace the demo content with real apps in the next steps.

Open the repo in your editor:

```bash
code .
```

### Verify

```bash
pnpm install
pnpm build
```

`pnpm build` should succeed against the demo apps. If it does, the monorepo plumbing is healthy.

---

## 3. Set Up GitHub Repository

Create an empty repo on GitHub named `ecommerce` (private until ready), then connect it:

```bash
git init
git branch -M main
git remote add origin git@github.com:<your_username>/ecommerce.git
```

Don't push yet — we want one clean initial commit _after_ the scaffold is real.

---

## 4. Drop in the Project Conventions

Before we start scaffolding apps, copy the conventions into the repo so the agent has guardrails the moment it starts editing.

Already present in this folder (do not regenerate):

- `CLAUDE.md` — global agent instructions (auto-loaded every session)
- `PRD.md` — scope and architecture
- `tech-stack-decision.md`, `stack-evaluation-conclusions.md` — rationale
- `.claude/docs/ai-coding-project-setup-guide.md` — this file

If the `create-turbo` scaffold landed in a sibling folder, **move these files into the new repo root** before continuing. The agent's effectiveness collapses without `CLAUDE.md` at the root.

Mirror the agent instructions for other tools (one-liners, point at `CLAUDE.md`):

- `AGENTS.md` — for OpenAI Codex
- `.cursorrules` — for Cursor IDE
- `.github/copilot-instructions.md` — for GitHub Copilot

Each can simply contain: _"Read `CLAUDE.md` at the repo root. It is the source of truth for all conventions."_

---

## 5. Project Dependencies — Lint, Type-Check, Format

These are the agent's feedback loop. The agent generates code → ESLint/`tsc` flag problems → the agent self-corrects until clean. Spend the time here; everything downstream depends on it.

### 5.1 Shared TypeScript Configs (`packages/tsconfig`)

`packages/tsconfig` ships three presets so every app extends the same base.

**Why a separate package:** Next.js needs `module: "esnext"` and `moduleResolution: "bundler"`. NestJS needs `module: "commonjs"` and `moduleResolution: "node"`. They are incompatible — one base preset plus two app-specific overlays is the cleanest split.

Hand this to the agent:

```
Set up packages/tsconfig with three files:

1. packages/tsconfig/package.json — name "@repo/tsconfig", private, no main/exports needed
2. packages/tsconfig/base.json — strict TS settings shared by everything:
     "strict": true,
     "noUncheckedIndexedAccess": true,
     "exactOptionalPropertyTypes": true,
     "noImplicitOverride": true,
     "noFallthroughCasesInSwitch": true,
     "forceConsistentCasingInFileNames": true,
     "esModuleInterop": true,
     "skipLibCheck": true,
     "resolveJsonModule": true,
     "isolatedModules": true,
     target "ES2022", lib ["ES2022"]
3. packages/tsconfig/nextjs.json — extends base, adds:
     "module": "esnext", "moduleResolution": "bundler",
     "jsx": "preserve", "allowJs": false,
     "incremental": true, "plugins": [{ "name": "next" }]
4. packages/tsconfig/nestjs.json — extends base, adds:
     "module": "commonjs", "moduleResolution": "node",
     "experimentalDecorators": true, "emitDecoratorMetadata": true,
     "declaration": true, "removeComments": false,
     "target": "ES2022"

When done, write the file contents and explain which option each app picks up.
```

### 5.2 Shared ESLint Config (`packages/eslint-config`) + root Prettier

`create-turbo` already scaffolded `packages/eslint-config/` (flat config, ESLint v9, unified `typescript-eslint` v8). The default rules are minimal — we extend them in place rather than create a parallel package. Strict type-aware rules (`strictTypeChecked`, `no-floating-promises`, `no-unsafe-*`, `explicit-function-return-type`) are what stop the agent from writing unsafe code.

Prettier config is **always at the repo root** (Prettier doesn't compose).

Hand this to the agent:

```
Upgrade packages/eslint-config (the existing flat-config package from create-turbo)
to be the strict, type-aware feedback loop for AI agents. Add Prettier config at root.

1. packages/eslint-config/package.json — keep "@repo/eslint-config", add deps:
     eslint-plugin-import-x  (modern ESM-aware fork of eslint-plugin-import)
     eslint-import-resolver-typescript
   Keep existing deps: typescript-eslint, @next/eslint-plugin-next, eslint,
   eslint-config-prettier, eslint-plugin-react, eslint-plugin-react-hooks,
   eslint-plugin-turbo, eslint-plugin-only-warn, globals, @eslint/js.
   Add `./nestjs` to `exports`.

2. packages/eslint-config/base.js — rewrite as the strict foundation:
   - Compose: js.configs.recommended +
     ...tseslint.configs.strictTypeChecked.map(c => ({ ...c, files: ["**/*.{ts,tsx,mts,cts}"] })) +
     ...tseslint.configs.stylisticTypeChecked.map(c => ({ ...c, files: ["**/*.{ts,tsx,mts,cts}"] }))
   - languageOptions.parserOptions: { projectService: true, ecmaVersion: 2022, sourceType: "module" }
     scoped to TS files. (projectService is faster than `project: true` and works across pnpm workspaces.)
   - Explicit rules (all `error`):
     @typescript-eslint/explicit-function-return-type (allow JSX-friendly options),
     no-floating-promises, no-misused-promises,
     no-unsafe-{assignment,call,argument,return,member-access},
     no-explicit-any, consistent-type-imports (separate-type-imports).
   - eslint-plugin-import-x with the 5-group order from CLAUDE.md §4:
     [builtin, external, internal, parent, sibling, index]
     pathGroups: { "@repo/**" → internal }, { "@/**" → parent }
     newlines-between: "always", alphabetize asc.
   - settings: { "import-x/resolver": { typescript: { alwaysTryTypes: true }, node: true } }
   - For .js/.mjs/.cjs files spread tseslint.configs.disableTypeChecked
     (config files aren't in any tsconfig).
   - Append eslint-config-prettier LAST so it disables conflicting stylistic rules.
   - Keep eslint-plugin-turbo and eslint-plugin-only-warn (registered, no rules).

3. packages/eslint-config/next.js — compose `...baseConfig` then overlay
   eslint-plugin-react flat/recommended, @next/eslint-plugin-next
   (recommended + core-web-vitals), eslint-plugin-react-hooks recommended.
   Add a {tsx,jsx} override that turns OFF
   @typescript-eslint/explicit-function-return-type
   (JSX components return JSX implicitly; explicit `: JSX.Element` everywhere is noise).

4. packages/eslint-config/nestjs.js (NEW) — compose `...baseConfig` then overlay:
   - "@typescript-eslint/no-extraneous-class": "off"
     (NestJS modules are decorator-only classes)
   - "@typescript-eslint/parameter-properties": "off"
     (constructor DI uses parameter properties)
   - "no-empty-function": ["error", { allow: ["constructors"] }]
     "@typescript-eslint/no-empty-function": ["error", { allow: ["constructors", "decoratedFunctions"] }]
   - For "**/*.spec.ts" files, turn off unbound-method, no-unsafe-assignment,
     no-unsafe-member-access (Jest mocks trip these).

5. Root .prettierrc.json:
   { "singleQuote": true, "trailingComma": "all", "semi": true,
     "printWidth": 100, "tabWidth": 2, "arrowParens": "always", "endOfLine": "lf" }

6. Root .prettierignore: node_modules, .next, dist, build, .turbo, coverage,
   pnpm-lock.yaml, **/*.min.*, apps/api/prisma/migrations.

7. Root .editorconfig: utf-8, lf, 2-space indent, insert final newline,
   trim trailing whitespace (except markdown).

8. Update .gitignore: add `.eslintcache` and `.prettiercache`.

After writing, install deps with pnpm and verify:
  pnpm exec eslint --version       # 9.x
  pnpm exec prettier --version     # 3.x
  pnpm lint                        # green across all workspace packages
  pnpm exec prettier --check .     # may list pre-existing files; that's OK,
                                   # lint-staged will format them as touched.
```

### 5.3 Husky + lint-staged (Pre-Commit Hooks)

This makes "agent forgot to format" impossible — the commit physically cannot land unformatted/unlinted. **Prerequisite: §5.2 must be done first** so lint-staged has a Prettier config and ESLint flat config to invoke.

```
Set up husky + lint-staged at the repo root.

Prereq: §5.2 is complete. Repo has .git, .prettierrc.json, and a working
flat-config ESLint setup that `pnpm lint` exercises cleanly.

1. pnpm add -D -w husky lint-staged
2. Add "prepare": "husky" to root package.json scripts, then run pnpm prepare.
   (husky 9 — no `husky install`, no shebang in hook files needed.)
3. Create .husky/pre-commit with a single line: `pnpm exec lint-staged`
4. Add lint-staged config to root package.json:
   "lint-staged": {
     "*.{ts,tsx,mts,cts}": ["eslint --fix --max-warnings=0", "prettier --write"],
     "*.{js,cjs,mjs,jsx,json,md,yml,yaml,css}": ["prettier --write"]
   }
5. Skip tsc --noEmit in the hook — full project typecheck is too slow for
   pre-commit, and the type-aware ESLint rules already catch most issues.
   Type-checking happens in CI.

Test: stage a deliberately badly-formatted .ts file and run `git commit`.
The hook should reformat it in place; commit succeeds. If the file has an
unfixable lint error (e.g., missing return type on an exported function),
the commit must FAIL — proving the gate works.
```

### 5.4 The `/commit` Slash Command

You're going to commit a _lot_ during scaffolding. Make it one keystroke.

Create `.claude/commands/commit.md`:

```markdown
---
description: Stage and commit pending work with a Conventional Commits message.
---

Run git status, git diff HEAD, and git status --porcelain to inspect uncommitted changes.
Stage the relevant untracked and modified files (do NOT use `git add -A` — exclude .env, secrets, large binaries).
Compose an atomic Conventional Commits message:
<type>(<scope>): <subject>
where <type> is feat/fix/docs/chore/refactor/test/build/ci/perf/style and <scope> is the
top-level area touched (api, web, types, config, infra, etc.). Subject under 72 chars,
imperative mood, no trailing period.
Then commit. Print the commit hash and a one-line summary.
```

Reload Claude Code (`/clear` then resume) and try it: `/commit`.

### Validate Section 5

```bash
pnpm install
pnpm exec eslint .
pnpm exec prettier --check .
pnpm exec tsc -b --dry
```

All four should be green. Then `/commit`.

---

## 6. NestJS App — `apps/api`

We scaffold the API next because the frontend will consume its types. The `products` module is the canonical 9-file reference (`CLAUDE.md` §3) — we will build it as the first real module after the foundation is in place.

### 6.1 Scaffold the NestJS App

````
Replace any demo backend in apps/api with a fresh NestJS 10+ scaffold.

Steps:
1. If apps/api already contains a demo, delete its contents (keep the folder).
2. Inside apps/api, run: pnpm dlx @nestjs/cli new . --package-manager pnpm --skip-git
   (the --skip-git is critical — the monorepo already owns .git)
3. Make apps/api extend the workspace tsconfig:
   - apps/api/tsconfig.json: extends "@repo/tsconfig/nestjs.json",
     compilerOptions.outDir "./dist", baseUrl "./", rootDir "./src",
     paths { "@/*": ["src/*"] }
4. Create apps/api/eslint.config.mjs (flat config, ESM):
     ```
     import { nestJsConfig } from "@repo/eslint-config/nestjs";
     export default nestJsConfig;
     ```
   Add @repo/eslint-config as devDependency: "workspace:*".
5. Update apps/api/package.json:
   - name "@repo/api"
   - scripts: dev "nest start --watch", build "nest build",
     test "jest", "test:cov" "jest --coverage", "test:e2e" "jest --config ./test/jest-e2e.json",
     lint "eslint . --max-warnings=0", typecheck "tsc -b --noEmit"
   - dependencies should already include @nestjs/common, @nestjs/core, @nestjs/platform-express, etc.
6. Configure Jest in apps/api/package.json (or jest.config.ts):
   - rootDir "src", testRegex ".*\\.spec\\.ts$",
   - moduleNameMapper { "^@/(.*)$": "<rootDir>/$1" }
   - collectCoverageFrom: src/**/*.(t|j)s, exclude main.ts and *.module.ts
   - coverageThreshold global: branches 80, functions 80, lines 80, statements 80

7. Verify by running:
   pnpm --filter @repo/api typecheck
   pnpm --filter @repo/api lint
   pnpm --filter @repo/api test

Report: scripts that work, anything that failed, what you fixed.
````

### 6.2 Install the Foundational NestJS Dependencies

These are not optional — every module will use them.

```
In apps/api, install these dependencies. Group them sensibly and use --filter @repo/api.

Runtime:
  @nestjs/config @nestjs/swagger @nestjs/throttler @nestjs/passport
  passport passport-jwt @nestjs/jwt
  class-validator class-transformer
  helmet
  nest-winston winston
  prisma @prisma/client
  ioredis @nestjs/bullmq bullmq
  @nestjs/websockets @nestjs/platform-socket.io socket.io
  nestjs-cls       # CLS for requestId propagation across async boundaries
  uuid

Dev:
  @types/passport-jwt @types/uuid

Verify with `pnpm --filter @repo/api list --depth=0` after install.
```

### 6.3 Wire Up Foundation: Config, Logging, Security, Swagger

This is the equivalent of "FastAPI + middleware + settings + structured logging" from typical Python tutorials, done the NestJS way.

```
Wire up the NestJS application foundation in apps/api/src.

1. apps/api/src/config/configuration.ts — typed config loader:
   - Reads NODE_ENV, PORT (default 3001), DATABASE_URL, REDIS_URL,
     JWT_SECRET, JWT_EXPIRES_IN (default "1d"),
     CORS_ORIGINS (comma-separated), THROTTLE_TTL, THROTTLE_LIMIT
   - Validate with a small Zod schema; throw on missing required vars at boot
   - Export both the Zod schema and the inferred TypeScript type

2. apps/api/src/logger/logger.module.ts — Winston via nest-winston:
   - JSON format in production, pretty in development
   - Default fields on every log: timestamp, level, message, requestId, module, operation, env
   - Export a global LoggerModule so any service can @Inject(WINSTON_MODULE_NEST_PROVIDER)

3. apps/api/src/cls/cls.module.ts — register nestjs-cls globally:
   - Middleware that pulls X-Request-ID from headers or generates a uuid v4
   - Stores requestId in CLS so the logger and downstream modules can read it

4. apps/api/src/common/filters/all-exceptions.filter.ts:
   - Global exception filter that:
     * Maps NestJS HttpExceptions to { statusCode, message, error } JSON
     * Logs unhandled errors via the Winston logger with requestId + stack
     * Returns the consistent error shape from CLAUDE.md §7

5. apps/api/src/common/interceptors/logging.interceptor.ts:
   - Logs every request: method, url, statusCode, duration ms, requestId

6. apps/api/src/main.ts:
   - Create app via NestFactory.create(AppModule, { bufferLogs: true })
   - app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
   - app.use(helmet())
   - app.enableCors({ origin: config.CORS_ORIGINS, credentials: true })
   - app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
   - app.useGlobalFilters(new AllExceptionsFilter(...))
   - app.useGlobalInterceptors(new LoggingInterceptor(...))
   - Set up Swagger:
     * DocumentBuilder with title, description from PRD.md, version from package.json, JWT bearer auth
     * SwaggerModule.setup('docs', app, document) — Swagger UI at /docs
   - app.listen(PORT, () => logger.log(`API listening on ${PORT}`))

7. apps/api/src/app.module.ts:
   - Imports: ConfigModule.forRoot({ load: [configuration], isGlobal: true, validate }),
     ClsModule (global), LoggerModule (global),
     ThrottlerModule.forRootAsync(...) reading TTL/LIMIT from config,
     APP_GUARD provider for ThrottlerGuard

8. Tests (co-located .spec.ts):
   - logger.module.spec.ts — verifies JSON format and that default fields appear
   - all-exceptions.filter.spec.ts — verifies error shape and logging side effects
   - logging.interceptor.spec.ts — verifies request lifecycle logs

Validate:
  pnpm --filter @repo/api typecheck
  pnpm --filter @repo/api lint
  pnpm --filter @repo/api test
  pnpm --filter @repo/api dev   # then curl http://localhost:3001/docs

Report: each file created, the boot log line printed, the Swagger /docs status code.
```

Manually verify before moving on:

```bash
pnpm --filter @repo/api dev
# in another terminal:
curl -i http://localhost:3001/docs    # should be 200
curl -i -H "X-Request-ID: test-123" http://localhost:3001/  # logs should include requestId: test-123
```

`/commit` once green.

---

## 7. Database Infrastructure — Prisma + PostgreSQL

PostgreSQL is delivered via Docker Compose so there are no host-level prerequisites. Prisma owns schema, migrations, and type-safe queries. **All Prisma access lives in repository files** (`CLAUDE.md` §3). Services never import `PrismaService` directly.

### 7.1 Docker Compose for Local Infra

```
Create docker-compose.yml at the repo root with these services for local development.
Use named volumes for persistence; expose unusual host ports to avoid clashing with
anything already installed on the developer's machine.

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
      POSTGRES_DB: ecommerce
    ports: ["5433:5432"]                # host 5433 to avoid local PG on 5432
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6380:6379"]                # host 6380 to avoid local Redis
    volumes: ["redis_data:/data"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes: ["minio_data:/data"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 10

  glitchtip:
    # Optional for local dev; can be commented out until needed.
    # See https://glitchtip.com/documentation for full compose stanza.

volumes:
  postgres_data:
  redis_data:
  minio_data:

Then create .env at the repo root (gitignored) with:
  DATABASE_URL=postgresql://ecommerce:ecommerce@localhost:5433/ecommerce
  REDIS_URL=redis://localhost:6380
  JWT_SECRET=dev-secret-change-me
  CORS_ORIGINS=http://localhost:3000
  S3_ENDPOINT=http://localhost:9000
  S3_ACCESS_KEY=minioadmin
  S3_SECRET_KEY=minioadmin
  S3_BUCKET=ecommerce-dev

And .env.example mirroring .env but with placeholder values, committed.

Verify: `docker compose up -d` then `docker compose ps` shows all healthy.
```

### 7.2 Prisma — Schema, Migrations, Repository Pattern

```
Set up Prisma in apps/api.

1. Run inside apps/api:
   pnpm exec prisma init --datasource-provider postgresql
   This creates apps/api/prisma/schema.prisma and a stray .env at apps/api/.
   DELETE the apps/api/.env (we use the root .env loaded via @nestjs/config).
   In schema.prisma set datasource db url = env("DATABASE_URL").

2. apps/api/prisma/schema.prisma — start with the minimum schema for the MVP.
   Refer to PRD.md §4 and CLAUDE.md §3 for entities. Define at least:
   - User (id cuid, email unique, passwordHash, role enum CUSTOMER/STAFF/ADMIN, timestamps)
   - Category (id cuid, name, slug unique, parentId nullable self-relation, timestamps)
   - Product (id cuid, name, slug unique, description, price Decimal(10,2), stock Int,
     isActive Boolean default true, categoryId, timestamps; index on slug, isActive)
   - ProductImage (id, productId, url, order)
   - Order (id cuid, customerId nullable, status enum, total Decimal, timestamps)
   - OrderItem (id, orderId, productId, quantity, priceAtPurchase Decimal)
   - DiscountCode (id, code unique, percentOff or amountOff, expiresAt nullable, ...)

   White-label note (per PRD §5.3): this MVP uses fork-per-client, NOT multi-tenancy.
   Do NOT add a tenantId column. Each fork is its own deployment with its own DB.

3. apps/api/src/prisma/prisma.module.ts and prisma.service.ts:
   - PrismaService extends PrismaClient, implements OnModuleInit/OnModuleDestroy
   - onModuleInit: await this.$connect()
   - onModuleDestroy: await this.$disconnect()
   - @Global() PrismaModule providing PrismaService

4. Add scripts to apps/api/package.json:
   "prisma:generate": "prisma generate",
   "prisma:migrate": "prisma migrate dev",
   "prisma:deploy": "prisma migrate deploy",
   "prisma:studio": "prisma studio",
   "db:seed": "ts-node prisma/seed.ts"
   And a "prisma" stanza:
     "prisma": { "seed": "ts-node prisma/seed.ts" }

5. apps/api/prisma/seed.ts — seeds a small set of categories + products + an admin user
   so the storefront has something to render on first run. Use bcrypt for the admin password.

6. Health module — apps/api/src/modules/health/:
   - GET /health  → { status: "ok" } (no deps)
   - GET /health/db → SELECT 1 via Prisma; 503 on failure
   - GET /health/redis → PING via ioredis; 503 on failure
   - Tests for each (mock the Prisma/Redis client).

Validate:
  docker compose up -d postgres redis
  pnpm --filter @repo/api prisma:generate
  pnpm --filter @repo/api prisma:migrate -- --name init
  pnpm --filter @repo/api db:seed
  pnpm --filter @repo/api test
  pnpm --filter @repo/api dev
  curl http://localhost:3001/health
  curl http://localhost:3001/health/db
  curl http://localhost:3001/health/redis

Report: migration files created, tables visible via `prisma studio`, all health endpoints 200.
```

### 7.3 The Canonical `products` Module

This is the single most important step in the entire guide. **Every other backend module will be a copy of `products`.** Spend the time to get it exactly right.

```
Build the canonical `products` module under apps/api/src/modules/products/.
This module is the reference implementation that every other module will follow
(CLAUDE.md §3, §10). It MUST follow the 9-file structure exactly.

Files:
1. products.module.ts — imports PrismaModule, declares controller + service + repository
2. products.controller.ts — HTTP routing only:
   - GET /products (paginated list, filter by category, sort by price/createdAt)
   - GET /products/:slug (by slug — public)
   - POST /products (admin guard)
   - PATCH /products/:id (admin guard)
   - DELETE /products/:id (admin guard)
   - All endpoints decorated with @ApiTags('products'), @ApiOperation, @ApiResponse
   - No business logic. No Prisma. Calls the service.
3. products.service.ts — business logic only:
   - findAll(query): paginated; uses repository
   - findBySlug(slug): throws NotFoundException if missing
   - create(dto): generates slug from name; throws ConflictException on duplicate slug
   - update(id, dto): re-checks slug uniqueness if name changed
   - remove(id): soft-delete via isActive=false (don't physically delete — orders may reference it)
   - Logs operation start/success with requestId from CLS
   - Throws NestJS HttpExceptions for known error cases
   - NEVER imports PrismaService directly. Goes through ProductsRepository.
4. products.repository.ts — every Prisma call lives here:
   - findById, findBySlug, findAll(paginated, filtered), create, update, softDelete
   - Maps Prisma rows to the Product entity (mostly identity, but isolates schema)
5. dto/create-product.dto.ts:
   - implements Pick<Product, 'name' | 'price' | 'categoryId' | 'description'> from @repo/types
   - Every field has BOTH class-validator (@IsString, @MaxLength, @Min, etc.) AND @ApiProperty
6. dto/update-product.dto.ts:
   - extends PartialType(CreateProductDto) from @nestjs/swagger
7. dto/product-response.dto.ts — outbound shape (camelCase, ISO date strings)
8. entities/product.entity.ts — class shape used internally; implements Product from @repo/types
9. products.controller.spec.ts and products.service.spec.ts:
   - Use createMockProduct from apps/api/test/factories/product.factory.ts
   - Service spec covers: findBySlug throws NotFound, create throws Conflict on dup,
     update preserves slug if name unchanged, remove sets isActive=false
   - Controller spec covers: routing wires up correctly, guards reject non-admin

Also create apps/api/test/factories/product.factory.ts with createMockProduct(overrides).

Add an admin-role guard at apps/api/src/common/guards/roles.guard.ts wired to a @Roles() decorator.
Don't fully implement auth yet — just make the guard read user.role from request.user
and throw ForbiddenException. We'll plug in JWT validation in the next section.

Validate:
  pnpm --filter @repo/api typecheck
  pnpm --filter @repo/api lint
  pnpm --filter @repo/api test          # 80% threshold should pass
  pnpm --filter @repo/api dev
  curl http://localhost:3001/products   # returns paginated list (seeded data)
  curl http://localhost:3001/products/<slug>
  open http://localhost:3001/docs       # Products section visible with all 5 endpoints

Report: file tree of modules/products/, test count, coverage %, Swagger screenshot or text dump.
```

`/commit` once everything passes.

---

## 8. Auth Module (JWT + Passport)

Now we plug in real auth so the admin guard actually does something.

```
Create apps/api/src/modules/auth/ following the same 9-file pattern (with auth-specific files):

- auth.module.ts — registers JwtModule (secret + expiresIn from config), PassportModule
- auth.controller.ts:
  - POST /auth/register (public, throttled stricter)
  - POST /auth/login (public, throttled stricter)
  - POST /auth/refresh (refresh-token cookie)
  - GET /auth/me (JWT-protected, returns current user)
- auth.service.ts:
  - register: hashes password with bcrypt (12 rounds), creates User with role CUSTOMER
  - login: verifies password, issues access + refresh JWTs
  - validateUser(payload): used by JwtStrategy
- auth.repository.ts — Prisma queries for User
- strategies/jwt.strategy.ts — extracts JWT from Authorization header, validates, returns user
- guards/jwt-auth.guard.ts — wraps Passport's AuthGuard('jwt')
- decorators/current-user.decorator.ts — @CurrentUser() param decorator
- decorators/roles.decorator.ts and the existing roles.guard.ts now consume @Roles()
- DTOs (register.dto.ts, login.dto.ts) — class-validator + @ApiProperty
- specs for service + controller using a UserFactory in test/factories/user.factory.ts

Wire up the products endpoints' guards to actually use @UseGuards(JwtAuthGuard, RolesGuard) + @Roles('ADMIN').

Validate:
  pnpm --filter @repo/api test
  curl -X POST http://localhost:3001/auth/register -H 'Content-Type: application/json' \
    -d '{"email":"a@a.com","password":"Password123!"}'
  curl -X POST http://localhost:3001/auth/login -H 'Content-Type: application/json' \
    -d '{"email":"a@a.com","password":"Password123!"}'
  # use the returned token to hit /auth/me and to get 403 on POST /products as a CUSTOMER
```

`/commit`.

---

## 9. Shared Types Package — `packages/types`

Both apps need the same shape for `Product`, `Order`, etc. The shared package holds **pure interfaces and Zod schemas — no decorators**. Decorators live in `apps/api/src/**/dto/`.

```
Create packages/types — pure TypeScript interfaces and Zod schemas shared between apps.

1. packages/types/package.json:
   - name "@repo/types", private
   - main and types both point at "./src/index.ts" (no build step — internal package
     pattern from MEMORY.md). The Next.js bundler and ts-jest both resolve TS source.
   - peerDependencies: zod
2. packages/types/tsconfig.json — extends "@repo/tsconfig/base.json"
3. packages/types/src/index.ts — barrel export
4. packages/types/src/product.types.ts:
   export interface Product { id, name, slug, description: string | null, price, stock, isActive, categoryId, createdAt, updatedAt }
   export const ProductSchema = z.object({ ... }) — mirrors the interface
5. packages/types/src/pagination.types.ts:
   export interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; }
   export const PaginationParamsSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
6. Add types for Category, Order, OrderItem, User, DiscountCode mirroring the Prisma schema.

Then update apps/api:
- DTOs use `implements Pick<Product, ...>` pulling from @repo/types
- Repositories/entities reference @repo/types for outbound shapes
- Add @repo/types to apps/api/package.json dependencies as "workspace:*"

Validate:
  pnpm install
  pnpm --filter @repo/api typecheck   # picks up @repo/types via workspace
  pnpm --filter @repo/api test
```

`/commit`.

---

## 10. Next.js App — `apps/web`

````
Replace any demo frontend in apps/web with a fresh Next.js 15 + App Router scaffold.

1. Inside apps/web, run:
   pnpm dlx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm --no-git
   When asked about Turbopack — yes.

2. Make apps/web extend the workspace tsconfig:
   - apps/web/tsconfig.json: extends "@repo/tsconfig/nextjs.json"
   - keep Next.js plugin in compilerOptions.plugins
3. apps/web/eslint.config.js (flat config — create-next-app already generates this):
     ```
     import { nextJsConfig } from "@repo/eslint-config/next-js";
     export default nextJsConfig;
     ```
   Add @repo/eslint-config as devDependency: "workspace:*". (create-next-app will
   wire its own minimal eslint.config.js — replace its body with the import above.)
4. apps/web/package.json:
   - name "@repo/web"
   - dependencies: add @repo/types as "workspace:*"
   - dev script keeps "next dev", add "typecheck": "tsc -b --noEmit"

5. Install the libraries CLAUDE.md mandates:
   - next-intl
   - @tanstack/react-query
   - zustand
   - zod, @hookform/resolvers, react-hook-form
   - shadcn/ui via:  pnpm dlx shadcn@latest init
       (color: neutral, CSS variables: yes, RSC: yes, src dir: yes)
     Then add the first batch of components:
       pnpm dlx shadcn@latest add button input label card dialog form sheet
   - @playwright/test (dev)
   - lucide-react

6. App Router skeleton at apps/web/src/app/:
   - [locale]/layout.tsx — wraps in NextIntlClientProvider, injects brand CSS variables
     from /src/config/brand.ts (PRD §5.3 — fork-based white-label)
   - [locale]/page.tsx — homepage stub
   - [locale]/products/page.tsx — Server Component fetching from process.env.API_URL
   - [locale]/products/[slug]/page.tsx — PDP Server Component
   - [locale]/cart/page.tsx — Client Component using Zustand cart store
   - [locale]/checkout/page.tsx — stub
   - [locale]/account/* — stubs
   - [locale]/(info)/{about,faq,contact,policies}/page.tsx — stubs
   - [locale]/admin/* — stub protected by middleware (TBD)
   - api/webhooks/stripe/route.ts — Route Handler stub
   - middleware.ts — next-intl middleware for locale routing (es, en)

7. Create apps/web/src/config/brand.ts (fork point #1 from PRD §5.3):
   export const brand = { name: 'Demo Store', supportEmail: '...', defaultLocale: 'es', locales: ['es','en'] as const };

8. Create apps/web/src/styles/globals.css with CSS variables (fork point #2).
   shadcn/ui already wires this; just confirm tokens use --primary, --background, etc.

9. apps/web/src/lib/api.ts — typed fetch wrapper:
   - getProducts(page, locale) — Server-side fetch with next: { revalidate: 60, tags: ['products'] }
   - getProduct(slug) — same
   - Pulls types from @repo/types (PaginatedResponse<Product>, Product)

10. Zustand cart store at apps/web/src/stores/cart.store.ts:
    - persist to localStorage
    - actions: addItem, removeItem, updateQuantity, clear

11. TanStack Query provider at apps/web/src/providers/query.provider.tsx (Client Component)
    Mounted in the layout for client-side data fetching only.

12. Server Action at apps/web/src/app/actions/cart.ts (per CLAUDE.md §8 Pattern 2):
    - addToCartAction(productId, quantity) — calls NestJS, revalidatePath('/cart')

13. Playwright setup at apps/web/playwright.config.ts:
    - testDir: './e2e/tests'
    - reporter: 'html'
    - webServer: { command: 'pnpm dev', port: 3000, reuseExistingServer: true }
    Create apps/web/e2e/pages/product.page.ts (POM) and apps/web/e2e/tests/checkout.spec.ts
    covering the happy path: visit PLP → click product → add to cart → cart shows item.
    Use ONLY data-testid selectors (CLAUDE.md §6).

14. Add data-testid to interactive/observable elements as you scaffold them
    (product cards, add-to-cart button, cart summary, etc.).

Validate:
  pnpm --filter @repo/web typecheck
  pnpm --filter @repo/web lint
  pnpm --filter @repo/web build
  pnpm --filter @repo/api dev   # in one terminal
  pnpm --filter @repo/web dev   # in another
  open http://localhost:3000/es/products   # should render seeded products from the API
  open http://localhost:3000/en/products   # English locale renders same data
  pnpm --filter @repo/web test:e2e          # Playwright passes the checkout happy path

Report: pages rendered, locale switching works, E2E test result, screenshots if possible.
````

`/commit`.

---

## 11. Background Jobs — BullMQ

Emails, notifications, and inventory updates run on BullMQ (Redis-backed). One queue to start (`emails`), wired so adding more later is trivial.

```
Add a queues module to apps/api/src/queues/:

1. queues.module.ts — BullModule.forRootAsync (config-driven Redis URL),
   BullModule.registerQueue({ name: 'emails' })

2. emails/email.processor.ts — @Processor('emails'):
   - Handles 'order-confirmation', 'password-reset', 'welcome' jobs
   - Calls a MailService (next step) — DO NOT call Resend directly here
   - Logs job start/success/failure with requestId

3. mail/mail.module.ts and mail.service.ts:
   - Define a MailService interface (IMailService) and a ResendMailService implementation
   - Inject by token so swapping providers (SendGrid, SES) is one line
   - Stub-safe in dev: if RESEND_API_KEY is empty, log the email payload instead of sending

4. Wire OrdersService.create to enqueue an 'order-confirmation' job
   (you'll build OrdersService by copying the products module pattern next).

5. Tests:
   - email.processor.spec.ts — verifies dispatch + retry behaviour
   - mail.service.spec.ts — verifies the dev stub logs without crashing

Validate:
  docker compose up -d redis
  pnpm --filter @repo/api test
  pnpm --filter @repo/api dev
  # trigger an order via the API and watch Winston logs show the email job firing.
```

---

## 12. Build Out the Remaining Domain Modules

Now that the platform is alive, fill in the rest of the MVP scope (PRD §4) by **copying the `products` module pattern** for each domain. Build them in this order (each depends on the previous):

1. `categories` — hierarchy (parent/child), CRUD
2. `cart` — guest cart in Redis, persisted cart for logged-in users
3. `orders` — checkout flow, order history, status transitions
4. `payments` — `PaymentProvider` interface + Stripe implementation (`MercadoPagoProvider` later)
5. `discounts` — discount codes, validation against cart
6. `chat` — Socket.io WebSocket gateway for real-time chat (PRD §4.3)
7. `newsletter` — Mailchimp/Klaviyo integration behind a `NewsletterService` interface
8. `uploads` — MinIO S3 client for product images
9. `search` — `SearchService` interface, `PostgresFtsSearchService` implementation
10. `admin` — admin dashboards (this is mostly frontend; the backend endpoints already exist on the per-domain modules)

For each: hand the agent a prompt of the form _"Build the `orders` module under apps/api/src/modules/orders/. Follow the `products` module exactly — same 9 files, same layer separation, same test approach. Domain rules: ... (list)."_ The convention does the heavy lifting.

Run `/commit` after each module passes lint, typecheck, tests, and a manual smoke test.

---

## 13. CI/CD — GitHub Actions

```
Create .github/workflows/ci.yml that runs on push and PR to main:

jobs:
  lint:
    - checkout, setup-node 20, setup pnpm, pnpm install --frozen-lockfile
    - pnpm lint
    - pnpm exec prettier --check .

  typecheck:
    - same setup
    - pnpm typecheck

  test:
    - same setup
    - services: postgres:16-alpine, redis:7-alpine
    - pnpm --filter @repo/api prisma:generate
    - pnpm --filter @repo/api prisma migrate deploy
    - pnpm test
    - upload coverage to artifacts

  e2e:
    - same setup
    - pnpm --filter @repo/web exec playwright install --with-deps
    - pnpm --filter @repo/api build && start in background
    - pnpm --filter @repo/web build && start in background
    - pnpm --filter @repo/web test:e2e

  build:
    - same setup
    - pnpm build
    - upload turbo cache

Cache pnpm store and turbo cache between runs (turbo's --cache-dir or actions/cache).

Validate by pushing a branch and watching the workflow go green.
```

---

## 14. Production Docker Images

```
Create production Dockerfiles using turbo prune for slim images.

1. apps/api/Dockerfile (multi-stage):
   - Stage 1 (deps): base node:20-alpine, install pnpm, copy turbo prune --docker output, pnpm install --frozen-lockfile
   - Stage 2 (build): pnpm --filter @repo/api build, pnpm --filter @repo/api prisma:generate
   - Stage 3 (runner): node:20-alpine slim, copy dist + node_modules, expose 3001, CMD node dist/main.js
2. apps/web/Dockerfile (multi-stage):
   - Same prune-based pattern
   - Use Next.js standalone output: ensure next.config.js has output: 'standalone'
   - Stage 3 copies .next/standalone, .next/static, public, expose 3000
3. .dockerignore at the root: node_modules, .next, dist, .turbo, *.log, .env, .git, coverage
4. docker-compose.prod.yml:
   - api built from apps/api/Dockerfile
   - web built from apps/web/Dockerfile
   - postgres, redis, minio (production env vars sourced from .env.production)
   - networks tying them together
   - depends_on with healthchecks

Validate:
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml up -d
  curl http://localhost:3001/health
  curl http://localhost:3000/en/products

Report final image sizes (slim is the goal — under 250MB each is realistic).
```

---

## 15. Validation Slash Command

You will run all checks together many times. Bake it into a slash command.

Create `.claude/commands/validate.md`:

```markdown
---
description: Run lint, typecheck, tests, and a smoke build across the monorepo.
---

Run the following sequentially. Report PASS/FAIL per step with output snippets and an overall verdict.

1. pnpm install --frozen-lockfile
2. pnpm exec prettier --check .
3. pnpm lint
4. pnpm typecheck
5. pnpm test
6. pnpm build

If any step fails:

- Print the failing command, the relevant output, and the file:line locations referenced.
- Stop. Do not auto-fix unless the user asks.

If everything passes, print a one-line summary with timing for each step.
```

Use it: `/validate` after every meaningful change.

---

## 16. Ignore-Comments Audit Slash Command

Linter/type-checker suppressions sneak in. Periodically audit them.

Create `.claude/commands/check-ignore-comments.md`:

```markdown
---
description: Find every eslint-disable / @ts-ignore / @ts-expect-error / TODO: fix type and report whether each is justified.
---

Search the repo for:

- // eslint-disable, /\* eslint-disable
- // @ts-ignore, // @ts-expect-error, // @ts-nocheck
- // TODO: fix type

For each match, write a section in `.agents/reports/ignore-comments-{YYYY-MM-DD}.md`:

**File:** path/to/file.ts:line
**Comment:** the exact suppression
**Why it exists:** explain the underlying type/lint issue
**Options to resolve:** list 2–3 options with effort (Low/Medium/High), breaking-change risk, and impact
**Recommendation:** Remove | Keep with justification | Refactor

Decide nothing — produce the report and stop. The user reviews and chooses.
```

---

## 17. The Agent's Standing Workflow

After setup, the loop for every new feature is:

1. Read `CLAUDE.md` (auto on session start)
2. Read the `products` module — it's the reference
3. Scaffold the new module, copying the 9-file structure
4. Write `class-validator` + `@ApiProperty` on every DTO field
5. Write `.spec.ts` files using the test factories in `apps/api/test/factories/`
6. `/validate` until green
7. `/commit`

For frontend changes:

1. Server Component by default, `"use client"` only when interactivity is needed
2. Fetch via the typed `apps/web/src/lib/api.ts` wrapper, not hand-rolled `fetch`
3. Add `data-testid` attributes to anything a Playwright test will touch
4. Add or update an E2E test in `apps/web/e2e/tests/`
5. `/validate` then `/commit`

---

## Project Complete

When everything in this guide is in place, you have:

- ✅ Turborepo monorepo with three workspaces (`apps/web`, `apps/api`, `packages/{types,tsconfig,config}`)
- ✅ Next.js 15 storefront with locale routing, shadcn/ui, Tailwind, TanStack Query, Zustand
- ✅ NestJS API with the canonical `products` reference module + JWT auth + Swagger at `/docs`
- ✅ Prisma + PostgreSQL with migrations, seed data, repository pattern
- ✅ Redis + BullMQ for background jobs, behind interface-driven services (`MailService`, etc.)
- ✅ Docker Compose for local infra (Postgres, Redis, MinIO) and production (api, web)
- ✅ ESLint `strictTypeChecked` + Prettier + husky + lint-staged enforcing style on every commit
- ✅ Jest with 80% coverage threshold and co-located `.spec.ts` files
- ✅ Playwright E2E covering the checkout happy path, Page Object Model, `data-testid` selectors
- ✅ Winston structured JSON logging with `requestId` propagated via `nestjs-cls`
- ✅ GitHub Actions CI running lint, typecheck, test, e2e, and build
- ✅ Slash commands: `/commit`, `/validate`, `/check-ignore-comments`

**Next steps (post-MVP):**

- Implement the remaining domain modules from §12 in order
- Wire Stripe webhooks end-to-end (`apps/web/src/app/api/webhooks/stripe/route.ts` → NestJS `payments` module)
- Add Meilisearch when PostgreSQL FTS hits its limits
- Stand up GlitchTip + OpenTelemetry → Grafana Cloud per `tech-stack-decision.md` §6
- First white-label fork: copy the repo, edit `apps/web/src/config/brand.ts` + `globals.css`, deploy

The repo is now ready to be forked, rebranded, and shipped.
