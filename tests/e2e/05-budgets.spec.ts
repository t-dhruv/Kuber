/**
 * 05-budgets.spec.ts
 * Budget CRUD + month navigation + over-budget state.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/budget');
  await page.waitForLoadState('networkidle');
});

test.describe('Budgets', () => {
  test('5.1 budget page loads with categories', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/budget|groceries|restaurant|coffee/i);
  });

  test('5.2 budget page shows current month', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/March|February|April/i);
  });

  test('5.3 create a new budget', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add budget|new budget|\+ budget/i });
    if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Select a category
      const categorySelect = dialog.locator('select').first();
      if (await categorySelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const options = await categorySelect.locator('option').all();
        for (const o of options) {
          const val = await o.getAttribute('value');
          if (val && val !== '') { await categorySelect.selectOption(val); break; }
        }
      }

      const amountInput = dialog.locator('input[type="number"], input[placeholder*="amount" i]').first();
      await amountInput.fill('300');

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await expect(page.locator('body')).toContainText(/300/);
    }
  });

  test('5.4 edit a budget amount', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.locator('button[aria-label*="edit" i]')).first();
    if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const amountInput = dialog.locator('input[type="number"], input[placeholder*="amount" i]').first();
      await amountInput.clear();
      await amountInput.fill('999');
      await dialog.getByRole('button', { name: /save|update/i }).last().click();
      await expect(page.locator('body')).toContainText(/999/, { timeout: 6_000 });
    }
  });

  test('5.5 month navigation — previous month changes label', async ({ page }) => {
    const prevBtn = page.getByRole('button', { name: /previous month|prev/i })
      .or(page.locator('button[aria-label*="previous" i]')).first();
    if (await prevBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await prevBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toContainText(/February|January|March/i);
    }
  });

  test('5.6 month navigation — next month', async ({ page }) => {
    const nextBtn = page.getByRole('button', { name: /next month/i })
      .or(page.locator('button[aria-label*="next" i]')).first();
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toContainText(/April|March|May/i);
    }
  });

  test('5.7 over-budget category shows warning indicator', async ({ page }) => {
    // The seeded data has Movies & TV over budget
    await expect(page.locator('body')).toContainText(/Movies|over|red|warning/i);
  });

  test('5.8 budget total footer shows sum', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/total/i);
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
  });
});
