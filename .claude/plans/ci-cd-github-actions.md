# Feature: ci-cd-github-actions

Validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

A single GitHub Actions workflow (`.github/workflows/ci.yml`) that runs five parallel jobs — `lint`, `typecheck`, `test`, `e2e`, `build` — on every push and pull request targeting `main`. Each job replicates a gate a developer would run locally before committing. The workflow is the safety net for a solo dev + AI-agent collaboration model: it catches a regression before it ships, regardless of who (or what) authored the commit.

Verification only. Deployment, image publishing, and release automation are out of scope (setup-guide §14+).

## User Story

As a **solo developer collaborating with AI agents on a white-label e-commerce platform**
I want to **see every push automatically lint, type-check, unit-test, E2E-test, and build on GitHub**
So that **a broken commit is flagged within ~10 minutes of pushing — before I (or a downstream fork) waste time on a regression**.

## Problem Statement

The repo has 18 unpushed commits and no automated verification. Right now, the only guarantee that `main` is healthy is whether the developer remembered to run `pnpm lint` + `pnpm typecheck` + `pnpm --filter @repo/api test` + `pnpm --filter @repo/web test:e2e` locally before committing. A husky `lint-staged` hook catches lint/format but does NOT run typecheck, unit tests, or E2E. Once a white-label fork is taken from `main`, that fork inherits whatever state was last pushed — including any silent break.

## Solution Statement

A self-contained GitHub Actions workflow that:

1. **Runs on every push + PR to `main`** — no manual trigger required.
2. **Spins up Postgres 16 + Redis 7 as service containers** so the api's Prisma + BullMQ + cache paths execute against real infra (not mocks).
3. **Applies Prisma migrations + seeds** the same way local dev does, then runs Jest and Playwright against that DB.
4. **Caches** pnpm store, Turbo cache, and Playwright browsers so warm runs finish in ~2 min.
5. **Concurrency-cancels** stale runs on the same PR branch.
6. **Uploads artifacts** — Jest coverage on every run, Playwright HTML report on E2E failure.
7. **Exposes stable job IDs** (`lint`, `typecheck`, `test`, `e2e`, `build`) so they can be wired into GitHub branch protection as required checks.

