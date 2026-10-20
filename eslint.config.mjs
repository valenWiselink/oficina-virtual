import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import typescriptEslint from 'typescript-eslint';

import pixelAgentsPlugin from './eslint-rules/pixel-agents-rules.mjs';

export default [
  {
    files: ['**/*.ts'],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
      'simple-import-sort': simpleImportSort,
      'pixel-agents': pixelAgentsPlugin,
    },

    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      curly: 'error',
      eqeqeq: 'error',
      'no-throw-literal': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'pixel-agents/no-inline-colors': 'error',
    },
  },
  {
    // The desktop shell's colour constants (the webview has its own exemption).
    files: ['desktop/colors.ts'],
    rules: { 'pixel-agents/no-inline-colors': 'off' },
  },
  eslintConfigPrettier,
];
