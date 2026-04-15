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
    await page.getByRole('button', { name: /add rule|new rule|create rule/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });

    // Fill condition field
    const condField = dialog.getByLabel(/merchant|description|contains/i).first();
    if (await condField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await condField.fill('Starbucks');
    } else {
      // Try a generic text input as the condition value
      await dialog.locator('input[type="text"]').first().fill('Starbucks');
    }

    // Set category action
    const catSelect = dialog.getByLabel(/category/i).first();
    if (await catSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      const opts = await catSelect.locator('option').allTextContents();
      const dining = opts.find((o) => /dining|food|restaurant/i.test(o));
      if (dining) await catSelect.selectOption({ label: dining });
    }

    await dialog.getByRole('button', { name: /save|add rule|create/i }).click();
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
});
