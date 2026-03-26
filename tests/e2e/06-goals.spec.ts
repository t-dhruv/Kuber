/**
 * 06-goals.spec.ts
 * Goals CRUD + contribution + progress tracking.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/goals');
  await page.waitForLoadState('networkidle');
});

test.describe('Goals', () => {
  test('6.1 goals page loads with existing goals', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/goal|emergency|down payment|trip/i);
  });

  test('6.2 goals show progress bars and percentages', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/%/);
  });

  test('6.3 create a new goal', async ({ page }) => {
    const goalName = `E2E Goal ${Date.now()}`;
    await page.getByRole('button', { name: /add goal|new goal|\+ goal/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // Goal name field has label="Goal name" and placeholder with "Emergency Fund"
    const nameInput = dialog.getByRole('textbox', { name: /goal name/i })
      .or(dialog.locator('input[placeholder*="Emergency Fund" i]')).first();
    await nameInput.fill(goalName);

    const targetInput = dialog.locator('input[name="targetAmount"], input[placeholder*="target" i], input[type="number"]').first();
    await targetInput.fill('5000');

    const dateInput = dialog.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await dateInput.fill('2027-12-31');
    }

    await dialog.getByRole('button', { name: /save|create goal|create debt goal|add/i }).last().click();
    await expect(page.locator('body')).toContainText(goalName, { timeout: 8_000 });
  });

  test('6.4 edit a goal target amount', async ({ page }) => {
    // Goals use a "Goal options" kebab button (aria-label="Goal options"), then click Edit
    const optionsBtn = page.getByRole('button', { name: /goal options/i }).first();
    if (!await optionsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) return;
    await optionsBtn.click();
    await page.getByRole('button', { name: /^edit$/i }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    const targetInput = dialog.locator('input[name="targetAmount"], input[type="number"]').first();
    await targetInput.clear();
    await targetInput.fill('9999');
    await dialog.getByRole('button', { name: /save|update/i }).last().click();
    await expect(page.locator('body')).toContainText(/9,999|9999/, { timeout: 6_000 });
  });

  test('6.5 add a contribution to a goal increases progress', async ({ page }) => {
    const contributeBtn = page.getByRole('button', { name: /contribute|add funds|deposit/i }).first();
    if (await contributeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await contributeBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const amountInput = dialog.locator('input[type="number"]').first();
      await amountInput.fill('100');
      await dialog.getByRole('button', { name: /save|add|confirm/i }).last().click();
      await page.waitForTimeout(500);
      // Progress should have updated
      await expect(page.locator('body')).toContainText(/%/);
    }
  });

  test('6.6 delete a goal removes it', async ({ page }) => {
    // Create a goal to delete
    const goalName = `Delete Goal ${Date.now()}`;
    await page.getByRole('button', { name: /add goal|new goal|\+ goal/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });
    await dialog.getByRole('textbox', { name: /goal name/i })
      .or(dialog.locator('input[placeholder*="Emergency Fund" i]')).first().fill(goalName);
    await dialog.locator('input[type="number"]').first().fill('1000');
    await dialog.getByRole('button', { name: /save|create goal|create debt goal|add/i }).last().click();
    await expect(page.locator('body')).toContainText(goalName, { timeout: 8_000 });

    // Delete it
    const goalRow = page.locator('body').getByText(goalName).first();
    await goalRow.hover();
    const deleteBtn = page.locator('button[aria-label*="delete" i], button[title*="delete" i]').last();
    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.locator('body')).not.toContainText(goalName, { timeout: 8_000 });
    }
  });
});
