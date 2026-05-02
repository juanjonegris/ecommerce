import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// When running `prisma studio` (or any bare `prisma` CLI command) there is no
// dotenv-cli wrapper. Load the root .env ourselves so DATABASE_URL is available
// before this config is evaluated. Already-set env vars are never overridden.
if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(__dirname, '../../.env') });
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL is not set — run prisma commands via the npm scripts',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
});
