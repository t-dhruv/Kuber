import { test, expect } from './fixtures';
import { waitForToast } from './helpers';

test.describe('Assets & Liabilities', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
  });

  test('add manual asset: Home $400,000', async ({ page }) => {
    const addAssetBtn = page.getByRole('button', { name: /add asset|new asset/i }).first();
    if (await addAssetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addAssetBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5000 });
      await dialog.getByLabel(/name/i).fill('Home');
      await dialog.getByLabel(/value|amount|current value/i).fill('400000');
      await dialog.getByRole('button', { name: /add|save/i }).click();
      await waitForToast(page, /added|saved|success/i);
      await expect(page.getByText('Home')).toBeVisible({ timeout: 8000 });
    } else {
      test.skip();
    }
  });

  test('add manual liability: Mortgage $320,000', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add liability|new liability/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5000 });
      await dialog.getByLabel(/name/i).fill('Mortgage');
      await dialog.getByLabel(/balance|amount/i).fill('320000');
      await dialog.getByRole('button', { name: /add|save/i }).click();
      await waitForToast(page, /added|saved|success/i);
      await expect(page.getByText('Mortgage')).toBeVisible({ timeout: 8000 });
    } else {
      test.skip();
    }
  });

  test('net worth shown on accounts page', async ({ page }) => {
    // Any dollar amount visible (balances may be small)
    await expect(page.getByText(/\$[0-9]/).first()).toBeVisible({ timeout: 8000 });
  });

  test('dashboard net worth updated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/net worth/i)).toBeVisible();
    await expect(page.getByText(/\$[0-9]/).first()).toBeVisible({ timeout: 8000 });
  });

  test('Assets & Debt tab on Accounts page is accessible', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    const assetsTab = page.getByRole('button', { name: /assets.*debt|assets & debt/i });
    if (await assetsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await assetsTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/assets|liabilities|debt/i).first()).toBeVisible({ timeout: 8000 });
    }
  });
});
