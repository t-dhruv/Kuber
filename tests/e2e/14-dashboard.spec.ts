import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('net worth widget visible', async ({ page }) => {
    await expect(page.getByText(/net worth/i)).toBeVisible();
  });

  test('net worth is positive (accounts exist)', async ({ page }) => {
    // Should show a dollar amount > $0 from accounts created in spec 02
    await expect(page.getByText(/\$[1-9][0-9,]+/).first()).toBeVisible({ timeout: 8000 });
  });

  test('spending widget visible', async ({ page }) => {
    await expect(page.getByText(/spending|this month/i).first()).toBeVisible();
  });

  test('goals widget shows Emergency Fund', async ({ page }) => {
    await expect(page.getByText(/emergency fund/i)).toBeVisible({ timeout: 8000 });
  });

  test('budget widget visible', async ({ page }) => {
    await expect(page.getByText(/budget/i).first()).toBeVisible();
  });

  test('upcoming bills or recurring section visible', async ({ page }) => {
    await expect(page.getByText(/upcoming|bills|netflix|rent/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('weekly recap widget renders', async ({ page }) => {
    await expect(page.getByText(/recap|week|summary/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('customize widget layout if button available', async ({ page }) => {
    const customizeBtn = page.getByRole('button', { name: /customize|layout|edit.*dashboard/i });
    if (await customizeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customizeBtn.click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /save|done|close/i }).first().click();
    }
  });
});
