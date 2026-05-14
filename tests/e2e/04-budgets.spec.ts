import { test, expect } from './fixtures';
import { waitForToast } from './helpers';

async function addBudget(
  page: import('@playwright/test').Page,
  categoryPattern: RegExp,
  amount: string,
) {
  await page.getByRole('button', { name: /add budget/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });

  const catSelect = dialog.getByLabel('Category');
  const options = await catSelect.locator('option').allTextContents();
  const match = options.find((o) => categoryPattern.test(o));
  if (match) await catSelect.selectOption({ label: match });
  else await catSelect.selectOption({ index: 1 });

  await dialog.getByLabel(/budget amount/i).fill(amount);
  await dialog.getByRole('button', { name: /add budget/i }).click();
  await waitForToast(page, /added|created|saved|success/i);
}

test.describe('Budgets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');
  });

  test('budget page loads @smoke', async ({ page }) => {
    await expect(page.getByText(/budget/i).first()).toBeVisible();
  });

  test('create Groceries budget $400 @smoke', async ({ page }) => {
    await addBudget(page, /groceries/i, '400');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/groceries/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('create Dining budget $200', async ({ page }) => {
    await addBudget(page, /dining|restaurant|food/i, '200');
    await page.waitForLoadState('networkidle');
  });

  test('create Transport budget $150', async ({ page }) => {
    await addBudget(page, /transport|transit/i, '150');
    await page.waitForLoadState('networkidle');
  });

  test('budget page shows at least one budget', async ({ page }) => {
    await expect(page.getByText(/\$[0-9]+/).first()).toBeVisible({ timeout: 8000 });
  });

  test('dashboard shows budget widget', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/budget/i).first()).toBeVisible({ timeout: 8000 });
  });
});
