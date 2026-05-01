---
description: 'Research and create comprehensive implementation plan for a feature'
argument-hint: [feature-description]
---

# Planning: Feature Implementation Plan

## Feature: $ARGUMENTS

## Mission

Transform a feature request into a **comprehensive implementation plan** through systematic codebase analysis and strategic planning.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a context-rich plan that enables one-pass implementation success for the execution agent.

**HARD CONSTRAINT**: The final plan MUST be between 500-700 lines total. Be concise while comprehensive.
Reference patterns instead of repeating them. Group related tasks. Remove redundancy.

## Determine Feature Name

Create a concise kebab-case feature name (e.g., "user-authentication", "data-export").
This will be used for the plan filename: `plans/[feature-name].md`

---

## Planning Process

### Phase 1: Feature Understanding

- Extract the core problem being solved
- Determine feature type: New Capability / Enhancement / Refactor / Bug Fix
- Map affected systems and components (web, api, packages, infra)

**Create or refine user story:**

```
As a <type of user>
I want to <action/goal>
So that <benefit/value>
```

### Phase 2: Codebase Intelligence Gathering

Use specialized subagents in parallel when beneficial:

**1. Pattern Recognition**

- Search for similar implementations in the codebase
- Identify coding conventions (naming, file organization, error handling, logging)
- Document reusable code, utilities, and anti-patterns to avoid
- Check `CLAUDE.md` (root + per-app) for project-specific rules
- For new NestJS modules, mirror the canonical reference: `apps/api/src/modules/products/`
  (controller / service / repository / dto/ / entities/ / specs — 9-file structure)

**2. Dependency & Integration Analysis**

- Catalog external libraries relevant to the feature (check `package.json` of `apps/api`, `apps/web`, and `packages/*` before adding new ones — the stack is intentionally complete)
- Understand how libraries are integrated (imports, configs, versions)
- Map integration points with existing files
- Backend integration points: `app.module.ts` registration, Prisma schema + migrations, guards, BullMQ queues, WebSocket gateways, Swagger decorators
- Frontend integration points: `app/[locale]/...` routes, server actions in `app/actions/`, middleware (tenant resolution), `next-intl` messages, TanStack Query keys, Zustand stores
- Shared types: extend `@repo/types` (pure interfaces only — never put `class-validator` decorators there)

**3. Testing Patterns**

- Identify test framework and structure
- Find similar test examples for reference
- Note coverage requirements and testing standards

**Testing Note (ecommerce-specific):**

- Backend: Jest, co-located `*.spec.ts` next to source. 80% coverage threshold. Use factories from `apps/api/test/factories/` (e.g. `createMockProduct()`) — never hardcode test data inline. Pattern reference: `apps/api/src/modules/products/products.service.spec.ts`. Run with `pnpm --filter api test`.
- Frontend E2E: Playwright with Page Object Model in `apps/web/e2e/pages/` and tests in `apps/web/e2e/tests/`. Use `data-testid` selectors only — no CSS selectors. Run with `pnpm --filter web test:e2e`.
- Frontend unit tests: not standardized in `CLAUDE.md`. Do not invent a setup unless the feature demands it; if you do, raise it as an architectural decision before proceeding.

**Clarify Ambiguities:**

- If requirements are unclear, ask the user to clarify before continuing
- Get specific implementation preferences (libraries, approaches, patterns)
- Resolve architectural decisions before proceeding

### Phase 3: Strategic Thinking

Think deeply about:

- How does this feature fit into the existing architecture?
- What are the critical dependencies and order of operations?
- What could go wrong? (Edge cases, race conditions, errors)
- How will this be tested comprehensively?
- Are there performance or security considerations?
- Multi-tenancy implications: does every new table need `tenantId` + `@@index([tenantId])`? Does the Prisma `$extends` tenant-injection cover this path, or is it a raw query / `$transaction` that bypasses it?
- Choose between alternative approaches with clear rationale

---

## Output: Create Plan Document

Save plan as: `plans/[feature-name].md`

**PATH RESOLUTION (CRITICAL):**
All `.claude/` paths are **PROJECT-RELATIVE**, not user-home-relative.

- ✅ Correct: `C:\Users\juanj\Documents\personal\repos\ecommerce\.claude\plans\[feature-name].md`
- ❌ Wrong: `C:\Users\juanj\.claude\plans\[feature-name].md` (user home directory — do NOT use)

Every file created in this phase must be in the **project's `.claude/` directory**, not the global user `.claude/` directory. If you create files anywhere other than inside the project repository's `.claude/` folder, you will have failed this task.

**CRITICAL**: Format this plan for ANOTHER AGENT to execute without seeing this conversation. The plan must pass the "No Prior Knowledge Test" — someone unfamiliar with the codebase can implement using only the plan content.

### Plan Template

````markdown
# Feature: <feature-name>

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

