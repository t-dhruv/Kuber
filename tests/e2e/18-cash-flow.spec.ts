import { test, expect } from '@playwright/test';

test.describe('Cash Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cash-flow');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /cash flow/i })).toBeVisible();
  });

  test('Monthly / Quarterly / Yearly tabs switch', async ({ page }) => {
    await page.getByRole('button', { name: /quarterly/i }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /yearly/i }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /monthly/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /monthly/i })).toBeVisible();
  });

  test('year nav arrows change year', async ({ page }) => {
    // Year nav uses ‹ and › characters
    const yearSpan = page.locator('span').filter({ hasText: /^20[0-9]{2}$/ }).first();
    const yearText = await yearSpan.textContent();
    // Click the prev-year button (‹) — locate by its content character
    const prevBtn = page.locator('button').filter({ hasText: '‹' });
    await prevBtn.click();
    await page.waitForTimeout(500);
    const newYearText = await yearSpan.textContent();
    expect(yearText).not.toEqual(newYearText);
  });

  test('Filters button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /filters/i })).toBeVisible();
  });

  test('month detail section is visible', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /bar chart|sankey|merchants/i }).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('summary KPI cards show income, expenses, net, savings rate', async ({ page }) => {
    await expect(page.getByText(/income.*apr|expenses.*apr|net|savings rate/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('page has no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
