import { config as baseConfig } from './base.js';

/**
 * NestJS overlay on top of the strict base config.
 *
 * Accommodates decorator-heavy patterns (parameter properties for DI,
 * empty constructors, decorator-only module classes) without weakening
 * the type-aware safety rules.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nestJsConfig = [
  ...baseConfig,

  // NestJS-specific accommodations
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS modules are decorator-only classes
      '@typescript-eslint/no-extraneous-class': 'off',
      // Constructor DI uses parameter properties (`constructor(private readonly x: X) {}`)
      '@typescript-eslint/parameter-properties': 'off',
      // Empty constructors are common for DI containers and inheritance
      'no-empty-function': ['error', { allow: ['constructors'] }],
      '@typescript-eslint/no-empty-function': [
        'error',
        { allow: ['constructors', 'decoratedFunctions'] },
      ],
    },
  },

  // Jest spec files: Jest's mock typing trips unbound-method
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      // Test factories often return any-shaped data; relax to keep specs readable
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