<Detailed description of the feature, its purpose, and value>

## User Story

As a <type of user>
I want to <action/goal>
So that <benefit/value>

## Problem Statement

<Clearly define the specific problem or opportunity>

## Solution Statement

<Describe the proposed solution and how it solves the problem>

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `path/to/file.ts` (lines X-Y) — Why: Contains pattern for X that we'll mirror
- `path/to/model.ts` (lines X-Y) — Why: Data model structure to follow
- `path/to/test.ts` — Why: Test pattern example

### New Files to Create

- `apps/api/src/modules/<domain>/...` — NestJS module (9-file structure)
- `packages/types/src/<domain>.types.ts` — Shared interfaces (no decorators)
- `apps/web/src/app/[locale]/<route>/page.tsx` — Server Component page
- `apps/web/src/app/actions/<domain>.ts` — Server actions for mutations

### Patterns to Follow

<Specific patterns extracted from codebase — include actual code examples from the project>

- **Naming Conventions**: kebab-case files, PascalCase classes/components, camelCase methods/hooks (CLAUDE.md §4)
- **Layer Separation (NestJS)**: Controller → Service → Repository. No Prisma in services. No business logic in controllers. (CLAUDE.md §3)
- **Server Components by default**: only add `"use client"` for browser APIs, event handlers, or hooks (CLAUDE.md §1)
- **DTOs implement `@repo/types` interfaces** and add `class-validator` + `@ApiProperty` decorators (CLAUDE.md §7)
- **Logging**: structured JSON via `nest-winston` with `requestId`, `module`, `operation` fields (CLAUDE.md §5)
- **Error Handling**: NestJS exception classes — `NotFoundException`, `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `ConflictException` (CLAUDE.md §7)

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

<Foundational work: shared types in `@repo/types`, Prisma schema additions + migration, DTOs, dependencies>

### Phase 2: Core Implementation

<Main implementation: NestJS module (controller/service/repository), Next.js routes, server actions>

### Phase 3: Integration

<Connect to existing code: register module in `app.module.ts`, wire routes/middleware, add to admin if applicable, update `@repo/types` exports>

### Phase 4: Testing & Validation

<Testing approach: Jest unit tests (services), Playwright E2E for critical user flows, edge cases>

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task Keywords

- **CREATE**: New files or components
- **UPDATE**: Modify existing files
- **ADD**: Insert new functionality into existing code
- **REMOVE**: Delete deprecated code
- **REFACTOR**: Restructure without changing behavior
- **MIRROR**: Copy pattern from elsewhere in codebase

### {ACTION} {target_file}

- **IMPLEMENT**: {Specific implementation detail}
- **PATTERN**: {Reference to existing pattern — file:line}
- **IMPORTS**: {Required imports and dependencies}
- **GOTCHA**: {Known issues or constraints to avoid}
- **VALIDATE**: `{executable validation command}`

<Continue with all tasks in dependency order...>

---

## TESTING STRATEGY

### Unit Tests (Backend)

<Scope and requirements based on project standards — services tested with mocked repositories, factories from `apps/api/test/factories/`>

### E2E Tests (Frontend)

<Scope and requirements — Playwright with POM, `data-testid` selectors, critical user flows only>

### Edge Cases

<Specific edge cases that must be tested — multi-tenant isolation, auth/RBAC, validation failures, concurrent updates>

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

### Level 1: Lint (REQUIRED — hard gate)

All packages:

```bash
pnpm lint
```
````

Or scoped:

```bash
pnpm --filter api lint
pnpm --filter web lint
```

### Level 2: Type Check (REQUIRED — hard gate)

All packages:

```bash
pnpm typecheck
```

Or scoped:

```bash
pnpm --filter api typecheck
pnpm --filter web typecheck
```

### Level 3: Unit Tests (backend)

```bash
pnpm --filter api test
```

For coverage report:

```bash
pnpm --filter api test:cov
```

### Level 4: E2E Tests (frontend)

```bash
pnpm --filter web test:e2e
```

If tests fail due to missing infra (DB, Redis, MinIO), bring services up first:

```bash
docker compose up -d
```

### Level 5: Manual Validation

<Feature-specific: describe what to manually test in the browser, via Swagger at `/api/docs`, or with Postman>

---

## ACCEPTANCE CRITERIA

- [ ] Feature implements all specified functionality
- [ ] All validation commands pass with zero errors
- [ ] Tests cover core functionality and edge cases
- [ ] Code follows project conventions and patterns
- [ ] No regressions in existing functionality

---

## NOTES

<Additional context, design decisions, trade-offs, risks>

**Confidence Score**: X/10 that execution will succeed on first attempt

```

---

## Confirmation

After creating the plan, report:
- Feature name and plan file path
- Summary of approach
- Key implementation risks
- Confidence score for one-pass success

**Next step**: Run `/execute plans/[feature-name].md` to implement this feature
```
