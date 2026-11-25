# E-commerce slicing rules (GitHub Issues)

Use these for every epic in this repo. `CLAUDE.md`, `.claude/rules/**` and `.claude/shared/story/` win if anything
here is different.

## GitHub conventions

- **Epic:** one parent issue, titled `Epic: <name>`. The body is one paragraph, plus links to
  `.agents/epics/<slug>/prd.md`, `architecture.md` and `stories.md`. Label: `enhancement`.
- **Story:** one sub-issue of the epic per story, titled `<Area> / <Outcome>`, e.g.
  `Storefront / Out-of-stock sign-up form`.
  - Areas: `Storefront`, `Admin`, `API`, `Platform` (infra, CI, tooling).
  - Spikes start with `[SPIKE]`.
- **Labels:** `enhancement` on every story, and `spike` on spikes too. Don't invent other labels; ask the user
  first.
- **Acceptance criteria:** plain bullets under `### Acceptance criteria`. Never Given/When/Then. `/story-spec`
  reads this heading.
- **Dependencies:** a `Blocked by: #<n>` line at the end of the body.
- **Migration epics** end with a `Cutover` story: switch over, redirect the old flow, and handle data in flight.

## Put these in "Conventions every story inherits"

- **Story workflow:** `/story-spec GH-<n>` → `/story-plan` → `/story-implement` → `/story-validate` →
  `/story-review` → `/story-fix` → `/story-retro`. Artifacts go to `.agents/stories/GH-<n>-<slug>/`.
- **Branches:** `GH-<n>-<slug>` (see `.claude/shared/story/story-identifiers.md`). Never work on `main`.
- **Tests:**
  - unit tests on `apps/api/test/factories/` for new services
  - a Playwright spec with `data-testid` for user-facing flows
  - the last acceptance bullet is the validation: "`/story-validate GH-<n>` passes" (format, lint, typecheck,
    test, build)
- **Rules:** `CLAUDE.md` hard constraints, and the `.claude/rules/**` file for each area.

## How to slice across the monorepo

- **Default:** one vertical story per screen or flow, across what it needs: an `apps/api` endpoint + an
  `@repo/types` contract + an `apps/web` page or Server Action.
- **Split per area** only when one side is large, or another story needs it first (for example, a shared
  `@repo/types` contract or a new module that two stories build on).
- **New module:** a new backend domain belongs to the first story that needs it (the `new-api-module` skill).
- **Schema change:** a Prisma schema change belongs to the first story that writes the new data (the
  `schema-migration` skill).

## Where details go

- **Context:** why the story exists, the architecture decisions it applies, out-of-scope items, and related
  stories.
- **Dev Notes:** the module in `apps/api/src/modules/<domain>/` (`products/` is canonical, `payments/` for a
  provider port), the repository and service to reuse, the `@repo/types` file, and the `apps/web` route or Server
  Action.
- **Acceptance criteria:**
  - the behavior, the `es`/`en` copy for user-facing text, and an owner or role check where data is private
  - the tests and the validation bullet
  - a parity check when replacing an existing flow
- **Planning only › Data:** Prisma models, queues, S3 objects.
- **Deployment notes:**
  - the migration name (created by `schema-migration`, applied by `prisma migrate deploy`)
  - env keys to add per environment (`configuration.ts` + `.env.example`, provider keys default to `''`)
  - seed data changes
