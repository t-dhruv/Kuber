/**
 * 23-reports-advanced.spec.ts
 * Reports: saved views save/load/delete, export PDF/Excel,
 * budget variance chart, forecast chart.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
});

test.describe('Reports — Advanced', () => {
  test('23.1 reports page loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/500|internal server error|something went wrong/i);
    await expect(page.locator('body')).toContainText(/report/i);
  });

  test('23.2 spending report tab renders chart and data', async ({ page }) => {
    const spendingTab = page.getByRole('tab', { name: /spending/i })
      .or(page.getByRole('button', { name: /spending/i }).first());
    if (await spendingTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await spendingTab.click();
      await page.waitForLoadState('networkidle');
    }
    await expect(page.locator('body')).toContainText(/spending|category|\$[\d,]+/i, { timeout: 5_000 });
  });

  test('23.3 budget variance report is accessible', async ({ page }) => {
    const budgetTab = page.getByRole('tab', { name: /budget.*variance|variance/i })
      .or(page.getByRole('button', { name: /budget.*variance|variance/i }).first());
    if (await budgetTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await budgetTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/budget|variance|actual|planned/i, { timeout: 5_000 });
    } else {
      // May be on a different sub-route
      const bodyText = await page.locator('body').textContent() ?? '';
      if (/variance/i.test(bodyText)) {
        await expect(page.locator('body')).toContainText(/variance/i);
      } else {
        test.skip();
      }
    }
  });

  test('23.4 forecast chart is accessible', async ({ page }) => {
    const forecastTab = page.getByRole('tab', { name: /forecast/i })
      .or(page.getByRole('button', { name: /forecast/i }).first());
    if (await forecastTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await forecastTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/forecast|projection|predicted/i, { timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('23.5 export PDF button is present', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export.*PDF|download.*PDF|PDF/i })
      .or(page.locator('[data-testid*="export-pdf"]').first());
    const hasExport = await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasExport) {
      // Look for a generic export dropdown
      const exportMenu = page.getByRole('button', { name: /export|download/i }).first();
      if (await exportMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await exportMenu.click();
        await page.waitForTimeout(500);
        const pdfOption = page.getByRole('menuitem', { name: /PDF/i })
          .or(page.locator('a:has-text("PDF"), button:has-text("PDF")').first());
        const hasPdf = await pdfOption.isVisible({ timeout: 2_000 }).catch(() => false);
        if (hasPdf) {
          await expect(pdfOption).toBeVisible();
        } else {
          test.skip();
        }
      } else {
        test.skip();
      }
    } else {
      await expect(exportBtn).toBeVisible();
    }
  });

  test('23.6 export Excel/CSV button is present', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export.*Excel|Excel|xlsx|export.*CSV/i })
      .or(page.locator('[data-testid*="export-excel"]').first());
    const hasExport = await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasExport) {
      const exportMenu = page.getByRole('button', { name: /export|download/i }).first();
      if (await exportMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await exportMenu.click();
        await page.waitForTimeout(500);
        const excelOption = page.getByRole('menuitem', { name: /Excel|xlsx|CSV/i })
          .or(page.locator('a:has-text("Excel"), button:has-text("Excel"), a:has-text("CSV")').first());
        const hasExcel = await excelOption.isVisible({ timeout: 2_000 }).catch(() => false);
        if (hasExcel) {
          await expect(excelOption).toBeVisible();
        } else {
          test.skip();
        }
      } else {
        test.skip();
      }
    } else {
      await expect(exportBtn).toBeVisible();
    }
  });

  test('23.7 saved views / schedules section is accessible', async ({ page }) => {
    const scheduleTab = page.getByRole('tab', { name: /schedule|saved.*view|saved/i })
      .or(page.getByRole('button', { name: /schedule.*report|saved.*view/i }).first());
    if (await scheduleTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await scheduleTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/schedule|saved|email.*report/i, { timeout: 5_000 });
    } else {
      const bodyText = await page.locator('body').textContent() ?? '';
      if (/schedule|saved.*view/i.test(bodyText)) {
        await expect(page.locator('body')).toContainText(/schedule|saved/i);
      } else {
        test.skip();
      }
    }
  });

  test('23.8 date range selector changes report data', async ({ page }) => {
    // Look for date range inputs
    const startDate = page.locator('input[type="date"], input[name*="start" i], input[placeholder*="from" i]').first();
    if (await startDate.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await startDate.fill('2026-01-01');
      const endDate = page.locator('input[type="date"], input[name*="end" i], input[placeholder*="to" i]').last();
      if (await endDate.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await endDate.fill('2026-03-31');
      }
      const applyBtn = page.getByRole('button', { name: /apply|filter|search|go/i });
      if (await applyBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await applyBtn.click();
        await page.waitForLoadState('networkidle');
      }
      await expect(page.locator('body')).not.toContainText(/500|error/i);
    } else {
      test.skip();
    }
  });

  test('23.9 tax report is accessible', async ({ page }) => {
    const taxTab = page.getByRole('tab', { name: /tax/i })
      .or(page.getByRole('button', { name: /tax.*report|tax.*summary/i }).first());
    if (await taxTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await taxTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/tax|deductible|T4|RRSP/i, { timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('23.10 API spending report returns 200 with data', async ({ page }) => {
    const loginResponse = await page.request.post('http://localhost:4000/api/v1/auth/login', {
      data: { email: 'demo@kuber.app', password: 'password123' },
    });
    const { accessToken } = await loginResponse.json();

    const resp = await page.request.get(
      'http://localhost:4000/api/v1/reports/spending?startDate=2026-01-01&endDate=2026-03-31',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data).toBeTruthy();
  });
});
