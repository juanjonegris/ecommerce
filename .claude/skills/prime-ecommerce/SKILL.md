---
name: prime-ecommerce
description: Primes the agent with a working understanding of this white-label e-commerce monorepo (Next.js 16 + NestJS 11 + Prisma 7, Turborepo) by reading docs, structure and key files. Without arguments it orients on the whole platform; a scope narrows it to one part — storefront, admin, platform, ai-layer, an app, a NestJS module, an aspect or a path. Optionally loads task context first from a GitHub issue or PR, a story (GH-<n>), or an epic (epic:<slug>). Use at the start of a session, when resuming after a break, or before planning or implementing.
argument-hint: '[#<n> | GH-<n> | pr:<n> | epic:<slug> | GitHub URL] [scope: storefront | admin | platform | ai-layer | api | web | types | <module> | <aspect> | <path>]'
---

# Prime: Load Project Context

## Objective

Build a working understanding of the codebase by analyzing its structure, documentation and key files. This is
**orientation**, not an audit: report what is there and how it fits together, not what is wrong with it.

- If task references are provided, load them **first**, so the analysis is anchored to the actual work.
- If a scope is provided, narrow the analysis to it.
- **When another skill or agent invokes this one** (e.g. `story-architect`), load the context and return without
  the Output Report.

## Argument Parsing

`$ARGUMENTS` may mix task references and scopes, in any order, and scopes can combine (`admin orders`). Classify
each token:

| Token form                                                                                            | Meaning                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `#12`, `12`, `12,15`, `GH-12`, `github.com/.../issues/12`                                             | GitHub issue(s); `GH-<n>` also loads its story folder if it exists          |
| `pr:34`, `github.com/.../pull/34`                                                                     | GitHub pull request                                                         |
| `epic:<slug>`                                                                                         | Epic docs in `.agents/epics/<slug>/`                                        |
| Matches `.claude/plans/<name>.md` or `.claude/archive/module-prompts/<name>-prompt.md`                | Legacy local plan / feature prompt (from before the story workflow)         |
| `storefront`, `admin`, `platform`, `ai-layer`                                                         | Named platform scope (see **Named scopes**)                                 |
| `api`, `web`, `types`, `config`                                                                       | App or package scope (`apps/*`, `packages/*`)                               |
| Name of a dir under `apps/api/src/modules/`                                                           | NestJS module scope                                                         |
| Aspect: `auth`, `i18n`, `theming`, `payments`, `logging`, `testing`, `search`, `chat`, `infra`, `ci`… | Cross-cutting aspect scope                                                  |
| Anything that is a literal path                                                                       | Path scope                                                                  |
| Free-form text                                                                                        | Intent — restate it at the top of the report so the user can correct course |

If `$ARGUMENTS` is empty, prime the whole platform with no external context.

### Named scopes

Paths are relative to `apps/web/src/` (web) and `apps/api/src/modules/` (API modules).

| Scope        | Web                                                                                                                                                                                                                                                                      | API                                                                                                                                                                  | Tests and other                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storefront` | `app/[locale]/` except `admin/` (`page.tsx`, `products/`, `cart/`, `checkout/`, `account/`, `login/`, `(info)/`), `app/actions/cart.ts`, `app/actions/auth.ts`, `lib/api.ts`, `lib/auth.ts`, `components/` (not `admin/`), `i18n/`, `config/brand.ts`, `app/globals.css` | customer-facing endpoints of `products`, `categories`, `search`, `cart`, `orders`, `payments`, `auth`, `newsletter` (subscribe), `chat` (customer side)              | `apps/web/e2e/tests/checkout.spec.ts`, `apps/web/e2e/pages/product.page.ts`                                                                            |
| `admin`      | `app/[locale]/admin/**`, `app/actions/admin/**`, `lib/admin/**`, `components/admin/**`                                                                                                                                                                                   | `Roles`-guarded endpoints in `categories`, `chat`, `discounts`, `newsletter`, `orders`, `products`, `search`, `uploads`; `apps/api/src/common/guards/roles.guard.ts` | `apps/web/e2e/tests/admin/**`, `apps/web/e2e/pages/admin/**`                                                                                           |
| `platform`   | `app/[locale]/layout.tsx`, `middleware.ts`, `next.config.ts`                                                                                                                                                                                                             | `apps/api/src/{config,common,prisma,queues,mail,logger}/`, `main.ts`, `app.module.ts`, `apps/api/prisma/`                                                            | root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `docker-compose*.yml`, `apps/*/Dockerfile`, `.github/workflows/ci.yml`, `.env.example`       |
| `ai-layer`   | `apps/web/CLAUDE.md`, `apps/web/AGENTS.md`                                                                                                                                                                                                                               | —                                                                                                                                                                    | `CLAUDE.md`, `.claude/{rules,skills,agents,shared,hooks,commands}/`, `.claude/settings.json`, `.mcp.json`, `.agents/` (`PRD.md`, `epics/`, `stories/`) |

## Process

### Step 0: Load Task Context (only if task references were given)

**GitHub issues / PRs:** the repo is the `origin` remote (`git remote get-url origin`). Prefer the `gh` CLI:

- Issue: `gh issue view <n> --json number,title,body,labels,assignees,milestone,comments`
- PR: `gh pr view <n> --json number,title,body,headRefName,files,reviews,comments,statusCheckRollup`
- Linked context: if the body references other issues (`#n`), a parent epic issue, or `.agents/epics/` files, load
  those too (one level deep).

