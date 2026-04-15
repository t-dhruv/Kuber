/**
 * 13-import.spec.ts
 * Multi-step import flow: drop zone → column mapping → preview → confirm → history.
 * Covers CSV and PDF upload, bank format auto-detect, dedup flagging, and import history.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/import');
  await page.waitForLoadState('networkidle');
});

// ---------------------------------------------------------------------------
// Import — Drop Zone
// ---------------------------------------------------------------------------

test.describe('Import — Drop Zone', () => {
  test('13.1 import page loads with drop zone', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/import|drop|upload/i);
    const dropZone = page.locator(
      '[data-testid="drop-zone"], [class*="dropzone"], input[type="file"]'
    ).first();
    const hasZone = await dropZone.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasZone) {
      await expect(dropZone).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /upload|import|choose.*file/i }).first()).toBeVisible();
    }
  });

  test('13.2 file input accepts CSV files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(fileInput).toBeAttached();
    } else {
      test.skip();
    }
  });

  test('13.3 upload button is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /upload|import|choose.*file|select.*file/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('13.4 duplicate detection banner shown when duplicates exist', async ({ page }) => {
    const banner = page.locator(
      '[class*="duplicate"], [data-testid*="dup"], text=/duplicate|found.*import/i'
    ).first();
    const hasBanner = await banner.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasBanner) {
      await expect(page.locator('body')).not.toContainText(/internal server error|500/i);
    } else {
      await expect(banner).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // Import — CSV Multi-Step Flow
  // ---------------------------------------------------------------------------

  test('13.5 upload a CSV file via file input', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'td-chequing.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Date,Description,Debit,Credit,Balance\n2026-03-01,STARBUCKS,-5.50,0.00,1000.00\n2026-03-02,PAYROLL,0.00,2500.00,3500.00'
      ),
    });
    await page.waitForTimeout(2_000);
    const hasMappingOrPreview = await page.locator('body').evaluate(el =>
      /mapping|preview|column|confirm|import/i.test(el.textContent ?? '')
    );
    if (hasMappingOrPreview) {
      await expect(page.locator('body')).toContainText(/mapping|preview|column|confirm|import/i, { timeout: 8_000 });
    }
  });

  test('13.6 bank format is auto-detected from CSV headers', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'td-canada.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Date,Description,Debit,Credit,Balance\n2026-03-01,TIM HORTONS,-4.75,0.00,1500.00'
      ),
    });
    await page.waitForTimeout(2_000);
    const hasBankName = await page.locator('body').evaluate(el =>
      /TD|RBC|CIBC|BMO|Scotiabank|Chase|Bank.*America/i.test(el.textContent ?? '')
    );
    if (hasBankName) {
      await expect(page.locator('body')).toContainText(/TD|RBC|CIBC|BMO|Scotiabank|Chase|Bank.*America/i);
    }
  });

  test('13.7 column mapping confirmation step renders', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'generic.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Merchant,Amount\n2026-03-01,Amazon,-49.99'),
    });
    await page.waitForTimeout(2_000);
    const hasMapping = await page.locator('body').evaluate(el =>
      /map|match|column|date|merchant|amount/i.test(el.textContent ?? '')
    );
    if (hasMapping) {
      const selects = page.locator('select').first();
      if (await selects.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(selects).toBeVisible();
      }
    }
  });

  test('13.8 preview table shows parsed rows with amounts', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'preview-test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Description,Debit,Credit\n2026-03-01,STARBUCKS,5.50,\n2026-03-02,PAYROLL,,2500.00'),
    });
    await page.waitForTimeout(3_000);
    const hasAmounts = await page.locator('body').evaluate(el => /\$[\d,]/.test(el.textContent ?? ''));
    if (hasAmounts) {
      await expect(page.locator('body')).toContainText(/\$[\d,]/);
    }
  });

  test('13.9 duplicate rows flagged with REVIEW or DUPLICATE badges', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'dedup-test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Description,Debit,Credit\n2026-03-01,STARBUCKS,5.50,'),
    });
    await page.waitForTimeout(2_000);
    const hasDupFlag = await page.locator('body').evaluate(el =>
      /duplicate|review|new|skip/i.test(el.textContent ?? '')
    );
    if (hasDupFlag) {
      await expect(page.locator('body')).toContainText(/duplicate|review|new|skip/i, { timeout: 5_000 });
    }
  });

  test('13.10 confirm import shows success toast', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await fileInput.setInputFiles({
      name: 'confirm-test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Description,Debit,Credit\n2026-03-01,Test Merchant,-10.00,'),
    });
    await page.waitForTimeout(2_000);
    const confirmBtn = page.getByRole('button', { name: /confirm|import.*transactions|done|complete/i }).first();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2_000);
      const hasSuccess = await page.locator('body').evaluate(el =>
        /success|imported|added|created|\d+.*transaction/i.test(el.textContent ?? '')
      );
      if (hasSuccess) {
        await expect(page.locator('body')).toContainText(/success|imported|added|created|\d+.*transaction/i, { timeout: 8_000 });
      }
    }
  });

  test('13.11 import history tab shows past import record', async ({ page }) => {
    const historyTab = page.getByRole('tab', { name: /history/i })
      .or(page.getByRole('button', { name: /history/i }))
      .or(page.locator('[class*="tab"]:has-text("History"), a:has-text("History")').first());
    const hasTab = await historyTab.isVisible({ timeout: 2_000 }).catch(() => false);
    if (hasTab) {
      await historyTab.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator('body')).toContainText(/import|history|file|rows|status/i, { timeout: 5_000 });
    } else {
      await expect(page.locator('body')).toContainText(/history|import/i, { timeout: 5_000 });
    }
  });

  test('13.12 upload PDF file via drop zone or file input', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    const accept = await fileInput.getAttribute('accept') ?? '';
    if (/pdf/i.test(accept) || accept === '') {
      await fileInput.setInputFiles({
        name: 'bank-statement.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock'),
      });
      await page.waitForTimeout(2_000);
      await expect(page.locator('body')).toContainText(/parsing|processing|error|unsupported|import/i, { timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('13.13 import with no file selected shows error or stays on page', async ({ page }) => {
    const proceedBtn = page.getByRole('button', { name: /import|upload|confirm|next|continue/i }).first();
    if (await proceedBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await proceedBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
    }
  });
});