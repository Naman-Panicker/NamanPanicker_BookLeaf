import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// These rules keep cookie auth in a few known places, so the bearer-JWT fallback stays a small change.
const FALLBACK_NOTE = 'ADR-0003 lists what changes if cookie auth falls back to bearer JWTs.';

const noCookieHandling = [
  {
    selector: "MemberExpression[property.name='cookies']",
    message: `Only apps/api/src/auth/sessions.ts reads cookies. ${FALLBACK_NOTE}`,
  },
  {
    selector: 'CallExpression[callee.property.name=/^(cookie|clearCookie)$/]',
    message: `Only apps/api/src/auth/sessions.ts sets cookies. ${FALLBACK_NOTE}`,
  },
];

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/.next/', '**/next-env.d.ts', '**/src/generated/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/auth/sessions.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noCookieHandling] },
  },
  {
    files: ['apps/api/src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...noCookieHandling,
        {
          selector: "CallExpression[callee.object.name='request'][callee.property.name='agent']",
          message: `Use signedInAgent from the test harness. ${FALLBACK_NOTE}`,
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: ['apps/web/lib/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: `Call the API through apps/web/lib. ${FALLBACK_NOTE}` },
        { name: 'EventSource', message: `Open streams through apps/web/lib. ${FALLBACK_NOTE}` },
      ],
    },
  },
);
