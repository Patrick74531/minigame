module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint', 'prettier'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    env: {
        browser: true,
        es2020: true,
        node: true,
    },
    globals: {
        cc: 'readonly',
        CC_DEV: 'readonly',
        CC_DEBUG: 'readonly',
        CC_EDITOR: 'readonly',
        CC_PREVIEW: 'readonly',
        CC_BUILD: 'readonly',
    },
    rules: {
        // TypeScript 规则
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-non-null-assertion': 'off',

        // 通用规则
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prefer-const': 'error',
        'no-var': 'error',

        // Prettier 集成
        'prettier/prettier': 'error',
    },
    ignorePatterns: ['node_modules/', 'library/', 'temp/', 'build/', 'local/', 'devvit/'],
};
