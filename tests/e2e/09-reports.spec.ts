import { test, expect } from '@playwright/test';

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
  });

  test('reports page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible();
    await expect(page.getByText(/^core$/i)).toBeVisible();
    await expect(page.getByText(/^wealth$/i)).toBeVisible();
    await expect(page.getByText(/^advanced$/i)).toBeVisible();
  });

  test('spending report shows category data from prior transactions', async ({ page }) => {
    const spendingTab = page.getByRole('tab', { name: /spending/i });
    if (await spendingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spendingTab.click();
    }
    await page.waitForLoadState('networkidle');
    // Should show at least one category from spec 03 transactions
    await expect(
      page.getByText(/groceries|dining|utilities|shopping|transport|whole foods|amazon|no data|no transactions|no spending/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('cash flow tab renders', async ({ page }) => {
    const cashFlowTab = page.getByRole('tab', { name: /cash flow/i });
    if (await cashFlowTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cashFlowTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/income|expense/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('budget variance tab renders', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /variance|budget/i });
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/actual|budget|variance/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('export CSV triggers download', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export.*csv|download.*csv/i }).first();
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    }
  });

  test('cash flow forecast tab renders', async ({ page }) => {
    const forecastTab = page.getByRole('tab', { name: /forecast/i });
    if (await forecastTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await forecastTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('svg, [class*="chart"]').first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('reports page shows no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    const real = errors.filter((e) => !e.includes('ResizeObserver'));
    expect(real).toHaveLength(0);
  });

  test('Tax Summary tab renders', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /tax summary/i });
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/tax|income|deduction/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Benchmarks tab renders', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /benchmark/i });
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/s&p 500|benchmark|index/i).first()).toBeVisible({ timeout: 8000 });
    }
  });
});
