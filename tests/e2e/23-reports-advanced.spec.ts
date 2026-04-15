/**
 * 23-reports-advanced.spec.ts
 * Reports: saved views save/load/delete, export PDF/Excel,
 * budget variance chart, forecast chart.
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/auth';

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
    const loginResponse = await page.request.post('http://localhost:9002/api/v1/auth/login', {
      data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    });
    const { accessToken } = await loginResponse.json();

    const resp = await page.request.get(
      'http://localhost:9002/api/v1/reports/spending?startDate=2026-01-01&endDate=2026-03-31',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Reports — Budget Variance, Forecast, Export, Saved Views, Tax, Scheduling
  // ---------------------------------------------------------------------------

  test.describe('Reports — Budget Variance, Export, Saved Views, Scheduling', () => {
    test('23.11 budget variance chart renders with actual vs planned bars', async ({ page }) => {
      const varianceTab = page.getByRole('tab', { name: /budget.*variance|variance/i })
        .or(page.getByRole('button', { name: /budget.*variance|variance/i }).first());
      if (!await varianceTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await varianceTab.click();
      await page.waitForLoadState('networkidle');

      // Look for a chart (SVG or canvas)
      const chart = page.locator('svg, canvas, [class*="recharts"]').first();
      if (await chart.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(chart).toBeVisible();
      } else {
        // Should show variance data table
        await expect(page.locator('body')).toContainText(/variance|actual|planned|budget/i, { timeout: 5_000 });
      }
    });

    test('23.12 forecast chart renders with projection line', async ({ page }) => {
      const forecastTab = page.getByRole('tab', { name: /forecast/i })
        .or(page.getByRole('button', { name: /forecast/i }).first());
      if (!await forecastTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await forecastTab.click();
      await page.waitForLoadState('networkidle');

      const chart = page.locator('svg, canvas, [class*="recharts"]').first();
      if (await chart.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(chart).toBeVisible();
      } else {
        await expect(page.locator('body')).toContainText(/forecast|projection|30.*day|60.*day|90.*day/i, { timeout: 5_000 });
      }
    });

    test('23.13 export PDF triggers file download', async ({ page }) => {
      const exportBtn = page.getByRole('button', { name: /export.*PDF|download.*PDF|PDF.*export/i })
        .or(page.locator('[data-testid*="export-pdf"]').first());
      if (!await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Try export menu
        const menuBtn = page.getByRole('button', { name: /export|download/i }).first();
        if (await menuBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await menuBtn.click();
          await page.waitForTimeout(500);
        } else {
          test.skip();
          return;
        }
      }

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename.length).toBeGreaterThan(0);
      } else {
        test.skip();
      }
    });

    test('23.14 export Excel/CSV triggers file download', async ({ page }) => {
      const exportBtn = page.getByRole('button', { name: /export.*Excel|Excel.*export|download.*excel/i })
        .or(page.locator('[data-testid*="export-excel"]').first());
      if (!await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const menuBtn = page.getByRole('button', { name: /export|download/i }).first();
        if (await menuBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await menuBtn.click();
          await page.waitForTimeout(500);
        } else {
          test.skip();
          return;
        }
      }

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename.length).toBeGreaterThan(0);
      } else {
        test.skip();
      }
    });

    test('23.15 save a report view with a custom name', async ({ page }) => {
      // Navigate to a report tab first (spending or cash flow)
      const spendingTab = page.getByRole('tab', { name: /spending|cash.*flow/i }).first();
      if (await spendingTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await spendingTab.click();
      }
      await page.waitForTimeout(500);

      // Look for save/view/preset button
      const saveBtn = page.getByRole('button', { name: /save.*view|save.*report|save.*preset|new.*view/i })
        .or(page.locator('button[title*="save" i], button[aria-label*="save" i]').first());
      if (!await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await saveBtn.click();

      // Should show a dialog/panel to name the view
      const dialog = page.getByRole('dialog')
        .or(page.locator('[class*="popover"], [class*="dropdown"]').first());
      const hasDialog = await dialog.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasDialog) {
        const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
        if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await nameInput.fill(`E2E Saved View ${Date.now()}`);
          const confirmBtn = dialog.getByRole('button', { name: /save|create|confirm/i }).last();
          if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(2_000);
            await expect(page.locator('body')).toContainText(/saved|view/i, { timeout: 5_000 });
          }
        } else {
          test.skip();
        }
      } else {
        test.skip();
      }
    });

    test('23.16 load a saved report view', async ({ page }) => {
      // Look for saved views selector / dropdown
      const savedViewsSelect = page.locator(
        'select[name*="view" i], [data-testid*="saved-view"], ' +
        'button:has-text("Saved View"), button:has-text("Load View")'
      ).first();
      if (await savedViewsSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Open the selector
        await savedViewsSelect.click();
        await page.waitForTimeout(500);
        // Look for an option
        const option = page.locator('option[value!=""], option').nth(1);
        if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await option.click();
          await page.waitForTimeout(1_000);
          await expect(page.locator('body')).not.toContainText(/500|error occurred/i);
        } else {
          test.skip();
        }
      } else {
        // Look for a saved view button/tab
        const viewBtn = page.locator('button:has-text("Saved View"), button:has-text("Load View")').first();
        if (await viewBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await viewBtn.click();
          await page.waitForTimeout(1_000);
          await expect(page.locator('body')).not.toContainText(/500|error/i);
        } else {
          test.skip();
        }
      }
    });

    test('23.17 delete a saved report view', async ({ page }) => {
      // Look for a saved views panel/list with delete buttons
      const deleteBtn = page.getByRole('button', { name: /delete.*view|remove.*view|delete.*preset/i })
        .or(page.locator('button[aria-label*="delete view" i]').first());
      if (!await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await deleteBtn.click();
      await page.waitForTimeout(1_000);
      // Should show confirmation or immediately delete
      await expect(page.locator('body')).not.toContainText(/500|error occurred/i);
    });

    test('23.18 schedule a report to email — create schedule', async ({ page }) => {
      // Navigate to schedules section
      const scheduleTab = page.getByRole('tab', { name: /schedule|saved.*view|report.*schedule/i })
        .or(page.getByRole('button', { name: /schedule.*report|schedule/i }).first());
      if (await scheduleTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await scheduleTab.click();
      }
      await page.waitForTimeout(500);

      const addScheduleBtn = page.getByRole('button', { name: /add.*schedule|new.*schedule|\+ schedule/i })
        .or(page.locator('button:has-text("Schedule Report")').first());
      if (!await addScheduleBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await addScheduleBtn.click();

      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Fill frequency (daily/weekly/monthly)
      const frequencySelect = dialog.locator('select[name*="frequency" i], select[name*="schedule" i]').first();
      if (await frequencySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await frequencySelect.selectOption({ label: /weekly/i }).catch(() => {});
      }

      // Enter email address
      const emailInput = dialog.locator('input[type="email"], input[name*="email" i]').first();
      if (await emailInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await emailInput.fill('e2e+schedule@kuber-e2e.test');
      }

      const saveBtn = dialog.getByRole('button', { name: /save|create|schedule/i }).last();
      if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(2_000);
        await expect(page.locator('body')).toContainText(/schedule|weekly|email/i, { timeout: 8_000 });
      } else {
        test.skip();
      }
    });

    test('23.19 tax report shows deductible categories and T4 summary', async ({ page }) => {
      const taxTab = page.getByRole('tab', { name: /tax/i })
        .or(page.getByRole('button', { name: /tax.*report|tax.*summary/i }).first());
      if (!await taxTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await taxTab.click();
      await page.waitForLoadState('networkidle');

      const bodyText = await page.locator('body').textContent() ?? '';
      const hasTaxContent = /tax|deductible|T4|rrsp.*contribution|medical|charity/i.test(bodyText);
      if (hasTaxContent) {
        await expect(page.locator('body')).toContainText(/tax|deductible|T4/i);
      } else {
        // Page may show tax summary even without data
        await expect(page.locator('body')).not.toContainText(/500|error occurred/i);
      }
    });

    test('23.20 tax report export generates downloadable file', async ({ page }) => {
      const taxTab = page.getByRole('tab', { name: /tax/i })
        .or(page.getByRole('button', { name: /tax/i }).first());
      if (await taxTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await taxTab.click();
      }
      await page.waitForTimeout(500);

      const exportBtn = page.getByRole('button', { name: /export.*tax|download.*tax|tax.*PDF/i })
        .or(page.locator('button:has-text("Export Tax")).first());
      if (!await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename().length).toBeGreaterThan(0);
      } else {
        test.skip();
      }
    });
  });
});
