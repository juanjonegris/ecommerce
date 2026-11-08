---
name: prime-codebase
description: Primes the agent with deep understanding of this white-label e-commerce monorepo (Next.js 15 + NestJS + Prisma, Turborepo) by reading docs, structure, and key files. Use at the start of a session, when resuming after a break, or before planning/implementing. Optionally loads task context first from GitHub issues/PRs or local plan/reference files, and can narrow the analysis to an app, module, or aspect.
argument-hint: '[#issue | pr:<n> | GitHub URL | plan-name] [scope: api | web | types | <module> | <aspect> | <path>]'
---

# Prime: Load Project Context

## Objective

Build a working understanding of the codebase by analyzing structure, documentation, and key files. If task references are provided, load them **first** so the analysis is anchored to the actual work. If a scope is provided, narrow the analysis to it.

## Argument Parsing

`$ARGUMENTS` may mix task references and a scope, in any order. Classify each token:

| Token form                                                                                            | Meaning                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `#12`, `12`, `12,15`, `github.com/.../issues/12`                                                      | GitHub issue(s)                                                             |
| `pr:34`, `github.com/.../pull/34`                                                                     | GitHub pull request                                                         |
| Matches `.claude/plans/<name>.md` or `.claude/archive/module-prompts/<name>-prompt.md`                | Local plan / feature prompt                                                 |
| `api`, `web`, `types`, `config`                                                                       | App or package scope (`apps/*`, `packages/*`)                               |
| Name of a dir under `apps/api/src/modules/`                                                           | NestJS module scope                                                         |
| Aspect: `auth`, `i18n`, `theming`, `payments`, `logging`, `testing`, `search`, `chat`, `infra`, `ci`… | Cross-cutting aspect scope                                                  |
| Anything that is a literal path                                                                       | Path scope                                                                  |
| Free-form text                                                                                        | Intent — restate it at the top of the report so the user can correct course |

If `$ARGUMENTS` is empty, prime the whole monorepo with no external context.

## Process

### Step 0: Load Task Context (only if task references were given)

**GitHub issues / PRs** — repo is `juanjonegris/ecommerce` (from `git remote -v`). Prefer the `gh` CLI:

- Issue: `gh issue view <n> --json number,title,body,labels,assignees,milestone,comments`
- PR: `gh pr view <n> --json number,title,body,headRefName,files,reviews,comments,statusCheckRollup`
- Linked context: if the body references other issues (`#n`) or plan files, load those too (one level deep).

If `gh` is not installed or not authenticated (`gh auth status` fails), and a GitHub MCP server is connected, use its equivalent issue/PR read tools. If neither is available, tell the user (`winget install GitHub.cli` then `gh auth login`) and continue without that context — do not stop the priming.

Treat the issue/PR title, description, checklist, and acceptance criteria as the task context for everything that follows.

**Local plans / references** — read `.claude/plans/<name>.md` and/or `.claude/archive/module-prompts/<name>-prompt.md`. These are this project's specs: a `-prompt.md` is the feature request, a plan is the output of `/planning` and the input to `/execute`.

Briefly summarize the loaded context before continuing — it frames the rest of the priming. If the task implies a scope (e.g. an issue about discounts), infer it and say so.

### Step 1: Analyze Project Structure

Tracked files (lockfile and binary assets filtered out):
!`git ls-files | grep -v -E 'pnpm-lock\.yaml|\.(png|jpe?g|ico|svg|woff2?)$'`

When scoped, focus on the files under the scope's path(s) and ignore the rest of the listing.

Key locations:

- `apps/api/src/modules/` — one NestJS module per domain (`products` is the canonical reference)
- `apps/api/prisma/` — `schema.prisma`, migrations, seed
- `apps/api/test/factories/` — test data factories
- `apps/web/src/app/[locale]/` — storefront + `admin/` routes; `apps/web/src/app/actions/` — Server Actions
- `apps/web/e2e/` — Playwright (Page Object Model)
- `packages/types/src/` — shared interfaces + Zod schemas (built package)
- `.claude/plans/` — feature plans already executed or pending (`.claude/archive/module-prompts/` holds the historical generation prompts — background only, not rules)

### Step 2: Read Core Documentation

Always read:

- `CLAUDE.md` (root), `apps/web/CLAUDE.md`, and `.claude/rules/**` (path-scoped area rules) — conventions, source of truth
- `.agents/PRD.md` — product scope (note: it lives in `.agents/`, not the root)

Read when relevant to the task/scope (skim headings otherwise):

- `mvp-tool-designs.md` — architecture, data model, agent conventions
- `tech-stack-decision.md`, `stack-evaluation-conclusions.md` — why each tool was chosen
- `README.md`
- Memory index (`MEMORY.md`) is already loaded — use it, don't re-read.

### Step 3: Identify Key Files

Unscoped, read:

- Entry points: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/middleware.ts`
- Config: root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `apps/api/src/config/configuration.ts` (stub-mode fallbacks), `apps/web/next.config.ts`, `docker-compose.yml`
- Data model: `apps/api/prisma/schema.prisma`, `packages/types/src/index.ts`
- Canonical module: `apps/api/src/modules/products/` (module, controller, service, repository, one DTO, service spec)

Scoped, read only the subset relevant to the scope, plus the matching file(s) in `products/` to compare against the canonical pattern. For a module scope, also read its `.claude/plans/<module>-module.md` if it exists.

### Step 4: Understand Current State

Recent activity:
!`git log -15 --oneline`

Branch and working tree:
!`git status --short --branch`

Then, if `gh` is available, check GitHub state (skip silently otherwise):

- `gh pr list --state open --limit 10`
- `gh issue list --state open --limit 15`
- `gh run list --limit 3` — last CI runs (required checks: `lint`, `typecheck`, `test`, `e2e`, `build`)

## Output Report

If a scope or intent was given, restate it on the first line and constrain the report to it (skip sections that don't apply). Keep it scannable — bullets and headers, no long prose.

### Task Context (if loaded)

- Issue/PR: number, title, one-line goal, acceptance criteria / checklist
- Local plan/prompt: name, what it specifies, whether it looks already executed (compare against git log and code)

### Project Overview

- Purpose (white-label, fork-per-client, agent-first) and current MVP progress against PRD §10 success criteria

### Architecture

- Monorepo layout and the role of each app/package
- Key patterns: 9-file NestJS module, controller/service/repository layering, provider interfaces (payments, mail, newsletter, storage, search), Server Components + Server Actions, `@repo/types` build flow

### Tech Stack

- Languages/versions, frameworks, build tools, testing frameworks — only what's relevant to the scope

### Core Principles & Guardrails

Always include these repo-specific traps:

- Never run `prisma migrate dev` (GENERATED `searchVector` column) — use `prisma:deploy` or `migrate dev --create-only` + hand edit
- Route dev/lint/typecheck through turbo (`pnpm dev --filter @repo/api`), not `pnpm --filter @repo/api dev`, or run `pnpm build` first
- `@repo/types`: no decorators, built to `dist/`
- No `PrismaService` in services; DTO fields need both `class-validator` and `@ApiProperty`; tests use factories

### Current State

- Branch, uncommitted changes, recent focus
- Open PRs/issues and last CI result (if available)
- Immediate observations or concerns (stale plans, failing CI, drift from conventions)

### Suggested Next Step

- Relate the task to existing `.claude/plans/` and recommend one: `/planning <feature>` (no plan yet), `/execute .claude/plans/<name>.md` (plan exists, not implemented), or direct implementation (small change). Mention `/validate` and `/commit` as the closing steps.
