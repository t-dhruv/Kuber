import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:9001';
const AUTH_DIR = path.join(__dirname, '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'user.json');
const CREDS_PATH = path.join(AUTH_DIR, 'credentials.json');

export default async function globalSetup(_config: FullConfig) {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const ts = Date.now();
  const email = `e2e+${ts}@kuber.test`;
  const password = 'E2E-Password123!';

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/signup`);
  await page.locator('input[name="firstName"], #firstName').fill('E2E');
  await page.locator('input[name="lastName"], #lastName').fill('User');
  await page.locator('input[name="email"], #email').fill(email);
  await page.locator('input[name="password"], #password').fill(password);

  const confirmPassword = page.locator('input[name="confirmPassword"], #confirmPassword');
  if (await confirmPassword.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmPassword.fill(password);
  }
  const householdInput = page.locator('input[name="householdName"], #householdName');
  if (await householdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await householdInput.fill('E2E Household');
  }

  await page.getByRole('button', { name: /sign up|create account/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 20_000 });

  if (page.url().includes('/login')) {
    await page.locator('input[name="email"], #email').fill(email);
    await page.locator('input[name="password"], #password').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  }

  await page.evaluate(() => localStorage.setItem('kuber-onboarding-done', '1'));

  fs.writeFileSync(CREDS_PATH, JSON.stringify({ email, password }));
  await context.storageState({ path: STATE_PATH });
  await browser.close();

  console.log(`[global-setup] Created test user: ${email}`);
}
