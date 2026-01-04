import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import configPrettier from 'eslint-config-prettier';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
  ...typescriptEslint.configs.recommended,
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: ['return', 'export', 'class', 'function'],
        },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        {
          blankLine: 'any',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
    },
  },
  {
    files: ['web/**/*.{ts,vue}'],
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      ...eslintPluginVue.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        parser: typescriptEslint.parser,
      },
    },
    rules: {
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: {
            max: 1,
          },
          multiline: {
            max: 1,
          },
        },
      ],
    },
  },
  oxlint.configs['flat/recommended'],
  configPrettier,
]);
