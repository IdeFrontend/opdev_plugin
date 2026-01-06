import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
  {
    ignores: [
      'out/',
      'dist/',
      '**/dist/',
      '**/out/',
      '**/node_modules/',
      '**/.idea/',
      '**/.vscode/',
      '**/.vscode-test-web/',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      '**/tsconfig.tsbuildinfo',
      '**/*.vsix',
      'deletePackage.js',
      'package.js',
    ],
  },
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...eslintPluginVue.configs['flat/recommended'],
  {
    plugins: { '@stylistic': stylistic },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: { parser: typescriptEslint.parser },
    },
    rules: {
      curly: [
        'error',
        'all',
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': false,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@stylistic/indent': [
        'error',
        2,
        { SwitchCase: 1 },
      ],
      // 强制 Import/Export 换行的核心配置
      '@stylistic/object-curly-newline': [
        'error',
        {
          ObjectExpression: {
            multiline: true,
            minProperties: 2,
          },
          ObjectPattern: {
            multiline: true,
            minProperties: 2,
          },
          // 只要有 2 个成员，就强制大括号换行
          ImportDeclaration: {
            multiline: true,
            minProperties: 2,
          },
          ExportDeclaration: {
            multiline: true,
            minProperties: 2,
          },
        },
      ],
      // 强制对象属性必须换行（针对普通对象）
      '@stylistic/object-property-newline': [
        'error',
        { allowAllPropertiesOnSameLine: false },
      ],
      // 关键补丁：强制每个解构成员在多行模式下独占一行
      // 某些版本的 stylistic 通过这个规则来约束 import 成员
      '@stylistic/newline-per-chained-call': [
        'error',
        { ignoreChainWithDepth: 1 },
      ],
      '@stylistic/array-bracket-newline': [
        'error',
        {
          multiline: true,
          minItems: 2,
        },
      ],
      '@stylistic/array-element-newline': [
        'error',
        {
          multiline: true,
          minItems: 2,
        },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: 'import',
          next: '*',
        },
        {
          blankLine: 'any',
          prev: 'import',
          next: 'import',
        },
        {
          blankLine: 'always',
          prev: [
            'const',
            'let',
            'var',
          ],
          next: '*',
        },
        {
          blankLine: 'any',
          prev: [
            'const',
            'let',
            'var',
          ],
          next: [
            'const',
            'let',
            'var',
          ],
        },
        {
          blankLine: 'always',
          prev: '*',
          next: [
            'function',
            'class',
            'export',
            'if',
            'for',
            'switch',
            'try',
            'return',
          ],
        },
        {
          blankLine: 'always',
          prev: [
            'function',
            'class',
            'export',
            'if',
            'for',
            'switch',
            'try',
          ],
          next: '*',
        },
      ],
      '@stylistic/function-paren-newline': [
        'error',
        'multiline',
      ],
      '@stylistic/function-call-argument-newline': [
        'error',
        'consistent',
      ],
      '@stylistic/quotes': [
        'error',
        'single',
        { avoidEscape: true },
      ],
      '@stylistic/semi': [
        'error',
        'always',
      ],
      '@stylistic/type-annotation-spacing': [
        'error',
        {
          before: false,
          after: true,
        },
      ],
      '@stylistic/comma-dangle': [
        'error',
        'always-multiline',
      ],
      '@stylistic/comma-spacing': [
        'error',
        {
          before: false,
          after: true,
        },
      ],
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous: 'always',
          named: 'never',
          asyncArrow: 'always',
        },
      ],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/keyword-spacing': [
        'error',
        {
          before: true,
          after: true,
        },
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always',
      ],
      '@stylistic/array-bracket-spacing': [
        'error',
        'never',
      ],
      '@stylistic/computed-property-spacing': [
        'error',
        'never',
      ],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/arrow-parens': [
        'error',
        'always',
      ],
      '@stylistic/eol-last': [
        'error',
        'always',
      ],
      '@stylistic/linebreak-style': [
        'error',
        'unix',
      ],
      '@stylistic/operator-linebreak': [
        'error',
        'before',
        {
          overrides: {
            '=': 'after',
            '+=': 'after',
            '-=': 'after',
          },
        },
      ],
      '@stylistic/multiline-ternary': [
        'error',
        'always-multiline',
      ],
      '@stylistic/indent-binary-ops': [
        'error',
        2,
      ],
      '@stylistic/brace-style': [
        'error',
        'stroustrup',
      ],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxEOF: 0,
        },
      ],
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: { max: 1 },
          multiline: { max: 1 },
        },
      ],
      'vue/html-closing-bracket-newline': [
        'error',
        {
          singleline: 'never',
          multiline: 'always',
        },
      ],
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always',
          },
          svg: 'always',
          math: 'always',
        },
      ],
    },
  },
  oxlint.configs['flat/recommended'],
]);
