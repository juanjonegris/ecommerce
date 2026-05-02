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

  // NestJS API: accommodate decorator-heavy patterns (module classes, DI constructors).
  // Needed because lint-staged runs ESLint from the repo root (finds this config, not
  // apps/api/eslint.config.mjs) when it processes staged apps/api/** files.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/parameter-properties': 'off',
      'no-empty-function': ['error', { allow: ['constructors'] }],
      '@typescript-eslint/no-empty-function': [
        'error',
        { allow: ['constructors', 'decoratedFunctions'] },
      ],
    },
  },

  // NestJS spec/test files: jest mock types trip unsafe-assignment and unbound-method.
  {
    files: ['apps/api/**/*.spec.ts', 'apps/api/**/*.e2e-spec.ts', 'apps/api/**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

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
      // Declaration files in packages/types are not covered by any tsconfig project
      // and should not be linted by the root config (they're ambient declarations only).
      'packages/types/**',
    ],
  },
];
