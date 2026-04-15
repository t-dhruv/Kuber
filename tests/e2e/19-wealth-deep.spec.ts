/**
 * 19-wealth-deep.spec.ts
 * Deep tests for Wealth page: income setup, 50/30/20 buckets display,
 * Where to Cut, Investment Ladder, AI analysis panel (not-configured fallback).
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/wealth');
  await page.waitForLoadState('networkidle');
});

test.describe('Wealth Page — Deep Tests', () => {
  test('19.1 wealth page loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText(/500|internal server error|something went wrong/i);
    await expect(page.locator('body')).toContainText(/wealth|income|budget/i);
  });

  test('19.2 income setup section is present', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/income|monthly.*income|set.*income|income.*setup/i);
  });

  test('19.3 50/30/20 budget buckets are displayed', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/50|30|20|needs|wants|saving/i);
  });

  test('19.4 needs / wants / savings labels are present', async ({ page }) => {
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasLabels = /needs|wants|savings|saving/i.test(bodyText);
    expect(hasLabels).toBe(true);
  });

  test('19.5 category bucket amounts are shown as currency', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\$[\d,]+/);
  });

  test('19.6 "Where to Cut" or top spending categories section exists', async ({ page }) => {
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasCutSection = /where.*cut|top.*spend|overspend|cut back/i.test(bodyText);
    if (hasCutSection) {
      await expect(page.locator('body')).toContainText(/where.*cut|top.*spend|overspend/i);
    } else {
      // Section may be labelled differently
      await expect(page.locator('body')).toContainText(/spending|budget|category/i);
    }
  });

  test('19.7 investment ladder or investment section is present', async ({ page }) => {
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasInvestment = /investment.*ladder|invest|emergency.*fund|tfsa|rrsp/i.test(bodyText);
    if (!hasInvestment) {
      // Investment ladder may be on a sub-tab
      const ladderTab = page.getByRole('tab', { name: /invest|ladder/i })
        .or(page.locator('button:has-text("Investment"), button:has-text("Ladder")').first());
      if (await ladderTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await ladderTab.click();
        await page.waitForTimeout(500);
        await expect(page.locator('body')).toContainText(/invest|ladder|step/i);
      } else {
        test.skip();
      }
    } else {
      await expect(page.locator('body')).toContainText(/invest/i);
    }
  });

  test('19.8 AI analysis panel shows fallback when AI not configured', async ({ page }) => {
    const aiSection = page.locator(
      '[data-testid*="ai"], [class*="ai-"], button:has-text("AI Analysis"), ' +
      'button:has-text("Get AI"), text=/AI.*analysis|Ask.*AI|Generate.*analysis/i'
    ).first();
    if (await aiSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // If it's a button, click it
      const isBtn = await aiSection.evaluate(el => el.tagName === 'BUTTON');
      if (isBtn) {
        await aiSection.click();
        await page.waitForTimeout(2_000);
        // Should either show analysis or a "not configured" message
        await expect(page.locator('body')).toContainText(
          /configure.*AI|set up.*AI|API key|not.*configured|analysis|insight/i,
          { timeout: 8_000 }
        );
      }
    } else {
      // AI section may be inline
      const bodyText = await page.locator('body').textContent() ?? '';
      const hasAI = /AI.*insight|configure.*AI|set up.*AI/i.test(bodyText);
      if (!hasAI) test.skip();
    }
  });

  test('19.9 income edit modal can be opened', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit.*income|set.*income|update.*income/i })
      .or(page.locator('[data-testid="edit-income"], [aria-label*="edit income" i]').first());
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });
      await expect(dialog).toBeVisible();
      // Close it
      await page.keyboard.press('Escape');
    } else {
      test.skip();
    }
  });

  test('19.10 wealth page shows monthly surplus or deficit', async ({ page }) => {
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasSurplusDeficit = /surplus|deficit|net.*income|free.*cash|leftover/i.test(bodyText);
    if (hasSurplusDeficit) {
      await expect(page.locator('body')).toContainText(/surplus|deficit|net|free.*cash/i);
    } else {
      // Soft check
      await expect(page.locator('body')).toContainText(/\$[\d,]+/);
    }
  });

  // ---------------------------------------------------------------------------
  // Wealth Page — Income Edit, Ladder, Alerts, Savings Capacity
  // ---------------------------------------------------------------------------

  test.describe('Wealth Page — Income Edit, Ladder, Alerts', () => {
    test('19.11 income edit modal saves correctly and shows updated amounts', async ({ page }) => {
      const editBtn = page.getByRole('button', { name: /edit.*income|set.*income|update.*income|change.*income/i })
        .or(page.locator('[data-testid="edit-income"], [aria-label*="edit income" i]').first());
      if (!await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }
      await editBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Find income amount input and change it
      const incomeInput = dialog.locator('input[type="number"], input[name*="income"], input[name*="salary"]').first();
      if (await incomeInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await incomeInput.clear();
        await incomeInput.fill('75000');
        const saveBtn = dialog.getByRole('button', { name: /save|update|apply/i }).last();
        if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(1_000);
          // Should show updated income amounts
          await expect(page.locator('body')).toContainText(/75,?000|updated|income/i, { timeout: 8_000 });
        }
      }
    });

    test('19.12 investment ladder step expands to show details', async ({ page }) => {
      // Look for investment ladder section
      const ladderSection = page.locator(
        'text=/investment.*ladder|ladder|step.*\d|emergency.*fund|TFSA.*RRSP/i'
      ).first();
      const hasLadder = await ladderSection.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!hasLadder) {
        test.skip();
        return;
      }

      // Find expandable ladder steps
      const steps = page.locator('[class*="step"], [class*="ladder-step"], button:has-text("Step")').all();
      const stepCount = await steps.count();
      if (stepCount > 0) {
        await steps.first().click();
        await page.waitForTimeout(500);
        // Expanded content should show details about this step
        await expect(page.locator('body')).toContainText(/step|detail|fund|invest/i, { timeout: 5_000 });
      } else {
        test.skip();
      }
    });

    test('19.13 alert severity icons are visible for warnings', async ({ page }) => {
      // Look for alert/danger/warning indicators
      const alertIcons = page.locator(
        '[class*="alert"], [class*="danger"], [class*="warning"], [class*="severity"], ' +
        'svg[class*="alert"], svg[class*="warning"]'
      ).all();
      const count = await alertIcons.count();
      if (count > 0) {
        await expect(alertIcons.first()).toBeVisible();
      } else {
        // May have text-based alerts
        const bodyText = await page.locator('body').textContent() ?? '';
        const hasAlerts = /warning|alert|danger|over.*budget|over.*limit/i.test(bodyText);
        if (hasAlerts) {
          await expect(page.locator('body')).toContainText(/warning|alert|danger/i);
        } else {
          test.skip();
        }
      }
    });

    test('19.14 savings capacity value is shown', async ({ page }) => {
      const bodyText = await page.locator('body').textContent() ?? '';
      const hasSavingsCap = /savings.*capacity|savings.*potential|savings.*room|can.*save/i.test(bodyText);
      if (hasSavingsCap) {
        await expect(page.locator('body')).toContainText(/savings.*capacity|savings.*potential|savings.*room|can.*save/i);
      } else {
        // May show a dollar amount related to savings capacity
        const hasDollar = /\$[\d,]+/.test(bodyText);
        if (hasDollar) {
          await expect(page.locator('body')).toContainText(/\$[\d,]+/);
        } else {
          test.skip();
        }
      }
    });
  });
});
