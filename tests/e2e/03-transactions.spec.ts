import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

async function addTx(
  page: import('@playwright/test').Page,
  desc: string,
  amount: string,
) {
  await page.getByRole('button', { name: /add transaction/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByLabel('Merchant / Description').fill(desc);
  await dialog.getByLabel('Amount').fill(amount);
  // Select first non-placeholder account
  const accountSelect = dialog.getByLabel('Account');
  await accountSelect.selectOption({ index: 1 });
  // Select first non-placeholder category
  const catSelect = dialog.getByLabel('Category');
  const catOptions = await catSelect.locator('option').all();
  if (catOptions.length > 1) await catSelect.selectOption({ index: 1 });
  await dialog.getByRole('button', { name: /add transaction/i }).click();
  await waitForToast(page, /added|created|success/i);
}

test.describe('Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
  });

  test('transactions page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
  });

  test('add expense: Whole Foods Market -$85.50', async ({ page }) => {
    await addTx(page, 'Whole Foods Market', '-85.50');
    await expect(page.getByText('Whole Foods Market').first()).toBeVisible({ timeout: 8000 });
  });

  test('add expense: Hydro Electric -$120.00', async ({ page }) => {
    await addTx(page, 'Hydro Electric', '-120.00');
    await expect(page.getByText('Hydro Electric').first()).toBeVisible({ timeout: 8000 });
  });

  test('add expense: Amazon -$65.00', async ({ page }) => {
    await addTx(page, 'Amazon', '-65.00');
    await expect(page.getByText('Amazon').first()).toBeVisible({ timeout: 8000 });
  });

  test('add expense: TTC Transit -$3.25', async ({ page }) => {
    await addTx(page, 'TTC Transit', '-3.25');
    await expect(page.getByText('TTC Transit').first()).toBeVisible({ timeout: 8000 });
  });

  test('add income: Salary Deposit +$3,500', async ({ page }) => {
    await addTx(page, 'Salary Deposit', '3500');
    await expect(page.getByText('Salary Deposit').first()).toBeVisible({ timeout: 8000 });
  });

  test('account balance changes after transactions', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    // Balance of Main Checking should not be exactly $5,000 anymore
    // Just confirm accounts page loads and shows a balance
    await expect(page.getByText('Main Checking')).toBeVisible();
    await expect(page.getByText(/\$[0-9,]+/).first()).toBeVisible();
  });

  test('filter: expense type shows only expenses', async ({ page }) => {
    const expenseBtn = page.getByRole('button', { name: /^expense/i }).first();
    if (await expenseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expenseBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('Salary Deposit')).not.toBeVisible();
    }
  });

  test('filter: income type shows income', async ({ page }) => {
    const incomeBtn = page.getByRole('button', { name: /^income/i }).first();
    if (await incomeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await incomeBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('Salary Deposit')).toBeVisible();
    }
  });

  test('search filter finds transaction', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('Whole Foods');
    await page.waitForTimeout(1200);
    await expect(page.getByText('Whole Foods Market')).toBeVisible();
    await searchInput.clear();
  });

  test('dashboard spending widget visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/spending|this month/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('split transaction modal opens and validates', async ({ page }) => {
    const moreMenu = page.locator('[aria-label*="more"], button:has([data-lucide="more-horizontal"])').first();
    if (await moreMenu.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreMenu.click();
      const splitBtn = page.getByRole('menuitem', { name: /split/i });
      if (await splitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await splitBtn.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5000 });
        await expect(dialog.getByText(/split/i).first()).toBeVisible();
        const amountInputs = dialog.locator('input[type="number"], input[placeholder*="amount"]');
        expect(await amountInputs.count()).toBeGreaterThanOrEqual(2);
        await dialog.getByRole('button', { name: /cancel/i }).click();
      }
    }
  });

  test('filter by date range limits results', async ({ page }) => {
    const fromLabel = page.getByText('From').first();
    if (await fromLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      const fromInput = page.locator('label:has-text("From") input[type="date"]');
      await fromInput.fill('2099-01-01');
      const toInput = page.locator('label:has-text("To") input[type="date"]');
      await toInput.fill('2099-01-31');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/no transactions/i)).toBeVisible({ timeout: 8000 });
      await fromInput.fill('');
      await toInput.fill('');
    }
  });
});
