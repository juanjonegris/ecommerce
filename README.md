# White-label e-commerce platform

NestJS REST API (`apps/api`) + Next.js storefront and admin (`apps/web`) in a pnpm + Turborepo monorepo. Each client gets its own fork and deployment; see `.agents/PRD.md` §5.3 for the white-label strategy. Agent conventions live in `CLAUDE.md` and `.claude/rules/`.

## Local development

```bash
cp .env.example .env
docker compose up -d                       # Postgres 16, Redis 7, MinIO
pnpm install
pnpm --filter @repo/api prisma:deploy
pnpm --filter @repo/api db:seed
pnpm dev                                   # api :3001 (Swagger /docs), web :3000
```

Always run tasks through turbo (`pnpm <task>`, `pnpm dev --filter <pkg>`) so `@repo/types` is built first. All provider keys can stay empty: Stripe, Resend, Mailchimp/Klaviyo, and S3 fall back to stub adapters (`apps/api/src/config/configuration.ts`).

## CI

`.github/workflows/ci.yml` runs on every push and PR to `main`: `lint`, `typecheck`, `test`, `e2e`, `build`. `test` and `e2e` start Postgres + Redis service containers, apply migrations with `prisma:deploy`, and seed.

**Required secrets:** none.

**Optional secrets** for live-mode provider testing (add under Settings → Secrets and variables → Actions, then reference them in the workflow's `.env` write step):

| Secret                                        | Purpose                                                |
| --------------------------------------------- | ------------------------------------------------------ |
| `STRIPE_SECRET_KEY`                           | Real Stripe test-mode key instead of the stub provider |
| `STRIPE_WEBHOOK_SECRET`                       | Live signed webhook verification                       |
| `RESEND_API_KEY`                              | Real email send instead of the log-only stub           |
| `MAILCHIMP_API_KEY` + `MAILCHIMP_AUDIENCE_ID` | Live Mailchimp adapter                                 |
| `KLAVIYO_API_KEY` + `KLAVIYO_LIST_ID`         | Live Klaviyo adapter                                   |

**Branch protection** (manual, once): Settings → Branches → rule for `main` → require `lint`, `typecheck`, `test`, `e2e`, `build`.

## Production images

| Image           | Dockerfile            | Runner stage                                          | Approx size |
| --------------- | --------------------- | ----------------------------------------------------- | ----------- |
| `ecommerce-api` | `apps/api/Dockerfile` | `pnpm deploy --prod` flat tree + Prisma client (musl) | ~300 MB     |
| `ecommerce-web` | `apps/web/Dockerfile` | Next.js `output: 'standalone'` bundle + static/public | ~180 MB     |

```bash
cp .env.production.example .env.production       # then fill in secrets
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
# Optional demo data:
docker compose -f docker-compose.prod.yml run --rm api node_modules/.bin/ts-node prisma/seed.ts
```

- The one-shot `migrate` service runs `prisma migrate deploy` before `api` starts. Migrations are operator-run, not on-boot, because a partially applied migration has no automatic rollback during a multi-replica rollout.
- The prod stack uses project name `ecommerce-prod` and `_prod` volumes, and binds only ports 3000 and 3001, so it can run beside the dev compose.
- Empty provider keys in `.env.production` keep the stub adapters, so first boot works without real Stripe/Resend/Mailchimp keys.
