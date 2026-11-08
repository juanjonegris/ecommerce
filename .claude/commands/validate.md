---
description: Run lint, typecheck, format, tests, a smoke build, and a rules drift check across the monorepo.
allowed-tools: Bash(pnpm install:*), Bash(pnpm exec prettier:*), Bash(pnpm format:check:*), Bash(pnpm lint:*), Bash(pnpm typecheck:*), Bash(pnpm test:*), Bash(pnpm build:*), Bash(git diff:*), Bash(git status:*), Skill(rules-check-drift)
---

# Validate: Run the full local CI pipeline

Run the gates GitHub Actions runs in `.github/workflows/ci.yml`, in the same order, then check the rules harness for drift. Report PASS/FAIL per step with a short output snippet and an overall verdict. **Stop on the first failure** — do not auto-fix unless the user explicitly asks.

## Steps (run sequentially, stop on failure)

1. **Install** — `pnpm install --frozen-lockfile`
   _If the lockfile is out of sync with `package.json` files, this fails fast and tells the user to refresh `pnpm-lock.yaml`._

2. **Format check** — `pnpm format:check`
   _Prettier. Same gate the `lint` CI job runs after ESLint. Fails on any file with style drift._

3. **Lint** — `pnpm lint`
   _ESLint flat config (`strictTypeChecked` + import-x + Prettier disable). Turbo-mediated so `@repo/types` builds first._

4. **Typecheck** — `pnpm typecheck`
   _`tsc -b --noEmit` per package via turbo. Same `^build` topological order as the CI typecheck job._

5. **Unit + integration tests** — `pnpm test`
   _Routes through turbo to `@repo/api#test` (Jest, 80% coverage threshold, 342+ tests). Other packages have no test script and turbo skips them silently._

6. **Smoke build** — `pnpm build`
   _Topological turbo build: `@repo/types` → `@repo/api` (`nest build`) + `@repo/web` (`next build`). Catches Next.js standalone trace issues and Prisma generate drift before they hit Docker._

7. **Rules drift check** — invoke the `rules-check-drift` skill on the same change set.
   _Advisory: it never fails the run. Report its findings (now-false rules, dead `paths` globs, misplaced rules) under the gate results; apply nothing unless the user asks._

## Reporting rules

- For each step, print one line: `✅ <step>` or `❌ <step>` followed by the time elapsed.
- On failure, print the failing command, the relevant output (last 30 lines is usually enough), and the file:line references it points at. **Then stop.** Do not move to the next step.
- On full success, print a one-line summary: `All 6 gates passed in <total time>.` followed by the drift-check summary.

## Skipped from the local pipeline (intentionally)

- **E2E** (`pnpm --filter @repo/web test:e2e`) — needs `docker compose up -d` first plus a running api + web (the CI e2e job spends ~3 min just on infra startup). Run it on demand, not as part of `/validate`.
- **Docker production build** (`docker compose -f docker-compose.prod.yml build`) — multi-minute build, Docker daemon required. Run before deploys, not on every change.

## Common failure recoveries (suggest, don't apply)

- Format failure → `pnpm exec prettier --write <file>` on the flagged files, then re-run `/validate`.
- Lint failure → most are auto-fixable with `pnpm lint --fix`; type-aware rules (`no-floating-promises`, `no-unsafe-*`) need manual fixes.
- Typecheck failure → look for missing `await`, narrowed `unknown` types, or stale `@repo/types` import after a shared-type change (re-run `pnpm --filter @repo/types build` to refresh `dist/`).
- Test failure → run `pnpm --filter @repo/api test -- <failing-spec>` to iterate on a single file with faster feedback.
- Build failure on `@repo/web` → check `outputFileTracingRoot` and `output: 'standalone'` in `apps/web/next.config.ts` are intact (`.claude/rules/infra/build-ci-docker.md`).

## Notes

- Always use `pnpm <task>` (root, turbo-mediated). Never `pnpm --filter` for `build` / `lint` / `typecheck` / `test` — that bypasses turbo's `^build` graph and crashes with `ERR_MODULE_NOT_FOUND` on fresh clones (`CLAUDE.md` hard constraint 5).
- Do not run `prisma migrate dev` as part of validation — it generates a broken migration for the `Product.searchVector` `Unsupported("tsvector")` column on every run (`CLAUDE.md` hard constraint 6; a hook blocks it).
- This command does not modify any files. It only reports.
