const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

// Flat-config wrapper for the existing .eslintrc.json rule set —
// ESLint 9 dropped support for .eslintrc.* files. Rules are unchanged;
// this only makes `npm run lint` runnable again.
module.exports = [
    {
        ignores: [
            '.next/**',
            'node_modules/**',
            'public/**',
            '*.config.js',
            '*.config.ts',
            'sentry.*.ts',
            'test_ws.js',
            'playwright-report/**',
            'test-results/**',
        ],
    },
    ...nextCoreWebVitals,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
