import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // TS 项目关闭 no-undef（typescript-eslint 官方建议）：类型标注（如 NodeJS.Timeout）
      // 会被 core 规则误报，未定义标识符由 tsc 负责检查。
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
  {
    // test 文件被 tsconfig exclude（dist 不含 test.js），type-aware parser 找不到
    // project 会 parse error（R-6：34 errors 门失效）。test 文件的类型检查由 tsc/vitest 负责。
    ignores: ['dist/', 'node_modules/', 'src/**/*.test.ts'],
  },
]
