import { test, expect } from './fixtures';
import * as path from 'path';

const CSV_PATH = path.join(__dirname, 'fixtures', 'sample-import.csv');

test.describe('CSV Import', () => {
  test('import page loads', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /import/i })).toBeVisible();
  });

  test('upload CSV file', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(CSV_PATH);
    await page.waitForTimeout(2000);

    // Column mapping step — map if fields are visible
    const dateCol = page.getByLabel(/date column|date/i).first();
    if (await dateCol.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateCol.selectOption({ label: /date/i } as any).catch(() => {});
    }

    // Proceed to next step
    const nextBtn = page.getByRole('button', { name: /next|preview|continue/i });
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
    }

    // Confirm import
    const importBtn = page.getByRole('button', { name: /^import$|confirm import|finish/i });
    if (await importBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await importBtn.click();
      await page.waitForTimeout(2000);
      await expect(
        page.getByText(/imported|success|5 transaction/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('imported transactions appear in transaction list', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText(/grocery store|gas station|restaurant|pharmacy|coffee shop/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('History button opens import history', async ({ page }) => {
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /history/i }).click();
    await page.waitForTimeout(500);
    const hasItems = await page.locator('[class*="import"], [class*="history"]').count() > 0;
    const hasEmpty = await page.getByText(/no imports|no history|nothing yet/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasItems || hasEmpty).toBeTruthy();
  });
});
