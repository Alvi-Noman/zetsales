import sharedPreset from '@zetsales/config/eslint-preset';
import tsEslintParser from '@typescript-eslint/parser';

export default [
  ...sharedPreset,
  {
    files: ['src/**/*.ts'],
    ignores: ['dist/**'],
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
      globals: {
        chrome: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['*.mjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
  },
];
