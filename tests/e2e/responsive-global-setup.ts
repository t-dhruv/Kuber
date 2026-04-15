/**
 * responsive-global-setup.ts
 * Playwright global setup for responsive tests.
 * Logs in once via the API and saves the browser storage state to a temp file.
 * All responsive tests then restore from that file, bypassing the auth endpoint.
 */

import { chromium } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import { login } from './helpers/auth';

export const AUTH_STATE_PATH = path.join(os.tmpdir(), 'kuber-e2e-auth-state.json');

async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:9001' });
  const page = await context.newPage();

  await login(page);

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();

  console.log(`[responsive-global-setup] Auth state saved to ${AUTH_STATE_PATH}`);
}

export default globalSetup;
