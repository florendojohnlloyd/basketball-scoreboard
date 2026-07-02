/**
 * Playwright configuration for Basketball Scoreboard E2E tests.
 *
 * These tests use Playwright's `_electron` API to launch the Electron app
 * directly — no browser or web server is involved.
 *
 * ⚠️  IMPORTANT: Run `npm run build` before `npm run test:e2e`.
 *     The tests launch the production build from `out/main/index.js`.
 *     Without a current build, the tests will fail to find the app entry point.
 *
 * Build step:
 *   npm run build
 *
 * Then run E2E:
 *   npm run test:e2e
 *
 * Or combined:
 *   npm run build && npm run test:e2e
 */

import { defineConfig } from '@playwright/test'
import { join } from 'path'

export default defineConfig({
  // All E2E tests live under the e2e/ directory
  testDir: join(__dirname, 'e2e'),

  // Give each test generous time — the app needs to launch and settle
  timeout: 60_000,

  // Individual expect timeout for waitFor / assertions
  expect: {
    timeout: 10_000,
  },

  // Run tests serially — launching multiple Electron instances in parallel
  // risks resource contention on a single machine
  workers: 1,
  fullyParallel: false,

  // Retry once on failure in CI to reduce flakiness from startup timing
  retries: process.env.CI ? 1 : 0,

  // HTML report saved alongside test output
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],

  // No projects needed — we use a single Electron-based configuration
  // The _electron fixture is used directly in tests; no browser projects required
})
