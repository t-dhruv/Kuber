/**
 * playwright.responsive.config.ts
 * Dedicated Playwright config for responsive/viewport E2E tests.
 *
 * Usage:
 *   npx playwright test --config=playwright.responsive.config.ts
 *
 * Key differences from the main config:
 * - globalSetup logs in once and saves auth storage state before any test runs.
 * - storageState is NOT set here — responsive.spec.ts reads AUTH_STATE_FILE
 *   directly via test.use() per viewport group.
 * - Single Chromium project (desktop Chrome UA) — viewport is set per test group.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:       './tests/e2e',
  testMatch:     '**/responsive.spec.ts',
  fullyParallel: false,   // sequential — shared DB + auth state file
  retries:       0,
  workers:       1,
  reporter:      [['html', { outputFolder: 'playwright-report-responsive' }], ['list']],

  globalSetup:   './tests/e2e/responsive-global-setup.ts',

  use: {
    baseURL: 'http://localhost:9001',
    trace:   'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
