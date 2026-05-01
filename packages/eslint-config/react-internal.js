import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import { config as baseConfig } from './base.js';

/**
 * Internal-React-library overlay on top of the strict base config.
 * Used by `packages/ui` (the demo from create-turbo, slated for replacement).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,

  {
    files: ['**/*.{ts,tsx,jsx}'],
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    settings: { react: { version: 'detect' } },
  },

  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { 'react-hooks': pluginReactHooks },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // JSX components: relax explicit-function-return-type. Strict rule still
  // applies to non-JSX TS files via base config.
  {
    files: ['**/*.{tsx,jsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
