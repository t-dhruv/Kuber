import { test, expect } from '@playwright/test';

test.describe('Bulk Import Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accounts/bulk-import');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /bulk import accounts/i })).toBeVisible();
  });

  test('breadcrumb shows Bulk Import', async ({ page }) => {
    await expect(page.getByText('Bulk Import').first()).toBeVisible();
  });

  test('Download Template button is visible and functional', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.getByRole('button', { name: /download template/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test('CSV Guide link or button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /csv guide/i }).or(page.getByRole('link', { name: /csv guide/i }))
    ).toBeVisible();
  });

  test('drop zone is visible', async ({ page }) => {
    await expect(page.getByText(/drop your accounts csv/i)).toBeVisible();
  });

  test('drop zone rejects non-CSV files (only .csv extension accepted via drop)', async ({ page }) => {
    // The drop handler in UploadZone checks f?.name.endsWith('.csv') — non-CSV is silently rejected.
    await page.evaluate(() => {
      const zone = document.querySelector('.border-dashed') as HTMLElement;
      if (!zone) throw new Error('Drop zone not found');
      const dt = new DataTransfer();
      const file = new File(['not csv content'], 'test.txt', { type: 'text/plain' });
      (dt as any).items.add(file);
      // Dispatch dragover then drop
      zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await page.waitForTimeout(500);
    // File name should NOT appear because non-.csv was silently rejected
    await expect(page.getByText('test.txt')).not.toBeVisible();
    // Drop zone prompt should still show (file was not accepted)
    await expect(page.getByText(/drop your accounts csv/i)).toBeVisible();
  });

  test('page has no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
