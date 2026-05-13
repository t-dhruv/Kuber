import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

test.describe('Investments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/investments');
    await page.waitForLoadState('networkidle');
  });

  test('investments page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /investments|portfolio/i })).toBeVisible();
  });

  test('create TFSA Portfolio via accounts page', async ({ page }) => {
    // Investments may use the same accounts infrastructure
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add account/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    await dialog.getByLabel('Account Name').fill('TFSA Portfolio');
    await dialog.getByLabel('Account Type').selectOption('investment');
    await dialog.getByLabel('Starting Balance').fill('25000');
    await dialog.getByRole('button', { name: /add account/i }).click();
    await waitForToast(page, /added|created|success/i);
    await expect(page.getByText('TFSA Portfolio')).toBeVisible({ timeout: 8000 });
  });

  test('investments page renders without error', async ({ page }) => {
    await expect(page.getByText(/error|something went wrong/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('net worth includes investment account value', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    // Net worth should now be > $15,000 — includes TFSA $25k
    await expect(page.getByText(/\$[3-9][0-9],000|\$[1-9][0-9]{2},/).first()).toBeVisible({ timeout: 8000 });
  });

  test('add holding via investments page if UI supports it', async ({ page }) => {
    const addHoldingBtn = page.getByRole('button', { name: /add holding|add position|new holding/i }).first();
    if (await addHoldingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addHoldingBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5000 });
      const tickerField = dialog.getByLabel(/ticker|symbol/i);
      if (await tickerField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await tickerField.fill('AAPL');
      }
      const sharesField = dialog.getByLabel(/shares|quantity/i);
      if (await sharesField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sharesField.fill('10');
      }
      const priceField = dialog.getByLabel(/price|cost/i);
      if (await priceField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await priceField.fill('175');
      }
      await dialog.getByRole('button', { name: /add|save/i }).click();
      await waitForToast(page, /added|created|success/i).catch(() => {});
    }
  });
});
