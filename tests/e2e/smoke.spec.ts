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
    await expect(page).toHaveURL('/');
    await assertNoErrors(page);

    // Sidebar logout button has title="Click to sign out"
    const logoutBtn = page.locator('[title="Click to sign out"]');
    await logoutBtn.waitFor({ timeout: 5_000 });
    await logoutBtn.click();
    await page.waitForURL(/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/login/);
  });

  test('dashboard loads without errors @smoke', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await assertNoErrors(page);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('accounts page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
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
    // BudgetPage uses text content rather than a semantic heading role
    await expect(page.getByText(/budget/i).first()).toBeVisible({ timeout: 10_000 });
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
    // Settings nav has aria-label="Settings navigation"
    await expect(page.locator('[aria-label="Settings navigation"]')).toBeVisible({ timeout: 10_000 });
  });

  test('reports page loads with tabs @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    // Reports tabs are <button> elements (not role="tab")
    await expect(page.getByRole('button', { name: /spending/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('transactions date range filter works @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    // Open filter panel
    const filterBtn = page.getByRole('button', { name: /filter/i });
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      // From/To date inputs should be visible in filter panel
      const dateInput = page.locator('input[type="date"]').first();
      await expect(dateInput).toBeVisible({ timeout: 5_000 });
    }
  });

  test('wealth page loads @smoke', async ({ page }) => {
    await login(page);
    await page.goto('/wealth');
    await page.waitForLoadState('networkidle');
    await assertNoErrors(page);
    await expect(page.getByText(/50\/30\/20|needs|wants|savings/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