If `gh` is not installed or not authenticated (`gh auth status` fails), and the `github` MCP server is connected,
use its `issue_read` / `pull_request_read` tools instead. If neither is available, tell the user and continue
without that context. Do not stop the priming.

**Story (`GH-<n>`):** if `.agents/stories/GH-<n>-*/` exists, read its `SPEC.md` and `PLAN.md`, and only the last
20 lines of `LOGS.md`: the last command entry and its `Next step:` say where the story stands.

**Epic (`epic:<slug>`):** read the headers and the main sections of `.agents/epics/<slug>/prd.md`,
`architecture.md` and `stories.md`.

**Legacy plans / prompts:** read `.claude/plans/<name>.md` and/or `.claude/archive/module-prompts/<name>-prompt.md`.
These come from the earlier `/planning` → `/execute` flow: background, not current specs.

Treat the issue, story or epic as the task context for everything that follows. Briefly summarize it before
continuing. If the task implies a scope (e.g. an issue about discounts in the admin), infer it and say so.

### Step 1: Analyze Project Structure

Tracked files (the lockfile and binary assets are filtered out):
!`git ls-files | grep -v -E 'pnpm-lock\.yaml|\.(png|jpe?g|ico|svg|woff2?)$'`

When scoped, focus on the files under the scope's paths and ignore the rest of the listing.

Key locations:

- `apps/api/src/modules/`: one NestJS module per domain (`products` is the canonical reference, `payments` the
  reference for a provider port)
- `apps/api/prisma/`: `schema.prisma`, migrations, seed
- `apps/api/test/factories/`: test data factories
- `apps/web/src/app/[locale]/`: storefront and `admin/` routes; `apps/web/src/app/actions/`: Server Actions
- `apps/web/e2e/`: Playwright (Page Object Model)
- `packages/types/src/`: shared interfaces and Zod schemas (a built package)
- `.agents/`: the platform PRD, epics (`epics/<slug>/`) and story artifacts (`stories/<id>-<slug>/`)
- `.claude/plans/`, `.claude/archive/`: history from before the story workflow. Background only, not rules.

### Step 2: Read Core Documentation

Always read:

- `CLAUDE.md` (root), and the `.claude/rules/**` files for the scope (all of them when unscoped). Add
  `apps/web/CLAUDE.md` for web scopes. These are the conventions and the source of truth.
- `.agents/PRD.md`: the product scope. Skim the headings, and read §3 (users), §4 (MVP scope) and §5.3
  (white-label strategy) in full.

Read when relevant to the task or scope (skim headings otherwise):

- `mvp-tool-designs.md`: architecture, data model, agent conventions
- `tech-stack-decision.md`, `stack-evaluation-conclusions.md`: why each tool was chosen
- `README.md`: local setup, CI, production images
- The memory index (`MEMORY.md`) is already loaded. Use it; don't re-read it.

### Step 3: Identify Key Files

Unscoped, read:

