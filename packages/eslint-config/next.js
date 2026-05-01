import pluginNext from '@next/eslint-plugin-next';
import { globalIgnores } from 'eslint/config';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import { config as baseConfig } from './base.js';

/**
 * Next.js + React overlay on top of the strict base config.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nextJsConfig = [
  ...baseConfig,

  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),

  // React rules
  {
    files: ['**/*.{ts,tsx,jsx}'],
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    settings: { react: { version: 'detect' } },
  },

  // Next.js plugin (replaces legacy eslint-config-next)
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { '@next/next': pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs['core-web-vitals'].rules,
    },
  },

  // React Hooks
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { 'react-hooks': pluginReactHooks },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // New JSX transform (React 17+) — React import not required in scope
      'react/react-in-jsx-scope': 'off',
    },
  },

  // JSX components: relax explicit-function-return-type. Components return
  // JSX.Element implicitly and adding `: JSX.Element` everywhere is noise.
  // Strict rule still applies to non-JSX TS files via base config.
  {
    files: ['**/*.{tsx,jsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
