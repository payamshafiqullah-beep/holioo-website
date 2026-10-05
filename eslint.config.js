import js from '@eslint/js';
import globals from 'globals';
import { scriptGlobals } from './tools/script-globals.mjs';

// The app (pwa/) is plain browser JavaScript: classic <script> files sharing one global scope, no bundler.
// These rules catch real mistakes (undefined names, unreachable code, duplicate keys…) without imposing a style.
const appRules = {
  ...js.configs.recommended.rules,
  'no-redeclare': 'off', // every file may declare names that other files use: the scope is shared
  'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-useless-escape': 'warn',
  'no-prototype-builtins': 'warn',
  'no-cond-assign': ['error', 'except-parens'],
  'no-control-regex': 'warn',
  'no-useless-assignment': 'off',
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'pwa/vendor/**', 'supabase/**', 'graphify-out/**'] },
  {
    files: ['pwa/**/*.js'],
    ignores: ['pwa/tests/**', 'pwa/**/*-worker.js', 'pwa/sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, ...scriptGlobals('pwa') },
    },
    rules: appRules,
  },
  // Mistakes that are known and recorded in docs/KNOWN_BUGS.md; the refactor leaves the code as it is, so they only warn.
  {
    files: ['pwa/features/account/SyncPage.js'],
    rules: { 'no-undef': 'warn' },
  },
  {
    files: ['pwa/features/camera/camera-i18n.js'],
    rules: { 'no-dupe-keys': 'warn' },
  },
  {
    files: ['pwa/**/*-worker.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.worker, ...scriptGlobals('pwa') },
    },
    rules: appRules,
  },
  {
    files: ['pwa/sw.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.serviceworker },
    rules: appRules,
  },
  {
    files: ['**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: appRules,
  },
];
