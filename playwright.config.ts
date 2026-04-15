import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // sequential for shared DB
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:9001',
    trace: 'on-first-retry',
    // Reuse the authenticated session saved by global-setup — avoids
    // hitting the auth rate limit across the full test suite.
    storageState: 'tests/e2e/.auth/user.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Do NOT configure webServer — tests assume app is already running
});
