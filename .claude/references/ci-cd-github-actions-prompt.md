# Feature Request: CI/CD via GitHub Actions

Source: `.claude/docs/ai-coding-project-setup-guide.md` §13.

## Goal

Add a `.github/workflows/ci.yml` that runs automatically on every push and pull request to `main`, giving us a **green-check / red-X** safety net. The robot must replicate every gate a human would run locally before committing:

1. **Lint** — ESLint + Prettier across all packages.
2. **Typecheck** — `tsc --noEmit` across all packages (note: `packages/types` must be **built** before typecheck because the api/web resolve it via package `exports` at runtime; CLAUDE.md §2 "Workspace Package Build Flow" documents this).
3. **Test** — Jest unit + integration tests. The api tests need a live Postgres 16 and Redis 7 (BullMQ + Prisma touch them). Coverage report uploaded as an artifact.
4. **E2E** — Playwright admin specs from commit `d9bcdd4` (`apps/web/e2e/tests/admin/*.spec.ts`). Needs the api running on `:3001` with a seeded DB AND the web app running on `:3000`.
5. **Build** — `pnpm build` topologically (Turborepo handles the order). Turbo cache restored + saved across runs so subsequent builds are fast.

## Constraints

- **GitHub Actions only.** No third-party CI services. Public free-tier minutes for our usage band.
- **No paid services.** Postgres + Redis must run as job service containers (free GitHub-hosted runner feature) — NOT cloud-hosted DBs.
- **Reproducible.** A fresh clone (a white-label fork — see [[whitelabel_strategy]]) must boot CI on first push without any manual setup. Specifically: no preconfigured secrets beyond what `.env.example` already documents, no manual DB provisioning, no hand-installed Playwright browsers.
- **Honor the workspace build flow.** Per CLAUDE.md §2, `pnpm --filter @repo/api dev` bypasses Turbo. CI MUST route through `pnpm build` or `pnpm <task>` at the root so `^build` ordering is enforced; direct filter calls only work after a root build has run.
- **Concurrency control.** A new push to a PR branch should cancel the in-flight run for that same branch (don't pile up).
- **Caching.** pnpm store + Turbo cache must persist across runs via `actions/cache` (or pnpm's setup-node integration). A no-op-since-last-green run should be sub-2 minutes.
- **Secret hygiene.** Required secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `STRIPE_*`) must come from GitHub repo secrets — never hardcoded in YAML. The test job must work with stub adapters when API keys are absent (matches the `STRIPE_SECRET_KEY=''` → `StubPaymentProvider` pattern already in `apps/api/src/modules/payments`).
- **Single workflow file.** Keep `.github/workflows/ci.yml` self-contained. No matrix-bloat — Node 20 only.
- **Status checks for branch protection.** Job IDs must be stable so `lint`, `typecheck`, `test`, `e2e`, `build` can be added as required checks in GitHub branch protection settings.

## What "done" looks like

- [ ] `.github/workflows/ci.yml` exists at the repo root path.
- [ ] Five jobs (`lint`, `typecheck`, `test`, `e2e`, `build`) run in parallel where possible.
- [ ] `test` and `e2e` jobs spin up Postgres 16 + Redis 7 service containers, run Prisma migrations, run seed.
- [ ] `e2e` job builds + starts both apps in the background and waits for `/health` before the Playwright run.
- [ ] Coverage report uploaded as an artifact on every push.
- [ ] Playwright HTML report uploaded as an artifact when the `e2e` job fails (so we can debug).
- [ ] pnpm store and Turbo cache restored from previous runs via `actions/cache`.
- [ ] Concurrency group cancels stale runs on the same PR branch.
- [ ] First run on a fresh push lands green (or yields a clean, actionable failure — not infra noise).
- [ ] README.md or CLAUDE.md updated with a one-paragraph "CI" section pointing at the workflow and listing required secrets.

## Out of scope

- **Deployment.** This is verification only. Pushing images to a registry, deploying to a server, or running migrations in prod is §14+.
- **Code coverage gating.** We upload coverage as an artifact but do NOT fail the build on a coverage drop. (Add codecov.io later if it becomes a real concern.)
- **Multi-Node-version matrix.** Single Node 20 row.
- **Multi-OS matrix.** Ubuntu only.
- **Release automation / changelogs / version bumps.** Out of scope for §13.

## Open questions to resolve during planning

1. **`pnpm` version pinning** — the root `packageManager` field says `pnpm@9.0.0`; the workflow should use the same pin to avoid lockfile surprises. Confirm `corepack enable` or explicit `pnpm/action-setup` version.
2. **Playwright browser caching** — `~/.cache/ms-playwright` is ~1 GB; cache it explicitly or use `--with-deps` cleanly each run? Trade-off: cold install ~2 min, cached restore ~10 sec.
3. **E2E job — health-check polling vs `wait-on`** — pick one and document.
4. **`packages/types` build ordering** — `pnpm install` doesn't build workspace packages by default. Confirm whether `pnpm build` at the root is enough (Turbo handles `^build`) or if an explicit `pnpm --filter @repo/types build` is needed as a prerequisite step for the typecheck/test jobs.
5. **Required env vars** — survey `apps/api/src/config/configuration.ts` for non-defaulted env vars. Anything without a `.default()` must be passed via job `env:` blocks with safe stub values.

## Reference patterns to mirror

- `apps/web/e2e/tests/admin/*.spec.ts` — the five specs the e2e job must pass.
- `docker-compose.yml` — the postgres/redis configurations the service containers must match (PG 16, Redis 7).
- `apps/api/prisma/seed.ts` — what runs after migrations to give E2E its admin user.
- `turbo.json` — for the build/lint/test/check-types task graph CI invokes.
