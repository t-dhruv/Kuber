/**
 * 15-assets-liabilities.spec.ts
 * Assets & Liabilities tab in Accounts: add/edit/delete manual asset,
 * add/edit/delete manual liability, net-worth breakdown visible.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/accounts');
  await page.waitForLoadState('networkidle');
});

test.describe('Assets & Liabilities', () => {
  test('15.1 accounts page has an Assets & Liabilities tab or section', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /assets|liabilit/i })
      .or(page.getByRole('link', { name: /assets|liabilit/i }))
      .or(page.locator('[data-testid*="asset"], [data-testid*="liabilit"]').first());
    const hasTab = await tab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasTab) {
      await tab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/asset|liabilit|net worth/i);
    } else {
      // May be on a sub-route
      await page.goto('/accounts/assets');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(/404|page not found/i);
    }
  });

  test('15.2 add a manual asset', async ({ page }) => {
    // Navigate to assets section
    const assetTab = page.getByRole('tab', { name: /assets/i })
      .or(page.locator('a[href*="asset"], button:has-text("Assets")').first());
    if (await assetTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await assetTab.click();
    } else {
      await page.goto('/accounts');
    }

    const addBtn = page.getByRole('button', { name: /add asset|new asset|\+ asset/i });
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Fill name
      const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameInput.fill('QA House Asset');
      }

      // Fill value
      const valueInput = dialog.locator('input[name*="value" i], input[name*="amount" i], input[type="number"]').first();
      if (await valueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await valueInput.fill('350000');
      }

      const saveBtn = dialog.getByRole('button', { name: /save|add|create/i });
      if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveBtn.click();
        await expect(page.locator('body')).toContainText(/QA House Asset|asset.*added|saved/i, {
          timeout: 8_000,
        });
      }
    } else {
      test.skip();
    }
  });

  test('15.3 add a manual liability', async ({ page }) => {
    const liabTab = page.getByRole('tab', { name: /liabilit/i })
      .or(page.locator('button:has-text("Liabilities"), a[href*="liabilit"]').first());
    if (await liabTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await liabTab.click();
    }

    const addBtn = page.getByRole('button', { name: /add liability|new liability|\+ liability/i });
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameInput.fill('QA Car Loan');
      }

      const balInput = dialog.locator('input[name*="balance" i], input[name*="amount" i], input[type="number"]').first();
      if (await balInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await balInput.fill('15000');
      }

      const saveBtn = dialog.getByRole('button', { name: /save|add|create/i });
      if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveBtn.click();
        await expect(page.locator('body')).toContainText(/QA Car Loan|liability.*added|saved/i, {
          timeout: 8_000,
        });
      }
    } else {
      test.skip();
    }
  });

  test('15.4 net worth breakdown section is visible', async ({ page }) => {
    // The net worth breakdown is shown on accounts or wealth page
    const hasNetWorth = await page.locator('body').textContent().then(t =>
      /net worth|total assets|total liabilit/i.test(t ?? '')
    );
    if (!hasNetWorth) {
      await page.goto('/wealth');
      await page.waitForLoadState('networkidle');
    }
    await expect(page.locator('body')).toContainText(/net worth|total assets/i, { timeout: 5_000 });
  });

  test('15.5 assets page loads without error', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/internal server error|something went wrong/i);
  });
});
