import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Common error phrases to assert are NOT present on any page.
const ERROR_PATTERNS = ['Something went wrong', 'Failed to load', 'Unhandled'];

async function assertNoErrors(page: import('@playwright/test').Page) {
  for (const pattern of ERROR_PATTERNS) {
    await expect(page.getByText(pattern)).toHaveCount(0);
  }
}

test.describe('Smoke Tests @smoke', () => {
  test('login and logout works @smoke', async ({ page }) => {
    await login(page);
    // Confirm we are on the dashboard (root route "/"")
    await expect(page).toHaveURL('/');
    await assertNoErrors(page);

    // Logout — find a button or link containing "log out" / "sign out"
    // The sidebar/header typically exposes a logout action.
    const logoutBtn = page.getByRole('button', { name: /log.?out|sign.?out/i });
    await logoutBtn.waitFor({ timeout: 5_000 });
    await logoutBtn.click();
    await page.waitForURL(/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/login/);
  });

  test('dashboard loads without errors @smoke', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await assertNoErrors(page);
    // The dashboard page renders inside AppShell — assert the main landmark exists.
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('accounts page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    // Expect a heading or section identifying accounts
    await expect(
      page.getByRole('heading', { name: /accounts/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('transactions page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    await expect(
      page.getByRole('heading', { name: /transactions/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('budget page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    await expect(
      page.getByRole('heading', { name: /budget/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('goals page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    await expect(
      page.getByRole('heading', { name: /goals/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('settings page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    await expect(
      page.getByRole('heading', { name: /settings/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
