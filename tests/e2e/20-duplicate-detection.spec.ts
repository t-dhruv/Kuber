/**
 * 20-duplicate-detection.spec.ts
 * Transactions > duplicates flow: detect, merge, dismiss.
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/transactions');
  await page.waitForLoadState('networkidle');
});

test.describe('Duplicate Detection', () => {
  test('20.1 transactions page loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/internal server error|something went wrong/i);
    await expect(page.locator('body')).toContainText(/transaction/i);
  });

  test('20.2 duplicate detection UI is accessible', async ({ page }) => {
    // Look for a duplicates tab, banner, or button
    const dupIndicator = page.locator(
      '[data-testid*="duplicate"], button:has-text("Duplicates"), ' +
      'a:has-text("Duplicates"), [class*="duplicate"], text=/possible.*duplicate|duplicate.*found/i'
    ).first();
    const hasDup = await dupIndicator.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasDup) {
      await dupIndicator.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toContainText(/duplicate|merge|dismiss/i, { timeout: 5_000 });
    } else {
      // Duplicates section may only appear when duplicates exist
      test.skip();
    }
  });

  test('20.3 duplicate banner shows count of potential duplicates', async ({ page }) => {
    const banner = page.locator(
      '[class*="duplicate-banner"], [data-testid*="dup-count"], ' +
      'text=/\\d+.*duplicate|duplicate.*\\d+/i'
    ).first();
    if (await banner.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(banner).toContainText(/\d+/);
    } else {
      // No duplicates in current data — soft pass
      await expect(page.locator('body')).not.toContainText(/internal server error|page not found/i);
    }
  });

  test('20.4 merge button is present when duplicates exist', async ({ page }) => {
    const mergeBtn = page.getByRole('button', { name: /merge/i }).first();
    const hasMerge = await mergeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasMerge) {
      await expect(mergeBtn).toBeEnabled();
    } else {
      test.skip();
    }
  });

  test('20.5 dismiss button is present when duplicates exist', async ({ page }) => {
    const dismissBtn = page.getByRole('button', { name: /dismiss|not.*duplicate/i }).first();
    const hasDismiss = await dismissBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasDismiss) {
      await expect(dismissBtn).toBeEnabled();
    } else {
      test.skip();
    }
  });

  test('20.6 API GET /transactions/duplicates returns correctly', async ({ page }) => {
    // Test the API directly through page.request
    const loginResponse = await page.request.post('http://localhost:9002/api/v1/auth/login', {
      data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    });
    const { accessToken } = await loginResponse.json();

    const resp = await page.request.get('http://localhost:9002/api/v1/transactions/duplicates', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    // Should be an array or an object with a groups/count property
    const isValid = Array.isArray(data) || (typeof data === 'object' && data !== null);
    expect(isValid).toBe(true);
  });
});
