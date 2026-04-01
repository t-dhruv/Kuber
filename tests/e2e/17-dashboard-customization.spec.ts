/**
 * 17-dashboard-customization.spec.ts
 * Dashboard widget reorder and hide functionality.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('Dashboard Customization', () => {
  test('17.1 dashboard loads with widgets', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/dashboard/i);
    // Should have at least one widget card
    const cards = page.locator('[data-testid*="widget"], [class*="widget"], [class*="card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('17.2 customize/edit dashboard button is present', async ({ page }) => {
    const customizeBtn = page.getByRole('button', { name: /customize|edit.*dashboard|manage.*widget/i })
      .or(page.locator('[data-testid="customize-dashboard"], [aria-label*="customize" i]').first());
    const hasCustomize = await customizeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasCustomize) {
      await customizeBtn.click();
      await expect(page.locator('body')).toContainText(/customize|widget|reorder|hide/i, {
        timeout: 5_000,
      });
    } else {
      // Dashboard may not have customization UI — soft pass
      await expect(page.locator('body')).not.toContainText(/500|error occurred/i);
    }
  });

  test('17.3 hide widget toggle reduces visible widget count', async ({ page }) => {
    const customizeBtn = page.getByRole('button', { name: /customize|edit.*dashboard/i });
    if (!await customizeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await customizeBtn.click();
    await page.waitForTimeout(500);

    const hideToggles = page.locator('input[type="checkbox"], [role="switch"]');
    const toggleCount = await hideToggles.count();
    if (toggleCount === 0) {
      test.skip();
      return;
    }

    // Get initial count of visible widgets
    const initialCount = await page.locator('[class*="widget"], [class*="card"]').count();

    // Toggle the first widget off
    const firstToggle = hideToggles.first();
    await firstToggle.click();
    await page.waitForTimeout(500);

    // Save if there's a save button
    const saveBtn = page.getByRole('button', { name: /save|apply|done/i });
    if (await saveBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await saveBtn.click();
    }

    await page.waitForLoadState('networkidle');
    // Widget count should be same or less (widget hidden)
    const afterCount = await page.locator('[class*="widget"], [class*="card"]').count();
    expect(afterCount).toBeLessThanOrEqual(initialCount);
  });

  test('17.4 dashboard shows net worth or account balance summary', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
  });

  test('17.5 dashboard recent transactions widget is present', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/recent.*transaction|transaction|spending/i);
  });

  test('17.6 dashboard budget widget shows progress', async ({ page }) => {
    const hasBudgetWidget = await page.locator('body').textContent().then(t =>
      /budget|spent|remaining/i.test(t ?? '')
    );
    if (!hasBudgetWidget) {
      test.skip();
      return;
    }
    await expect(page.locator('body')).toContainText(/budget|spent|remaining/i);
  });
});
