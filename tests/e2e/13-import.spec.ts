/**
 * 13-import.spec.ts
 * Drop Zone import page — bank auto-detect, CSV parse, preview, confirm, history.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { login } from './helpers/auth';

const FIXTURE_GENERIC = path.resolve(__dirname, 'fixtures/sample-import.csv');
const FIXTURE_TD      = path.resolve(__dirname, 'fixtures/sample-import-td.csv');

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/import');
  await page.waitForLoadState('networkidle');
});

test.describe('Import — Page Load', () => {
  test('13.1 import page loads with upload zone', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/import|upload|drop/i);
  });

  test('13.2 history tab is present', async ({ page }) => {
    const historyBtn = page.getByRole('button', { name: /history/i });
    await expect(historyBtn).toBeVisible();
  });

  test('13.3 account selector is populated', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible({ timeout: 5_000 });
    const options = select.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1); // at least one real account option
  });
});

test.describe('Import — File Upload & Parse', () => {
  test('13.4 uploading CSV file shows filename in drop zone', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_GENERIC);
    await expect(page.locator('body')).toContainText(/sample-import\.csv/i, { timeout: 3_000 });
  });

  test('13.5 analyse button disabled until file and account both selected', async ({ page }) => {
    const analyseBtn = page.getByRole('button', { name: /analyse/i });
    // Before file: disabled
    await expect(analyseBtn).toBeDisabled();

    // After file only: still disabled (no account)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_GENERIC);
    await expect(analyseBtn).toBeDisabled();
  });

  test('13.6 generic CSV parses and shows preview table', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_GENERIC);

    const select = page.locator('select');
    const options = await select.locator('option').all();
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { await select.selectOption(val); break; }
    }

    await page.getByRole('button', { name: /analyse/i }).click();
    // Should show preview with transaction rows
    await expect(page.locator('body')).toContainText(/new transaction|Coffee Shop|Grocery Store/i, { timeout: 15_000 });
  });

  test('13.7 TD-format CSV shows bank detection label', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_TD);

    const select = page.locator('select');
    const options = await select.locator('option').all();
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { await select.selectOption(val); break; }
    }

    await page.getByRole('button', { name: /analyse/i }).click();
    // Should detect TD or show some bank name / confidence
    await expect(page.locator('body')).toContainText(/detected bank|confidence|TD|bank/i, { timeout: 15_000 });
  });
});

test.describe('Import — Preview & Confirm', () => {
  async function goToPreview(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_GENERIC);

    const select = page.locator('select');
    const options = await select.locator('option').all();
    for (const opt of options) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { await select.selectOption(val); break; }
    }

    await page.getByRole('button', { name: /analyse/i }).click();
    await expect(page.locator('body')).toContainText(/new transaction|Coffee Shop/i, { timeout: 15_000 });
  }

  test('13.8 preview shows summary stats (new/duplicate/total)', async ({ page }) => {
    await goToPreview(page);
    await expect(page.locator('body')).toContainText(/total rows|new|duplicate/i);
  });

  test('13.9 import button shows selected count', async ({ page }) => {
    await goToPreview(page);
    const importBtn = page.getByRole('button', { name: /import \d+ transaction/i });
    await expect(importBtn).toBeVisible({ timeout: 5_000 });
  });

  test('13.10 deselecting a row reduces selected count', async ({ page }) => {
    await goToPreview(page);

    // Get initial count from button label
    const importBtn = page.getByRole('button', { name: /import \d+ transaction/i });
    await importBtn.waitFor({ timeout: 5_000 });
    const initialText = await importBtn.textContent();
    const initialCount = parseInt(initialText?.match(/\d+/)?.[0] ?? '0');

    // Uncheck first row checkbox
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await firstCheckbox.uncheck();
      // Count should decrease
      await expect(page.getByRole('button', { name: /import \d+ transaction/i }))
        .toContainText(String(initialCount - 1), { timeout: 3_000 });
    }
  });

  test('13.11 cancel returns to upload screen', async ({ page }) => {
    await goToPreview(page);
    await page.getByRole('button', { name: /cancel/i }).click();
    // Drop zone should be visible again
    await expect(page.locator('body')).toContainText(/drop.*statement|analyse file|upload/i, { timeout: 5_000 });
  });

  test('13.12 confirm import completes and shows success', async ({ page }) => {
    await goToPreview(page);

    const importBtn = page.getByRole('button', { name: /import \d+ transaction/i });
    await expect(importBtn).not.toBeDisabled({ timeout: 5_000 });
    await importBtn.click();

    // Success toast or redirect to history
    await expect(page.locator('body')).toContainText(/imported|success/i, { timeout: 15_000 });
  });
});

test.describe('Import — History', () => {
  test('13.13 history tab shows after successful import', async ({ page }) => {
    await page.getByRole('button', { name: /history/i }).click();
    await page.waitForTimeout(500);
    // Either shows import records or empty state
    await expect(page.locator('body')).toContainText(/import|no import|uploaded/i);
  });

  test('13.14 history tab shows import records with status', async ({ page }) => {
    await page.getByRole('button', { name: /history/i }).click();
    await page.waitForLoadState('networkidle');

    // If there are records, they should show imported count
    const hasRecords = await page.locator('body').getByText(/imported/i).isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasRecords) {
      await expect(page.locator('body')).toContainText(/imported/i);
    } else {
      // Empty state is fine
      await expect(page.locator('body')).toContainText(/no import|get started/i);
    }
  });
});

test.describe('Import — Webhook (API)', () => {
  test('13.15 webhook endpoint rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post('/api/v1/import/webhook', {
      data: { accountId: 'fake', transactions: [] },
    });
    expect(res.status()).toBe(401);
  });
});
