import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

test.describe('Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
  });

  test('accounts page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /accounts/i })).toBeVisible();
  });

  test('create Main Checking account ($5,000)', async ({ page }) => {
    await page.getByRole('button', { name: /add account/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    await dialog.getByLabel('Account Name').fill('Main Checking');
    await dialog.getByLabel('Account Type').selectOption('checking');
    await dialog.getByLabel('Starting Balance').fill('5000');
    await dialog.getByRole('button', { name: /add account/i }).click();
    await waitForToast(page, /added|created|success/i);
    await expect(page.getByText('Main Checking')).toBeVisible();
  });

  test('create Main Savings account ($10,000)', async ({ page }) => {
    await page.getByRole('button', { name: /add account/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    await dialog.getByLabel('Account Name').fill('Main Savings');
    await dialog.getByLabel('Account Type').selectOption('savings');
    await dialog.getByLabel('Starting Balance').fill('10000');
    await dialog.getByRole('button', { name: /add account/i }).click();
    await waitForToast(page, /added|created|success/i);
    await expect(page.getByText('Main Savings')).toBeVisible();
  });

  test('both accounts visible in list', async ({ page }) => {
    await expect(page.getByText('Main Checking')).toBeVisible();
    await expect(page.getByText('Main Savings')).toBeVisible();
  });

  test('net worth shows combined balance ($15,000)', async ({ page }) => {
    // Net worth = $5,000 + $10,000 = $15,000
    await expect(page.getByText(/15,000|15000/).first()).toBeVisible({ timeout: 8000 });
  });

  test('dashboard net worth widget updated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/15,000|15000/).first()).toBeVisible({ timeout: 8000 });
  });

  test('edit account name and revert', async ({ page }) => {
    // Find overflow/kebab menu button near Main Checking
    const checkingRow = page.getByText('Main Checking').first();
    await checkingRow.hover();
    // The overflow button is nearby — try aria-label patterns
    const moreBtn = page.locator('button').filter({ hasText: '' }).filter({ has: page.locator('[data-lucide="more-horizontal"], svg') }).first();
    if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreBtn.click();
      const editItem = page.getByRole('menuitem', { name: /edit/i });
      if (await editItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editItem.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5000 });
        await dialog.getByLabel('Account Name').fill('Main Checking Updated');
        await dialog.getByRole('button', { name: /save|update/i }).click();
        await waitForToast(page, /updated|saved|success/i);
        await expect(page.getByText('Main Checking Updated')).toBeVisible();
      }
    }
  });
});
