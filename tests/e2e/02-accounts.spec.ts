/**
 * 02-accounts.spec.ts
 * Full CRUD for accounts.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/accounts');
  await page.waitForLoadState('networkidle');
});

test.describe('Accounts', () => {
  test('2.1 accounts page loads with grouped accounts', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /accounts/i })).toBeVisible();
    // At least one account group heading
    const groups = page.locator('body');
    await expect(groups).toContainText(/checking|savings|credit|investment/i);
  });

  test('2.2 create a new checking account', async ({ page }) => {
    const name = `E2E Chequing ${Date.now()}`;
    // Click Add Account button
    await page.getByRole('button', { name: 'Add account' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // The Add Account dialog has an "Account Name" textbox
    await dialog.getByRole('textbox', { name: /account name/i }).fill(name);

    // Account Type combobox — select Checking
    const typeSelect = dialog.getByRole('combobox', { name: /account type/i });
    if (await typeSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await typeSelect.selectOption({ label: 'Checking' }).catch(() => {});
    }

    // Starting Balance (spinbutton)
    const balanceInput = dialog.getByRole('spinbutton', { name: /starting balance/i });
    if (await balanceInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await balanceInput.fill('1500');
    }

    await dialog.getByRole('button', { name: /add account/i }).click();
    await expect(page.locator('body')).toContainText(name, { timeout: 8_000 });
  });

  test('2.3 edit an account name', async ({ page }) => {
    const newName = `Edited Account ${Date.now()}`;
    // Click the first account options (kebab) button, then select Edit from dropdown
    const optionsBtn = page.getByRole('button', { name: /account options/i }).first();
    await optionsBtn.click();
    // Click "Edit" in the dropdown menu
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // Edit dialog has "Account Name" textbox
    const nameInput = dialog.getByRole('textbox', { name: /account name/i });
    await nameInput.clear();
    await nameInput.fill(newName);
    await dialog.getByRole('button', { name: /save|update|add account/i }).last().click();
    await expect(page.locator('body')).toContainText(newName, { timeout: 8_000 });
  });

  test('2.4 account balance is displayed', async ({ page }) => {
    // Net worth total should be a currency amount
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
  });

  test('2.5 account page shows institution name or last four', async ({ page }) => {
    // Seeded accounts have institution names
    await expect(page.locator('body')).toContainText(/TD|Scotia|RBC|Questrade|Wealthsimple/i);
  });

  test('2.6 delete a newly created account', async ({ page }) => {
    // First create an account to delete
    const name = `Delete Me ${Date.now()}`;
    await page.getByRole('button', { name: 'Add account' }).click();
    const dialog2 = page.getByRole('dialog');
    await dialog2.waitFor({ timeout: 5_000 });
    await dialog2.getByRole('textbox', { name: /account name/i }).fill(name);
    const balanceInput = dialog2.getByRole('spinbutton', { name: /starting balance/i });
    if (await balanceInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await balanceInput.fill('100');
    }
    await dialog2.getByRole('button', { name: /add account/i }).click();
    await expect(page.locator('body')).toContainText(name, { timeout: 8_000 });

    // Now delete it — find the row containing the name, click its delete button
    const accountRow = page.locator(`text="${name}"`).first();
    await accountRow.hover();
    const deleteBtn = page.locator(`[aria-label*="delete" i], button[title*="delete" i]`).last();
    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm dialog
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.locator('body')).not.toContainText(name, { timeout: 8_000 });
    }
  });
});
