---
description: Prime agent with codebase understanding
argument-hint: [optional scope: app | package | module | aspect | path]
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, and key files. If `$ARGUMENTS` is provided, narrow the analysis to that scope (e.g. `api`, `web`, `products`, `multi-tenancy`, `apps/api/src/modules/orders`); if empty, prime the whole monorepo.

## Process

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
!`tree -L 3 -I 'node_modules|.next|.turbo|.git|dist|build'`

If `$ARGUMENTS` names a scope, restrict the rest of the steps to that scope: an app under `apps/`, a package under `packages/`, a NestJS module under `apps/api/src/modules/`, an aspect (multi-tenancy, theming, auth, i18n, testing, payments, logging…), or a literal path. Free-form intents: restate them at the top of the report so the user can correct course.

### 2. Read Core Documentation

- Read CLAUDE.md (root + per-app if present)
- Read PRD.md, mvp-tool-designs.md, stack-evaluation-conclusions.md, tech-stack-decision.md if they exist
- Read README files at project root and major directories

### 3. Identify Key Files

Based on the structure, identify and read:

- Main entry points (`apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/middleware.ts`)
- Core configuration files (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `nest-cli.json`, `next.config.*`, `docker-compose.yml`)
- Key model/schema definitions (`apps/api/prisma/schema.prisma`, `packages/types/src/*.ts`)
- Important service or controller files (canonical reference: `apps/api/src/modules/products/`)

When scoped, only read the subset relevant to `$ARGUMENTS`.

### 4. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

## Output Report

If `$ARGUMENTS` was provided, restate the resolved scope on the first line and constrain the report to it (skip sections that don't apply).

Provide a concise summary covering:

### Project Overview

- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture

- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack

- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles

- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State

- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

**Make this summary easy to scan - use bullet points and clear headers.**
