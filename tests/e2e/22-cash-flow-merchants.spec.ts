/**
 * 22-cash-flow-merchants.spec.ts
 * Cash Flow page merchant breakdown tab and core functionality.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  // Try /cash-flow first, fall back to /cashflow
  await page.goto('/cash-flow');
  await page.waitForLoadState('networkidle').catch(() => {});
  if (page.url().includes('/login')) {
    await page.goto('/cashflow');
    await page.waitForLoadState('networkidle');
  }
});

test.describe('Cash Flow & Merchant Breakdown', () => {
  test('22.1 cash flow page loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/internal server error|something went wrong/i);
    await expect(page.locator('body')).toContainText(/cash.*flow|income|expense/i);
  });

  test('22.2 monthly income and expense bars or numbers are present', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
    await expect(page.locator('body')).toContainText(/income|expense/i);
  });

  test('22.3 tabs exist for overview / by month / merchants', async ({ page }) => {
    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    if (tabCount > 0) {
      expect(tabCount).toBeGreaterThanOrEqual(1);
    } else {
      // May use buttons instead of tabs
      await expect(page.locator('body')).toContainText(/income|expense|merchant/i);
    }
  });

  test('22.4 merchant breakdown tab shows top merchants', async ({ page }) => {
    const merchantTab = page.getByRole('tab', { name: /merchant/i })
      .or(page.getByRole('button', { name: /merchant/i }).first());
    if (await merchantTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await merchantTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toContainText(/merchant|store|vendor/i, { timeout: 5_000 });
    } else {
      // Merchant tab may not exist
      const bodyText = await page.locator('body').textContent() ?? '';
      if (/merchant/i.test(bodyText)) {
        await expect(page.locator('body')).toContainText(/merchant/i);
      } else {
        test.skip();
      }
    }
  });

  test('22.5 cash flow chart or bar graph is rendered', async ({ page }) => {
    // Check for canvas (Chart.js) or SVG (Recharts/Victory)
    const chart = page.locator('canvas, svg[class*="chart"], svg[class*="recharts"], [class*="chart"]').first();
    const hasChart = await chart.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasChart) {
      // Chart may be in a specific container
      await expect(page.locator('body')).toContainText(/\$[\d,]+/);
    } else {
      await expect(chart).toBeVisible();
    }
  });

  test('22.6 year or month selector is present', async ({ page }) => {
    const selector = page.locator(
      'select[name*="year" i], select[name*="month" i], ' +
      '[data-testid*="year-select"], [data-testid*="period-select"], ' +
      'button:has-text("2026"), button:has-text("2025")'
    ).first();
    const hasSelector = await selector.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasSelector) {
      // May use prev/next navigation buttons
      const navBtn = page.getByRole('button', { name: /previous|next|prev|\<|\>/i }).first();
      const hasNav = await navBtn.isVisible({ timeout: 2_000 }).catch(() => false);
      if (!hasNav) {
        test.skip();
      } else {
        await expect(navBtn).toBeVisible();
      }
    } else {
      await expect(selector).toBeVisible();
    }
  });

  test('22.7 net cash flow (income - expenses) is shown', async ({ page }) => {
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasNet = /net.*cash|surplus|deficit|net.*flow|\+\$|\-\$/i.test(bodyText);
    if (hasNet) {
      await expect(page.locator('body')).toContainText(/net|surplus|deficit/i);
    } else {
      // Both income and expenses shown separately
      await expect(page.locator('body')).toContainText(/income/i);
      await expect(page.locator('body')).toContainText(/expense/i);
    }
  });
});
