import { Page, expect } from '@playwright/test';
import { login } from './auth';

/** Unique email for a test run to avoid collisions */
export function uniqueEmail(prefix = 'test') {
  return `${prefix}+${Date.now()}@kuber-e2e.test`;
}

/** Register a new user and land on the dashboard */
export async function register(
  page: Page,
  firstName: string,
  lastName: string,
  email: string,
  password: string,
) {
  await page.goto('/signup');
  await page.locator('#firstName').fill(firstName);
  await page.locator('#lastName').fill(lastName);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const confirmPassword = page.locator('#confirmPassword');
  if (await confirmPassword.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await confirmPassword.fill(password);
  }
  const household = page.locator('#householdName');
  if (await household.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await household.fill(`${firstName} Household`);
  }
  await page.getByRole('button', { name: /sign up|create account/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 15_000 });
}

/** Navigate to a page and wait for main content to load (no spinner) */
export async function goTo(page: Page, path: string) {
  await page.goto(path);
  // Wait for the loading state to clear
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/** Wait for a success toast to appear */
export async function expectToast(page: Page, pattern: string | RegExp) {
  const toast = page.locator('[role="alert"], [data-sonner-toast], .toast, [class*="toast"]').first();
  await expect(toast).toContainText(pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i'), {
    timeout: 8_000,
  });
}

/** Login as demo user (shared across most suites) */
export async function loginAsDemo(page: Page) {
  await login(page);
}

/** Get the first account ID from the API (used for import tests) */
export async function getFirstAccountName(page: Page): Promise<string> {
  // Navigate to accounts and grab the first account name from the page
  await goTo(page, '/accounts');
  const firstAccount = page.locator('[data-testid="account-name"], h3, h4').first();
  return (await firstAccount.textContent()) ?? 'E2E Primary Account';
}
