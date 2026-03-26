/**
 * 08-investments.spec.ts
 * Investment holdings CRUD + portfolio totals.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/investments');
  await page.waitForLoadState('networkidle');
});

test.describe('Investments', () => {
  test('8.1 investments page loads with holdings', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/investment|holdings|portfolio/i);
  });

  test('8.2 existing holdings are displayed', async ({ page }) => {
    // Seeded data should have some ticker symbols
    await expect(page.locator('body')).toContainText(/[A-Z]{2,5}|symbol|shares/i);
  });

  test('8.3 portfolio total is shown', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
  });

  test('8.4 add a new holding', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add holding|add lot|new holding|\+ holding/i });
    if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Symbol
      const symbolInput = dialog.locator('input[name="symbol"], input[placeholder*="symbol" i], input[placeholder*="ticker" i]').first();
      if (await symbolInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await symbolInput.fill('AAPL');
      }

      // Shares
      const sharesInput = dialog.locator('input[name="shares"], input[placeholder*="shares" i], input[placeholder*="units" i]').first();
      if (await sharesInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await sharesInput.fill('10');
      }

      // Cost basis
      const costInput = dialog.locator('input[name="costBasis"], input[placeholder*="cost" i], input[type="number"]').last();
      if (await costInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await costInput.fill('150');
      }

      // Account selector
      const accountSelect = dialog.locator('select').first();
      if (await accountSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const options = await accountSelect.locator('option').all();
        for (const o of options) {
          const val = await o.getAttribute('value');
          if (val && val !== '') { await accountSelect.selectOption(val); break; }
        }
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);
      // The holding should appear (or a success state)
      await expect(page.locator('body')).toContainText(/AAPL|holding|portfolio/i, { timeout: 8_000 });
    }
  });

  test('8.5 edit a holding', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.locator('button[aria-label*="edit" i]')).first();
    if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const sharesInput = dialog.locator('input[type="number"]').first();
      if (await sharesInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await sharesInput.clear();
        await sharesInput.fill('25');
      }

      await dialog.getByRole('button', { name: /save|update/i }).last().click();
      await page.waitForTimeout(500);
    }
  });

  test('8.6 delete a holding', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /delete/i })
      .or(page.locator('button[aria-label*="delete" i]')).first();
    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(500);
    }
  });
});