- Entry points: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/web/src/app/[locale]/layout.tsx`,
  `apps/web/src/middleware.ts`
- Config: root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `apps/api/src/config/configuration.ts` (the
  stub-mode fallbacks), `apps/web/next.config.ts`, `docker-compose.yml`
- Data model: `apps/api/prisma/schema.prisma`, `packages/types/src/index.ts`
- Canonical module: `apps/api/src/modules/products/` (module, controller, service, repository, one DTO, the
  service spec)

Named scopes, read:

- **`storefront`:** `app/[locale]/layout.tsx`, `middleware.ts`, `lib/api.ts`, one page with its Server Action
  (`app/[locale]/products/[slug]/page.tsx` + `app/actions/cart.ts`), and the white-label fork points
  `config/brand.ts` + `app/globals.css`.
- **`admin`:** `app/[locale]/admin/layout.tsx` (the auth gate), `lib/admin/api.ts`,
  `components/admin/data-table.tsx`, one admin page with its action (`admin/products/` +
  `app/actions/admin/products.ts`), `roles.guard.ts`, and `products.controller.ts` for the admin endpoints.
- **`platform`:** `main.ts`, `app.module.ts`, `configuration.ts`, `schema.prisma`, `.github/workflows/ci.yml`.
- **`ai-layer`:** `CLAUDE.md`, the `paths:` headers of `.claude/rules/**`, each skill's and subagent's
  frontmatter (name + description), `.claude/shared/story/rules.md`, and the hooks in `.claude/settings.json`.

For any other scope, read only the subset relevant to it, plus the matching files in `products/` to compare
against the canonical pattern. For a module scope, also read its `.claude/plans/<module>-module.md` if it exists
(background).

### Step 4: Understand Current State

Recent activity:
!`git log -15 --oneline`

Branch and working tree:
!`git status --short --branch`

Then:

- **Stories in progress:** for each `.agents/stories/*/LOGS.md`, the last command entry and its `Next step:`.
- **Epics:** the `status` in each `.agents/epics/*/` header.
- **GitHub, if `gh` is available** (skip silently otherwise):
  - `gh pr list --state open --limit 10`
  - `gh issue list --state open --limit 15`
  - `gh run list --limit 3`: the last CI runs. The required checks are `lint`, `typecheck`, `test`, `e2e`, `build`.

## Output Report

If a scope or intent was given, restate it on the first line, and constrain the report to it (skip the sections
that don't apply). Keep it scannable: bullets and headers, no long prose.

### Task Context (if loaded)

- Issue/PR: number, title, a one-line goal, the acceptance criteria / checklist
- Story or epic: where it stands (last log entry, next step; epic status and how many stories it has)
- Legacy plan/prompt: its name, what it specifies, and whether it looks already executed (compare against the git
  log and the code)

### Project Overview

- Purpose (white-label, fork-per-client, agent-first), and the current MVP progress against PRD §10 success
  criteria

### Architecture

- The monorepo layout and the role of each app/package
- Key patterns:
  - the 9-file NestJS module, and controller/service/repository layering
  - provider ports with stub adapters (payments, mail, newsletter, storage, search)
  - Server Components + Server Actions
  - the `@repo/types` build flow

### Routes and flows (`storefront` and `admin` scopes)

One line per page or flow: route → Server Action or read helper → API endpoint → NestJS module. For example:
`/[locale]/products/[slug]` → `lib/api.ts` → `GET /products/:slug` → `products`. Name the e2e spec that covers it,
or "no e2e".

### Tech Stack

- Languages and versions, frameworks, build tools, testing frameworks: only what's relevant to the scope

### Core Principles & Guardrails

Always include these repo-specific traps:

- Never run `prisma migrate dev` (GENERATED `searchVector` column): use the `schema-migration` skill
- Route dev/lint/typecheck through turbo (`pnpm dev --filter @repo/api`), not `pnpm --filter @repo/api dev`
- `@repo/types`: no decorators, built to `dist/`
- No `PrismaService` in services; DTO fields need both `class-validator` and `@ApiProperty`; tests use factories
- All code is in English, whatever the chat language; user-facing copy lives in the `es`/`en` message files

### Current State

- The branch, uncommitted changes, and recent focus
- Stories in progress and epic status
- Open PRs/issues and the last CI result (if available)
- Immediate observations (stale plans, failing CI, drift from conventions). Note them; don't audit.

### Suggested Next Step

Recommend one:

- a new product area or epic → `plan-create-prd`
- an epic with an agreed architecture → `plan-slice-epic`
- a GitHub issue to build → `/story-spec GH-<n>`
- a story in progress → `/story-resume GH-<n>`
- a very small change → direct implementation, then `/validate` and `/commit`

`/planning` and `/execute` remain only for legacy plans in `.claude/plans/`.
