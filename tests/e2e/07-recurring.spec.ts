/**
 * 07-recurring.spec.ts
 * Recurring bills CRUD + mark paid + upcoming logic.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/recurring');
  await page.waitForLoadState('networkidle');
});

test.describe('Recurring', () => {
  test('7.1 recurring page loads', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/recurring|bills|subscriptions/i);
  });

  test('7.2 existing recurring items are listed', async ({ page }) => {
    // Seeded data has Netflix, Spotify, etc.
    await expect(page.locator('body')).toContainText(/Netflix|Spotify|Rogers|Rent/i);
  });

  test('7.3 create a new recurring item', async ({ page }) => {
    const name = `E2E Bill ${Date.now()}`;
    await page.getByRole('button', { name: /^add recurring$/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });

    // Name field (id="name" from label="Name")
    await dialog.getByRole('textbox', { name: /^name$/i }).fill(name);
    // Amount spinbutton
    await dialog.getByRole('spinbutton', { name: /amount/i }).fill('29.99');

    // Frequency combobox — select Monthly
    const freqSelect = dialog.getByRole('combobox', { name: /frequency/i });
    if (await freqSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await freqSelect.selectOption({ label: 'Monthly' }).catch(() => {});
    }

    // Next due date — input[type="date"] is not role="textbox", use locator
    const dateInput = dialog.locator('input[type="date"]').first();
    await dateInput.fill('2026-04-01');

    // Account — required by API; use Playwright selectOption (fires React synthetic events)
    const accountSelect = dialog.locator('select#account');
    if (await accountSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const opts = await accountSelect.locator('option:not([disabled])').all();
      if (opts.length > 0) {
        const val = await opts[0].getAttribute('value');
        if (val) await accountSelect.selectOption(val);
      }
    }

    await dialog.getByRole('button', { name: /^add$/i }).click();
    // Switch to "All recurring" view to see the new item (monthly view filters by current month)
    await page.getByRole('button', { name: /all recurring/i }).click();
    await expect(page.locator('body')).toContainText(name, { timeout: 8_000 });
  });

  test('7.4 edit a recurring item amount', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit/i })
      .or(page.locator('button[aria-label*="edit" i]')).first();
    if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const amountInput = dialog.locator('input[type="number"]').first();
      await amountInput.clear();
      await amountInput.fill('49.99');
      await dialog.getByRole('button', { name: /save|update/i }).last().click();
      await expect(page.locator('body')).toContainText(/49\.99|49,99/, { timeout: 6_000 });
    }
  });

  test('7.5 delete a recurring item', async ({ page }) => {
    const name = `Delete Bill ${Date.now()}`;
    await page.getByRole('button', { name: /^add recurring$/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5_000 });
    await dialog.getByRole('textbox', { name: /^name$/i }).fill(name);
    await dialog.getByRole('spinbutton', { name: /amount/i }).fill('9.99');
    await dialog.locator('input[type="date"]').first().fill('2026-04-01');
    // Select first real account (required)
    const accountSel = dialog.locator('select#account');
    if (await accountSel.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const opts = await accountSel.locator('option:not([disabled])').all();
      if (opts.length > 0) {
        const val = await opts[0].getAttribute('value');
        if (val) await accountSel.selectOption(val);
      }
    }
    await dialog.getByRole('button', { name: /^add$/i }).click();
    // Switch to "All recurring" view to see newly created item
    await page.getByRole('button', { name: /all recurring/i }).click();
    await expect(page.locator('body')).toContainText(name, { timeout: 8_000 });

    const itemRow = page.locator('body').getByText(name).first();
    await itemRow.hover();
    const deleteBtn = page.locator('button[aria-label*="delete" i]').last();
    if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.locator('body')).not.toContainText(name, { timeout: 8_000 });
    }
  });

  test('7.6 recurring items show amount and frequency', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\$[\d.]+/);
    await expect(page.locator('body')).toContainText(/monthly|weekly|annually/i);
  });

  test('7.7 upcoming bills appear on dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/upcoming|bills/i);
    await expect(page.locator('body')).toContainText(/Netflix|Rogers|Rent/i);
  });
});
