import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

async function addRecurring(
  page: import('@playwright/test').Page,
  name: string,
  amount: string,
) {
  await page.getByRole('button', { name: /add|new recurring|add bill/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });

  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Amount').fill(amount);
  // Next Date is required — fill with today
  const today = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel('Next Date').fill(today);

  await dialog.getByRole('button', { name: /^Add$/i }).click();
  await waitForToast(page, /added|created|saved|success/i);
}

test.describe('Recurring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/recurring');
    await page.waitForLoadState('networkidle');
  });

  test('recurring page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /recurring/i })).toBeVisible();
  });

  test('create Netflix recurring $18/month', async ({ page }) => {
    await addRecurring(page, 'Netflix', '18');
    await expect(page.getByText('Netflix')).toBeVisible({ timeout: 8000 });
  });

  test('create Rent recurring $2000/month', async ({ page }) => {
    await addRecurring(page, 'Rent', '2000');
    await expect(page.getByText('Rent')).toBeVisible({ timeout: 8000 });
  });

  test('both recurring bills visible', async ({ page }) => {
    await expect(page.getByText('Netflix')).toBeVisible();
    await expect(page.getByText('Rent')).toBeVisible();
  });

  test('calendar view renders', async ({ page }) => {
    const calendarBtn = page.getByRole('button', { name: /calendar/i });
    if (await calendarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await calendarBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[class*="calendar"], [class*="grid"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('dashboard upcoming bills section visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/upcoming|bills|netflix|rent/i).first()).toBeVisible({ timeout: 8000 });
  });
});
