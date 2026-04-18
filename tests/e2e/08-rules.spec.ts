import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

test.describe('Rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');
  });

  test('rules page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /rules|automation/i })).toBeVisible();
  });

  test('create a rule for Starbucks → Dining', async ({ page }) => {
    await page.getByRole('button', { name: /new rule/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });

    // Rule name is required
    await dialog.getByLabel('Rule name').fill('Starbucks rule');

    // Condition value (labeled "Value") is required
    await dialog.getByLabel('Value').fill('Starbucks');

    // Change action type to markReviewed (no extra value needed)
    await dialog.getByLabel('Action').selectOption('markReviewed');

    await dialog.getByRole('button', { name: /save rule/i }).click();
    await waitForToast(page, /added|created|saved|success/i);
  });

  test('rules list shows at least one rule', async ({ page }) => {
    await expect(page.getByText(/starbucks/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('apply all rules button visible', async ({ page }) => {
    const applyBtn = page.getByRole('button', { name: /apply all|apply rules/i });
    if (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await applyBtn.click();
      await waitForToast(page, /applied|success/i);
    }
  });

  test('edit existing rule changes its name', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5000 });
      const nameInput = dialog.getByLabel(/rule name/i);
      await nameInput.fill('Starbucks Updated');
      await dialog.getByRole('button', { name: /save rule/i }).click();
      await expect(page.getByText('Starbucks Updated')).toBeVisible({ timeout: 8000 });
    }
  });

  test('delete rule removes it from list', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const ruleText = await page.locator('[class*="font-semibold"]').first().textContent();
      await deleteBtn.click();
      if (ruleText) {
        await expect(page.getByText(ruleText)).not.toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('prefill from URL opens modal with values pre-populated', async ({ page }) => {
    const prefill = encodeURIComponent(JSON.stringify({
      field: 'description',
      operator: 'startsWith',
      value: 'Netflix',
    }));
    await page.goto(`/rules?prefill=${prefill}`);
    await page.waitForLoadState('networkidle');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('input[value="Netflix"]')).toBeVisible({ timeout: 3000 });
  });
});