The workflow honors the workspace build flow (CLAUDE.md §2 → §3 "Workspace Package Build Flow"): all task invocations go through Turbo from the repo root, so `packages/types` builds before any package that imports it. No paid services. No multi-OS or multi-Node matrix.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `CLAUDE.md` (§2 Tech Stack, §3 Workspace Package Build Flow lines ~118-129) — Why: explains why all task invocations must route through Turbo at the root; direct `pnpm --filter @repo/api dev`-style calls bypass `^build` and fail with `ERR_MODULE_NOT_FOUND` on a fresh clone.
- `package.json` (root) — Why: current scripts are `build`, `dev`, `lint`, `format`, `format:check`, `typecheck`, `prepare`. **No `test` script exists at root.** Need to add one + a Turbo `test` task to honor the constraint above.
- `turbo.json` — Why: existing tasks `build`, `lint`, `typecheck`, `dev`. `test` task does NOT exist yet. `build.env` and `dev.env` are the authoritative env-var allowlists; if CI exports anything not in those lists, Turbo will warn (`turbo/no-undeclared-env-vars`).
- `apps/api/package.json` — Why: scripts use `dotenv -e ../../.env --` prefix for all `prisma:*` and `db:seed` commands. **In CI, `.env` does not exist by default; dotenv-cli errors out if missing.** Solution: create `.env` from a workflow step using safe stub values + the CI-only DATABASE_URL/REDIS_URL.
- `apps/api/src/config/configuration.ts` — Why: Zod schema documents what env vars are required. Only four have no default: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Everything else has a sane default (mostly `''` triggering stub-provider mode).
- `apps/api/prisma/seed.ts` (lines 1-30) — Why: seeds `admin@example.com` / `admin123` — the credentials hardcoded in `apps/web/e2e/tests/admin/helpers.ts`. Must run before the E2E job.
- `apps/api/src/modules/health/health.controller.ts` — Why: `GET /health` returns `{ status: 'ok' }` with no DB hit (liveness only). Use it for the API-ready poll. `GET /health/db` and `GET /health/redis` are deeper readiness checks if needed.
- `apps/web/playwright.config.ts` — Why: already has `webServer.command: 'pnpm dev'`, `reuseExistingServer: !process.env.CI`, `retries: process.env.CI ? 2 : 0`, `forbidOnly: !!process.env.CI`. Under CI it will spawn web itself but does NOT start the api. **The api MUST be started separately by the workflow** before Playwright runs.
- `apps/web/e2e/tests/admin/*.spec.ts` (5 specs, commit `d9bcdd4`) — Why: these are the specs the `e2e` job must pass. Several use `test.skip(...)` if seed data is missing — that's fine, the spec still passes.
- `docker-compose.yml` — Why: documents PG 16 / Redis 7 versions + connection users/passwords. CI service containers must match versions. Host ports differ (`5433`/`6380` in compose to avoid clashes with local installs), but CI uses default `5432`/`6379` since the runner has nothing else listening.
- `packages/types/package.json` + `packages/types/tsconfig.json` — Why: `@repo/types` ships compiled CJS in `dist/`. The `build` script is `tsc`. Turbo's `^build` dependency runs this before any consumer. No CI special-casing needed beyond ensuring Turbo handles it.
- `apps/api/tsconfig.json` (line 9) — Why: `paths` override maps `@repo/types` to `../../packages/types/src/index.ts`. Typecheck works against source — `packages/types` doesn't strictly need to be built first for `tsc --noEmit`. But Turbo's `^build` will run it anyway; harmless.
- `apps/api/package.json` `jest.moduleNameMapper` (line 101) — Why: confirms Jest also resolves `@repo/types` to source, so unit tests don't depend on a built `@repo/types`.

### New Files to Create

- `.github/workflows/ci.yml` — The single workflow file with all five jobs.

### Files to Modify

- `package.json` (root) — Add `"test": "turbo run test"` to scripts.
- `turbo.json` — Add a `test` task definition with `dependsOn: ["^build"]`, `inputs: ["$TURBO_DEFAULT$"]`, `outputs: ["coverage/**"]`, `env: [...]` matching the api's runtime needs.
- `apps/web/playwright.config.ts` — Conditionally switch `webServer.command` to a production-like `pnpm start` when `process.env.CI` is set (requires a pre-built `.next`). Falls back to `pnpm dev` locally.
- `CLAUDE.md` (root) — Add a short "## CI" section pointing at the workflow + listing the env vars CI sets.

### Patterns to Follow

