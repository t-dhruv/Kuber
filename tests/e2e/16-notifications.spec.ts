import { test, expect } from '@playwright/test';

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('notification bell button visible in header', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /notification|bell/i }).first()
    ).toBeVisible();
  });

  test('clicking bell opens notification panel', async ({ page }) => {
    await page.getByRole('button', { name: /notification|bell/i }).first().click();
    await page.waitForTimeout(500);
    await expect(
      page.locator('[role="dialog"], [class*="drawer"], [class*="notification"], [class*="popover"]').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('notification panel renders without errors', async ({ page }) => {
    await page.getByRole('button', { name: /notification|bell/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/error|failed|something went wrong/i)).not.toBeVisible();
  });

  test('mark all as read if button available', async ({ page }) => {
    await page.getByRole('button', { name: /notification|bell/i }).first().click();
    await page.waitForTimeout(500);
    const markAllBtn = page.getByRole('button', { name: /mark all.*read|clear all/i });
    if (await markAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await markAllBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('notification list items visible or empty state shown', async ({ page }) => {
    await page.getByRole('button', { name: /notification|bell/i }).first().click();
    await page.waitForTimeout(1000);
    // Either there are notification items or an empty state message
    const hasItems = await page.locator('[class*="notification-item"], [class*="notif"]').count() > 0;
    const hasEmptyState = await page.getByText(/no notifications|all caught up|nothing/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasItems || hasEmptyState).toBeTruthy();
  });
});
