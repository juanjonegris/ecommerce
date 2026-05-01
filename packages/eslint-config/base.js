import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import onlyWarn from 'eslint-plugin-only-warn';
import turboPlugin from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';

/**
 * Strict, type-aware base ESLint flat config for the monorepo.
 * Consumed by next.js, nestjs.js, and react-internal.js.
 *
 * Designed for an AI-self-correction feedback loop:
 *   - strictTypeChecked + stylisticTypeChecked surface unsafe code at lint time
 *   - explicit-function-return-type forces clear contracts
 *   - import-x order matches CLAUDE.md §4 (5 groups)
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  // 1) ESLint core recommended
  js.configs.recommended,

  // 2) typescript-eslint strict + stylistic, type-aware — scoped to TS files only.
  //    Spread across all configs in the preset and tag each with a `files` filter
  //    so JS config files (eslint.config.js, prettier.config.js) don't trigger
  //    "file not in project" errors.
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.{ts,tsx,mts,cts}'],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.{ts,tsx,mts,cts}'],
  })),

  // 3) Modern projectService for type-aware rules.
  //    projectService is faster than `project: true` and works correctly across
  //    a pnpm workspace (auto-discovers each package's tsconfig.json).
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
  },

  // 4) Explicit rule choices on top of the strict preset.
  //    Per CLAUDE.md §1: every function has an explicit return type, no `any`,
  //    no floating promises, no unsafe ops.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },

  // 5) Disable type-aware rules on JS config files (no tsconfig coverage).
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // 6) Import order — 5 groups per CLAUDE.md §4:
  //    builtin → external → internal (@repo/*) → parent (@/*) → sibling/index.
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '@repo/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'parent', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // 7) Turbo plugin — flag undeclared env vars used at build time.
  {
    plugins: { turbo: turboPlugin },
    rules: { 'turbo/no-undeclared-env-vars': 'warn' },
  },

  // 8) onlyWarn — registered to convert errors to warnings, paired with
  //    `--max-warnings 0` in app lint scripts so warnings still fail the build.
  {
    plugins: { onlyWarn },
  },

  // 9) Prettier compatibility — disable rules that conflict with Prettier.
  //    MUST be last so its disables override earlier configs.
  eslintConfigPrettier,

  // 10) Global ignores.
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },
];