- **No deviation from Turbo task graph**. Every job uses `pnpm <task>` at the repo root (e.g. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) so `^build` ordering across workspace packages is enforced. The lone exception is the api's `prisma:*` and `db:seed` scripts, which are package-scoped and must be invoked via `pnpm --filter @repo/api ...` AFTER a root build has populated `packages/types/dist/`.
- **Caching layers** (`actions/setup-node@v4` handles pnpm; `actions/cache@v4` handles Turbo + Playwright browsers). Mirror the pattern in [Turborepo's official CI docs](https://turbo.build/repo/docs/guides/ci-vendors/github-actions) but keep it inline — no reusable composite action for the first cut.
- **Service containers with healthchecks** — every `services:` block declares `--health-cmd` so GitHub Actions blocks subsequent steps until the service is responsive.
- **Concurrency group** — `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` so a force-push to a PR branch cancels the in-flight run.
- **No `--no-verify` / no `--no-warn-ignored` workarounds** — match local lint-staged stringency.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (preserve workspace build flow)

Add the `test` task to Turbo's task graph so `pnpm test` at the root works through Turbo (and respects `^build`). This is the only code change outside `.github/`.

### Phase 2: Core Implementation (the workflow file)

Author `.github/workflows/ci.yml` with five jobs. Each shares a setup prefix (checkout → pnpm/action-setup@v4 → setup-node@v4 with `cache: 'pnpm'` → `pnpm install --frozen-lockfile`). Jobs branch on what they do afterward.

### Phase 3: Integration (Playwright + branch protection prep)

Adjust `apps/web/playwright.config.ts` so the E2E job runs against built `next start` output rather than `next dev`. Document the five stable job IDs in the README so the user can later wire them as required status checks in GitHub branch protection.

### Phase 4: Testing & Validation

Locally simulate the test job with `act` (optional — not required by acceptance criteria) OR push a branch to trigger the workflow on GitHub directly. Verify cold + warm runtimes, artifact uploads, and concurrency cancellation.

---

## STEP-BY-STEP TASKS

Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1 — UPDATE `turbo.json`

- **IMPLEMENT**: Add a `test` task object to the `tasks` map with `dependsOn: ["^build"]`, `inputs: ["$TURBO_DEFAULT$"]`, `outputs: ["coverage/**"]`, and an `env` array containing the env vars Jest needs at runtime: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `NEWSLETTER_PROVIDER`, `SEARCH_PROVIDER`, `SEARCH_FTS_LANGUAGE`.
- **PATTERN**: Mirror the existing `lint` and `typecheck` task shapes (turbo.json lines 25-30).
- **GOTCHA**: The api's `coverageDirectory` is `../coverage` (apps/api/package.json line 110), which resolves to `apps/coverage/`. So `outputs` should be `apps/api/coverage/**` OR change Jest's coverageDirectory. Easier: declare `outputs: ["apps/api/coverage/**"]` (workspace-relative paths in `outputs` are allowed in Turbo 2.x).
- **VALIDATE**: `pnpm turbo run test --dry-run` — should show api participating; no errors.

### Task 2 — UPDATE `package.json` (root)

- **IMPLEMENT**: Add `"test": "turbo run test"` to the `scripts` block, alongside the existing `build`/`dev`/`lint`/`typecheck` entries.
- **PATTERN**: Same shape as line 5 (`"build": "turbo run build"`).
- **GOTCHA**: lint-staged config is fine as-is — it only triggers on staged files and uses ESLint/Prettier directly, not Turbo.
- **VALIDATE**: `pnpm test --dry-run` — Turbo prints what it would run; should include `@repo/api#test`.

### Task 3 — UPDATE `apps/web/playwright.config.ts`

- **IMPLEMENT**: Change `webServer.command` so that under CI it uses production-mode `pnpm start` (requires `next build` to have run beforehand). Locally, keep `pnpm dev`. One-line change: `command: process.env.CI ? 'pnpm start' : 'pnpm dev'`. Also bump `webServer.timeout` to `120 * 1000` (default 60s is too tight for `next start` cold-boot on the runner).
- **PATTERN**: Existing `retries: process.env.CI ? 2 : 0` (line 7) — same conditional pattern.
- **GOTCHA**: `next start` requires `.next/` to exist. The E2E job MUST run `pnpm --filter @repo/web build` before invoking `pnpm --filter @repo/web test:e2e`. Document this in the workflow comments.
- **VALIDATE**: Local sanity: `CI=1 pnpm --filter @repo/web build && CI=1 pnpm --filter @repo/web test:e2e` should boot via `next start` and pass (assuming api is up locally with seeded DB).

### Task 4 — CREATE `.github/workflows/ci.yml`

- **IMPLEMENT**: Single-file workflow with the structure described below.
- **PATTERN**: GitHub Actions composite reuse via a YAML anchor would be ideal, but anchors are not honored by GH Actions — repeat the setup steps in each job. Keep them grouped at the top of each job for readability.
- **GOTCHA**: Many — see the per-job notes below.
- **VALIDATE**: Push a branch to GitHub, watch the Actions tab. First run should be green within 10 min. Warm subsequent run within 2 min.

#### Workflow shape

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  TURBO_TELEMETRY_DISABLED: 1
  NEXT_TELEMETRY_DISABLED: 1

jobs:
  lint: { ... }
  typecheck: { ... }
  test: { ... }
  e2e: { ... }
  build: { ... }
```

#### Shared setup (every job)

```yaml
runs-on: ubuntu-latest
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
    with: { version: 9.0.0 }
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
      cache: 'pnpm'
  - run: pnpm install --frozen-lockfile
  - name: Restore Turbo cache
    uses: actions/cache@v4
    with:
      path: .turbo
      key: turbo-${{ github.job }}-${{ github.sha }}
      restore-keys: |
        turbo-${{ github.job }}-
        turbo-
```

#### Per-job specifics

**`lint`** — adds `pnpm lint` + `pnpm format:check`. No DB, no services.

**`typecheck`** — adds `pnpm typecheck`. No DB, no services. Turbo's `^build` builds `@repo/types` first automatically.

**`test`** — adds:

- `services:` block with `postgres:16-alpine` (env: `POSTGRES_USER=ecommerce`, `POSTGRES_PASSWORD=ecommerce`, `POSTGRES_DB=ecommerce`, ports: `5432:5432`, healthcheck `pg_isready -U ecommerce`) and `redis:7-alpine` (ports: `6379:6379`, healthcheck `redis-cli ping`).
- `env:` block with `DATABASE_URL=postgresql://ecommerce:ecommerce@localhost:5432/ecommerce`, `REDIS_URL=redis://localhost:6379`, `JWT_SECRET=test-jwt-secret-do-not-use-in-prod-32chars-min`, `JWT_REFRESH_SECRET=test-jwt-refresh-secret-do-not-use-in-prod-32chars`, `NODE_ENV=test`.
- A step that writes `.env` at the repo root with the same values (because `apps/api/package.json` `prisma:*` scripts use `dotenv -e ../../.env --` and will fail if missing). Use `printf` heredoc or `cat <<EOF >> .env`. Add `dotenv` to `.gitignore` is already there.
- Run prisma against the live DB:
  - `pnpm --filter @repo/api prisma:generate`
  - `pnpm --filter @repo/api prisma:deploy` (NOT `prisma:migrate` — that's `migrate dev` which prompts).
  - `pnpm --filter @repo/api db:seed`.
- `pnpm test` (root → Turbo → api Jest).
- `actions/upload-artifact@v4` for `apps/api/coverage/` with `name: api-coverage`.

**`e2e`** — adds:

- Same `services:` block as `test`.
- Same `env:` block PLUS `API_URL=http://localhost:3001`, `PUBLIC_WEB_URL=http://localhost:3000`, `CI=1`.
- Same `.env` write step.
- Cache Playwright browsers: `actions/cache@v4` with `path: ~/.cache/ms-playwright` and `key: playwright-${{ runner.os }}-${{ hashFiles('apps/web/package.json') }}`.
- `pnpm --filter @repo/web exec playwright install --with-deps chromium` (only chromium — `playwright.config.ts` only declares one project).
- `pnpm --filter @repo/api prisma:generate && pnpm --filter @repo/api prisma:deploy && pnpm --filter @repo/api db:seed`.
- `pnpm build` (Turbo builds both api and web).
- Start api in background: `pnpm --filter @repo/api start:prod > api.log 2>&1 &` then capture PID. Use a `for i in $(seq 1 30); do curl -sf http://localhost:3001/health && break || sleep 2; done` loop to wait — fail the step if the loop exits without a 200.
- `pnpm --filter @repo/web test:e2e` — Playwright spawns web (`pnpm start` in CI mode after Task 3 edit).
- Always upload Playwright HTML report on failure: `actions/upload-artifact@v4` with `if: failure()`, `path: apps/web/playwright-report/`, `name: playwright-report`.
- Always upload api.log on failure for debugging.

**`build`** — adds `pnpm build`. No DB, no services. Caches the Turbo output directory (already covered by the shared cache step). No artifact upload needed — the build job is purely a smoke test that everything compiles in production mode.

#### Concurrency + cancellation

The top-level `concurrency:` block (shown above) is what cancels stale runs. Verify by force-pushing a PR branch twice in quick succession — the first run should be cancelled mid-flight.

### Task 5 — UPDATE `CLAUDE.md` (root)

- **IMPLEMENT**: Add a `## CI` section near the end (after the testing section) with one paragraph + a code block:

  ```
  ## CI

  Every push and PR to `main` runs `.github/workflows/ci.yml`. Five required
  status checks: lint, typecheck, test, e2e, build. The test + e2e jobs spin
  up postgres:16-alpine + redis:7-alpine service containers, apply prisma
  migrations, seed the DB, and run Jest + Playwright. No real API keys are
  required — providers fall back to stub mode when their key env vars are
  empty (see apps/api/src/config/configuration.ts).

  Required GitHub secrets: none for first run. To enable real Stripe / Resend
  / Mailchimp testing in CI, add the corresponding env vars as repository
  secrets and reference them in the test job's env block.
  ```

- **PATTERN**: Match the style of the existing §6 Testing block — one paragraph + bullets if needed.
- **VALIDATE**: Read the file back; section appears under the table of contents conceptually.

### Task 6 — DOCUMENT branch protection (manual)

- **IMPLEMENT**: This is NOT a file change — it is a manual configuration step on github.com after the workflow lands. Add a note to the plan's "Manual Validation" section.
- **STEPS**: `github.com/<user>/<repo>/settings/branches` → "Add rule" for `main` → require status checks → tick `lint`, `typecheck`, `test`, `e2e`, `build`. Also tick "Require branches to be up to date before merging".
- **VALIDATE**: Open a PR. The "Merge" button should grey out until all five checks are green.

---

## TESTING STRATEGY

### Unit Tests (Backend)

No new tests authored as part of this feature. The existing `pnpm --filter @repo/api test` Jest suite (services across all 10 modules, 80% coverage threshold per `apps/api/package.json` `jest.coverageThreshold`) IS the test suite the `test` job runs. The job's responsibility is to invoke it correctly against live Postgres + Redis.

### E2E Tests (Frontend)

No new tests authored. The existing 5 admin specs from commit `d9bcdd4` ARE the suite the `e2e` job runs:

- `admin-login.spec.ts`
- `admin-product-create.spec.ts`
- `admin-order-status.spec.ts` (uses `test.skip` if no PENDING orders seeded — passes)
- `admin-newsletter-resync.spec.ts` (uses `test.skip` if no subscribers seeded — passes)
- `admin-rbac.spec.ts`

### Edge Cases

- **Stale `.env`**: if `.env` was written to disk in a previous step but step env vars override it, dotenv-cli's behavior is "file values override process env" by default. Use `dotenv-cli`'s `--no-override` option OR ensure `.env` and `env:` block agree. **Resolution**: write `.env` once, do NOT also export the same vars via job-level `env:` — pick one source of truth (writing `.env` is preferred since multiple subsequent npm scripts depend on it).
- **Postgres race**: services with healthchecks block step execution until healthy, but the api process starting in background could outpace healthcheck under load. Mitigation: the api's own bootstrap fails fast if `DATABASE_URL` is unreachable, so a flaky start surfaces in the `wait for /health` polling loop, not silently.
- **Playwright cold cache**: first run downloads ~150 MB of browser binaries (~2 min). Subsequent runs hit the cache (~10 sec). Don't optimize prematurely.
- **Concurrency cancellation mid-migrations**: if a force-push cancels a run partway through `prisma:deploy`, the next run starts from a partially-migrated state. Mitigation: prisma's migration table is the source of truth; a re-run picks up where the previous one left off without issue. **Verified by Prisma docs — migrations are idempotent**.
- **Disk space**: GitHub-hosted runners give ~14 GB free. pnpm + node_modules + Playwright browsers + `.next` build + Turbo cache ≈ 4 GB. Comfortable.
- **`pnpm` version drift**: `packageManager: "pnpm@9.0.0"` in root package.json IS the pin. The `pnpm/action-setup@v4` step explicitly passes the same version so corepack-friendly OR not, behavior is reproducible.

---

## VALIDATION COMMANDS

Execute in order. Stop and fix if any Level 1 or Level 2 command fails.

### Level 1: Lint (REQUIRED — hard gate)

```bash
pnpm lint
pnpm format:check
```

### Level 2: Type Check (REQUIRED — hard gate)

```bash
pnpm typecheck
```

### Level 3: Workflow dry-run (locally)

```bash
# Validate YAML syntax + show resolved graph (no execution).
pnpm turbo run test --dry-run
pnpm turbo run build --dry-run
```

Optionally use [`act`](https://github.com/nektos/act) to simulate the workflow locally (slow on Windows; skip unless investigating a specific failure):

```bash
act -j lint
act -j typecheck
```

### Level 4: Push to a branch on GitHub

```bash
git checkout -b ci-cd-rollout
git push -u origin ci-cd-rollout
# Open https://github.com/<user>/<repo>/actions and watch the run.
```

Verify all five jobs land green. Expected wall-clock cold: ~8-10 min. Warm: ~2-3 min.

### Level 5: Manual Validation

- Confirm the Actions tab shows the run with all 5 jobs.
- Confirm coverage artifact appears under the run's "Artifacts" panel.
- Force-push a no-op commit and watch the previous run get cancelled (concurrency working).
- On the PR, scroll to the bottom: "Required" status checks should list `lint`, `typecheck`, `test`, `e2e`, `build` AFTER branch protection is configured.
- Simulate a regression: introduce a deliberate `any` cast, push, watch `lint` fail with `@typescript-eslint/no-explicit-any`. Revert.

---

## ACCEPTANCE CRITERIA

- [ ] `.github/workflows/ci.yml` exists with the five jobs (`lint`, `typecheck`, `test`, `e2e`, `build`) at the documented job IDs.
- [ ] `turbo.json` has a `test` task with the env-var list above.
- [ ] Root `package.json` has `"test": "turbo run test"`.
- [ ] `apps/web/playwright.config.ts` uses production `pnpm start` under `CI=1`, falling back to `pnpm dev` locally.
- [ ] First push of the branch lands the workflow green on GitHub.
- [ ] Concurrency cancels stale runs on the same PR branch.
- [ ] pnpm store, Turbo cache, and Playwright browsers are restored from cache on warm runs.
- [ ] Coverage artifact appears in the Artifacts panel.
- [ ] Playwright HTML report appears on `e2e` failure (verify by deliberately breaking one spec, watching the failure, then reverting).
- [ ] CLAUDE.md `## CI` section exists.
- [ ] No regressions: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` still pass locally.

---

## WORKFLOW YAML REFERENCE

The executor SHOULD adapt the following excerpts when writing `.github/workflows/ci.yml`. These are reference shapes — node versions, action versions, and step ordering match the constraints above. They are not the final file; the executor must inline-merge the shared-setup pattern across every job.

### Top-of-file

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  TURBO_TELEMETRY_DISABLED: 1
  NEXT_TELEMETRY_DISABLED: 1
  # Stable identifier used inside step scripts to keep things grep-able.
  NODE_VERSION: '20'
  PNPM_VERSION: '9.0.0'
```

### Reusable shared-setup pattern (inlined in every job)

```yaml
- uses: actions/checkout@v4

- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: ${{ env.PNPM_VERSION }}

- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: 'pnpm'

- name: Install
  run: pnpm install --frozen-lockfile

- name: Restore Turbo cache
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ github.job }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ github.job }}-
      turbo-
```

### Lint job

```yaml
lint:
  name: Lint
  runs-on: ubuntu-latest
  steps:
    # ...shared setup...
    - name: Lint
      run: pnpm lint
    - name: Prettier check
      run: pnpm format:check
```

### Typecheck job

```yaml
typecheck:
  name: Typecheck
  runs-on: ubuntu-latest
  steps:
    # ...shared setup...
    - name: Typecheck
      run: pnpm typecheck
```

### Test job (Jest + live PG + Redis)

```yaml
test:
  name: Unit + Integration Tests
  runs-on: ubuntu-latest

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: ecommerce
        POSTGRES_PASSWORD: ecommerce
        POSTGRES_DB: ecommerce
      ports: ['5432:5432']
      options: >-
        --health-cmd "pg_isready -U ecommerce"
        --health-interval 5s
        --health-timeout 5s
        --health-retries 10

    redis:
      image: redis:7-alpine
      ports: ['6379:6379']
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 5s
        --health-timeout 3s
        --health-retries 10

  steps:
    # ...shared setup...

    - name: Write .env for prisma + tests
      run: |
        cat > .env <<'EOF'
        NODE_ENV=test
        DATABASE_URL=postgresql://ecommerce:ecommerce@localhost:5432/ecommerce
        REDIS_URL=redis://localhost:6379
        JWT_SECRET=test-jwt-secret-do-not-use-in-prod-32chars-min
        JWT_REFRESH_SECRET=test-jwt-refresh-secret-do-not-use-in-prod-32chars
        STRIPE_SECRET_KEY=
        RESEND_API_KEY=
        MAILCHIMP_API_KEY=
        KLAVIYO_API_KEY=
        S3_ACCESS_KEY=
        S3_SECRET_KEY=
        S3_BUCKET=
        NEWSLETTER_PROVIDER=stub
        SEARCH_PROVIDER=postgres-fts
        SEARCH_FTS_LANGUAGE=simple
        EOF

    - name: Prisma generate + migrate + seed
      run: |
        pnpm --filter @repo/api prisma:generate
        pnpm --filter @repo/api prisma:deploy
        pnpm --filter @repo/api db:seed

    - name: Run tests
      run: pnpm test

    - name: Upload coverage
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: api-coverage
        path: apps/api/coverage/
        retention-days: 7
```

### E2E job (Playwright + built api + built web)

```yaml
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest

  services:
    postgres: # ...same as test job...
    redis: # ...same as test job...

  env:
    CI: '1'
    API_URL: http://localhost:3001
    PUBLIC_WEB_URL: http://localhost:3000

  steps:
    # ...shared setup...

    - name: Write .env
      run: |
        cat > .env <<'EOF'
        # ...same as test job .env contents...
        EOF

    - name: Cache Playwright browsers
      uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ hashFiles('apps/web/package.json') }}

    - name: Install Playwright browsers
      run: pnpm --filter @repo/web exec playwright install --with-deps chromium

    - name: Prisma migrate + seed
      run: |
        pnpm --filter @repo/api prisma:generate
        pnpm --filter @repo/api prisma:deploy
        pnpm --filter @repo/api db:seed

    - name: Build
      run: pnpm build

    - name: Start API in background
      run: |
        pnpm --filter @repo/api start:prod > api.log 2>&1 &
        echo "API_PID=$!" >> $GITHUB_ENV

    - name: Wait for API health
      run: |
        for i in $(seq 1 30); do
          if curl -sf http://localhost:3001/health > /dev/null; then
            echo "api ready after ${i} attempts"
            exit 0
          fi
          sleep 2
        done
        echo "api never became healthy — dumping log:"
        cat api.log
        exit 1

    - name: Run Playwright
      run: pnpm --filter @repo/web test:e2e

    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: apps/web/playwright-report/
        retention-days: 7

    - name: Upload api.log on failure
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: api-log
        path: api.log
        retention-days: 7
```

### Build job

```yaml
build:
  name: Build
  runs-on: ubuntu-latest
  steps:
    # ...shared setup...
    - name: Build all packages
      run: pnpm build
```

---

## MANUAL STEPS AFTER MERGE

These are NOT automated by the workflow. The user (or an executor running in interactive mode) does them once:

1. **Push the workflow file** so GitHub registers it.
2. **Open the Actions tab** on github.com to verify the first run completes green.
3. **Enable branch protection** on `main`:
   - `github.com/<user>/<repo>/settings/branches`
   - "Add classic branch protection rule" → branch name pattern `main`.
   - Tick "Require status checks to pass before merging".
   - Tick "Require branches to be up to date before merging".
   - In the status checks search box, add: `lint`, `typecheck`, `test`, `e2e`, `build` (these only become selectable AFTER the workflow has run at least once on a PR, so push a throwaway PR first).
4. **(Optional) Add repository secrets** for live-mode provider testing. None are required for the green-on-first-run goal. To enable Stripe + Resend + Mailchimp in CI later:
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `RESEND_API_KEY`
   - `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `MAILCHIMP_WEBHOOK_SECRET`
   - Reference them in the workflow's `.env` write step via `${{ secrets.STRIPE_SECRET_KEY }}` syntax.

---

## NOTES

**Design decisions:**

- **Single workflow file, not split.** A "single source of truth" reads well, makes branch-protection wiring obvious, and stays under ~250 lines. Splitting into `ci-lint.yml`/`ci-test.yml`/etc. is harder to grok.
- **Service containers, not Docker-in-Docker.** Spawning the project's `docker-compose.yml` inside the runner is slower (image pulls + container orchestration overhead) than declaring `services:` blocks. GitHub-managed services share network with the runner job at `localhost`, so no docker network wrangling.
- **Write `.env` once, not also export via `env:`.** Avoids the dotenv-cli override surprise. The `apps/api` prisma scripts hard-code `dotenv -e ../../.env --` — easier to feed them what they expect than to refactor them away from dotenv-cli.
- **Skip `act` as a local validation gate.** `act` on Windows is unreliable (PowerShell heredocs, file permissions, service-container pull failures). Trust the GitHub-hosted runner.
- **No Codecov.** The prompt explicitly says coverage gating is out of scope. Artifact upload only.
- **No multi-Node matrix.** The `engines.node: ">=18"` in `package.json` is loose, but `.nvmrc`-less repos shouldn't pretend they support N versions. One version, current LTS (20).
- **`pnpm start` for the web E2E job (not `dev`).** Two reasons: (1) `next dev` JIT-compiles routes on first request — slow + flaky timeouts in CI; (2) it's the only way to catch production-only bugs like the difference between `force-dynamic` and accidentally-static routes.

**Risks:**

- **`prisma migrate deploy` is not interactive but does not seed.** Mitigation: explicit `db:seed` step after migrations.
- **The first CI run on a fresh fork might lack JWT secrets in repo settings.** Mitigation: workflow uses literal test values inline. Real fork deployment is §14's problem, not §13's.
- **Playwright browser cache key.** If `playwright` package version changes inside `apps/web/package.json` but the cache key was based on a less-specific input, restored binaries could mismatch. Mitigation: key includes `hashFiles('apps/web/package.json')` so any version bump invalidates the cache.
- **`turbo/no-undeclared-env-vars`** could trigger in CI if the workflow exports an env not in `turbo.json`'s task `env` array. Mitigation: cross-reference the workflow's `env:` blocks against turbo.json's `build.env`/`dev.env`/(new) `test.env` arrays before merge.

**Future follow-ups (NOT this feature):**

- Add `dependabot.yml` for monthly pnpm + GitHub Actions version bumps.
- Add a separate `release.yml` triggered on tag for publishing prod Docker images (§14 of setup guide).
- Add Codecov integration once coverage trends matter.
- Pin GitHub Actions versions to commit SHAs (security best practice) — currently using `@v4` major-version refs.

**Confidence Score**: 8.5/10 that execution will succeed on first attempt. The workflow itself is straightforward and well-documented territory. The main uncertainty is the dotenv-cli + workflow `env:` interaction (Edge Case #1) — likely to require one iteration of testing on a real GitHub push. Everything else (pnpm caching, service containers, Playwright browser caching, concurrency) is well-trodden ground.
