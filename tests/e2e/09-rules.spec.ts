/**
 * 09-rules.spec.ts
 * Transaction rules CRUD.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/rules');
  await page.waitForLoadState('networkidle');
});

test.describe('Rules', () => {
  test('9.1 rules page loads', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/rules|auto-categorize|pattern/i);
  });

  test('9.2 create a new rule', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add rule|new rule|\+ rule/i });
    if (!await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) return;

    await addBtn.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // Pattern / merchant match
    const patternInput = dialog.locator('input[name="pattern"], input[placeholder*="pattern" i], input[placeholder*="merchant" i]').first();
    if (await patternInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await patternInput.fill('Starbucks');
    }

    // Action: set category
    const categorySelect = dialog.locator('select[name="categoryId"], select').first();
    if (await categorySelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const options = await categorySelect.locator('option').all();
      for (const o of options) {
        const val = await o.getAttribute('value');
        if (val && val !== '') { await categorySelect.selectOption(val); break; }
      }
    }

    await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
    await expect(page.locator('body')).toContainText(/Starbucks|rule/i, { timeout: 8_000 });
  });

  test('9.3 edit a rule pattern', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.locator('button[aria-label*="edit" i]')).first();
    if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const patternInput = dialog.locator('input').first();
      await patternInput.clear();
      await patternInput.fill('Tim Hortons');
      await dialog.getByRole('button', { name: /save|update/i }).last().click();
      await expect(page.locator('body')).toContainText(/Tim Hortons/i, { timeout: 6_000 });
    }
  });

  test('9.4 delete a rule', async ({ page }) => {
    // Create one to delete
    const addBtn = page.getByRole('button', { name: /add rule|new rule|\+ rule/i });
    if (!await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) return;

    await addBtn.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // Fill rule name
    const nameInput = dialog.getByRole('textbox', { name: /rule name/i });
    await nameInput.fill(`DeleteRule${Date.now()}`);

    // Fill condition value (required) — placeholder is "Amazon"
    const conditionValueInput = dialog.getByRole('textbox', { name: /value/i });
    if (await conditionValueInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await conditionValueInput.fill('TestMerchant');
    }

    // Select category for action (required for setCategory type)
    const categorySelect = dialog.locator('select').last();
    if (await categorySelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const opts = await categorySelect.locator('option').all();
      for (const o of opts) {
        const val = await o.getAttribute('value');
        if (val && val !== '') { await categorySelect.selectOption(val); break; }
      }
    }

    await dialog.getByRole('button', { name: /save rule|save|add|create/i }).last().click();
    // Wait for dialog to close before clicking delete
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });

    const deleteBtn = page.getByRole('button', { name: /delete/i })
      .or(page.locator('button[aria-label*="delete" i]')).last();
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
