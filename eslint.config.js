// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Shared base config — TypeScript rules used by all packages.
 * Type-aware rules are handled by `tsc --noEmit` in CI; this config
 * covers stylistic and logic rules that work without a tsconfig project.
 */
const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow unused vars when prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow explicit any — CLAUDE.md requires a // TODO: comment when used
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow require() in config/script files
      '@typescript-eslint/no-require-imports': 'warn',
      // Allow initializing let vars with a default before conditional assignment
      'no-useless-assignment': 'off',
    },
  },
);

/**
 * Client config — adds React hooks rules.
 */
const clientConfig = tseslint.config(
  ...baseConfig,
  reactHooks.configs['recommended-latest'],
);

export { baseConfig, clientConfig };
