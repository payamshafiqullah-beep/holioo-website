// Copies the Holioo PWA (pwa/) to dist-ios/ for Capacitor, without checks and tests
// (same rule as the website deploy).
import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('dist-ios', { recursive: true, force: true });
mkdirSync('dist-ios', { recursive: true });
cpSync('pwa', 'dist-ios', { recursive: true });
rmSync('dist-ios/smoke-test.mjs', { force: true });
rmSync('dist-ios/tests', { recursive: true, force: true });
console.log('dist-ios ready');
