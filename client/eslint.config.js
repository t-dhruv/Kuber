// @ts-check
import { clientConfig } from '../eslint.config.js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  ...clientConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Inline empty interface extending parent is a common, harmless React pattern
      '@typescript-eslint/no-empty-object-type': 'off',
      // Ternary expressions used as statements are intentional in some toggle patterns
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
    },
  },
  // Suppress "rule not found" errors for react-hooks rules referenced in eslint-disable comments.
  // The actual hook safety is enforced by TypeScript + code review.
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
);
