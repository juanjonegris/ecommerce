// Root ESLint flat config.
// Per-package configs (apps/*/eslint.config.{js,mjs}, packages/*/eslint.config.{js,mjs})
// are still authoritative when running `pnpm lint` from inside a workspace.
// This root config exists so tools that invoke ESLint from the repo root
// (lint-staged, IDE integrations) can find a config when linting individual files.

import { config as baseConfig } from '@repo/eslint-config/base';
import { nextJsConfig } from '@repo/eslint-config/next-js';
import { config as reactInternalConfig } from '@repo/eslint-config/react-internal';

export default [
  // Next.js rules for the storefront/admin (and the demo apps that ship with create-turbo)
  ...nextJsConfig.map((c) => ({
    ...c,
    files: ['apps/web/**/*.{ts,tsx,jsx}', 'apps/docs/**/*.{ts,tsx,jsx}'],
  })),

  // React rules for internal UI packages (demo packages/ui until it's deleted)
  ...reactInternalConfig.map((c) => ({
    ...c,
    files: ['packages/ui/**/*.{ts,tsx,jsx}'],
  })),

  // Default strict base for everything else (config files, scripts, other packages)
  ...baseConfig,

  // Never lint vendor/build artifacts from the root
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/out/**',
      'pnpm-lock.yaml',
    ],
  },
];
