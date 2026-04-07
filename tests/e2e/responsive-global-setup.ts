/**
 * responsive-global-setup.ts
 * Playwright global setup for responsive tests.
 * Logs in once via the API and saves the browser storage state to a temp file.
 * All responsive tests then restore from that file, bypassing the auth endpoint.
 */

import { chromium } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

export const AUTH_STATE_PATH = path.join(os.tmpdir(), 'kuber-e2e-auth-state.json');

async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:9001' });
  const page = await context.newPage();

  await page.goto('/login');
  await page.locator('#email').fill('demo@kuber.app');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();

  console.log(`[responsive-global-setup] Auth state saved to ${AUTH_STATE_PATH}`);
}

export default globalSetup;
