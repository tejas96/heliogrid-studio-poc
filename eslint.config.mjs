import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Deliberately narrow.
 *
 * This config exists to find DEAD CODE, not to relitigate 83k lines of style.
 * The full `js.configs.recommended` / `tseslint.configs.recommended` sets are
 * NOT enabled: on this repo they bury the signal we care about under thousands
 * of `no-explicit-any` reports. Turn them on later, one rule at a time, once
 * the dead-code sweep has landed.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      // A detached git worktree lives here and carries its own eslint config.
      '.claude/**',
      '.superpowers/**',
      'next-env.d.ts',
      '**/*.d.ts',
      'tsconfig.tsbuildinfo',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'unused-imports': unusedImports,
      // 30 `eslint-disable react-hooks/exhaustive-deps` comments already sit in
      // this source tree. Without the plugin every one of them is an error
      // ("definition for rule not found"), so the plugin is not optional here.
      'react-hooks': reactHooks,
    },
    rules: {
      // A hook called conditionally is a real crash, not a style opinion.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Dead imports and dead locals — the whole point of this config.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Code that can never run.
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unsafe-negation': 'error',
      'no-useless-catch': 'error',
      'no-useless-rename': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
