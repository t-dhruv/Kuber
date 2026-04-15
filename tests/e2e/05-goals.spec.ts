import { test, expect } from '@playwright/test';
import { waitForToast } from './helpers';

test.describe('Goals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
  });

  test('goals page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /goals/i })).toBeVisible();
  });

  test('create Emergency Fund savings goal ($20,000 target)', async ({ page }) => {
    await page.getByRole('button', { name: /add goal|new goal|create goal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });

    await dialog.getByLabel(/goal name/i).fill('Emergency Fund');
    await dialog.getByLabel(/target amount/i).fill('20000');
    const startField = dialog.getByLabel(/starting amount/i);
    if (await startField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await startField.fill('500');
    }
    await dialog.getByRole('button', { name: /add goal|save|create/i }).click();
    await waitForToast(page, /added|created|saved|success/i);
    await expect(page.getByText('Emergency Fund')).toBeVisible({ timeout: 8000 });
  });

  test('create Car Loan debt goal ($15,000)', async ({ page }) => {
    // Switch to debt/pay-down tab if present
    const debtTab = page.getByRole('tab', { name: /debt|pay down/i });
    if (await debtTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await debtTab.click();
    }
    await page.getByRole('button', { name: /add goal|new goal|create goal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });

    await dialog.getByLabel(/goal name/i).fill('Car Loan');
    const debtField = dialog.getByLabel(/total debt|debt amount/i);
    if (await debtField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await debtField.fill('15000');
    } else {
      await dialog.getByLabel(/target amount/i).fill('15000');
    }
    await dialog.getByRole('button', { name: /add goal|save|create/i }).click();
    await waitForToast(page, /added|created|saved|success/i);
  });

  test('Emergency Fund shows in goals list', async ({ page }) => {
    await expect(page.getByText('Emergency Fund')).toBeVisible({ timeout: 8000 });
  });

  test('dashboard goals widget shows Emergency Fund', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Emergency Fund')).toBeVisible({ timeout: 8000 });
  });
});
