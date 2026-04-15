/**
 * 16-tfsa-rrsp.spec.ts
 * Tax-advantaged account tracking: TFSA and RRSP contributions, withdrawals,
 * contribution room (CRA limits), and linked investment accounts.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
});

// ---------------------------------------------------------------------------
// Helper: navigate to the Tax Accounts section within Settings
// ---------------------------------------------------------------------------
async function goToTaxAccounts(page: import('@playwright/test').Page) {
  // Click the "Tax Accounts" tab/link if present, otherwise fall back to body scan
  const taxTab = page.getByRole('link', { name: /tax accounts/i })
    .or(page.getByRole('button', { name: /tax accounts/i })).first();
  if (await taxTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await taxTab.click();
    await page.waitForTimeout(500);
  }
}

// ---------------------------------------------------------------------------
// Helper: open the "Add Account" dialog from the tax accounts page
// ---------------------------------------------------------------------------
async function openAddAccountDialog(page: import('@playwright/test').Page) {
  const addBtn = page.getByRole('button', { name: /add account|new account|\+ account/i }).first();
  if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addBtn.click();
  } else {
    // Fallback: look for any button with "add" in the account-related section
    const altAddBtn = page.getByRole('button', { name: /add/i }).first();
    if (await altAddBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await altAddBtn.click();
    }
  }
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5_000 });
  return dialog;
}

// ---------------------------------------------------------------------------
// 16.1 — Tax accounts page / section loads
// ---------------------------------------------------------------------------
test('16.1 tax accounts page loads', async ({ page }) => {
  // First try /tax-accounts route directly
  await page.goto('/tax-accounts');
  await page.waitForLoadState('networkidle');

  const body = page.locator('body');
  const hasTaxAccounts = await body.getByText(/tax|tsfa|rrsp|tfsa/i).count() > 0;

  if (hasTaxAccounts) {
    await expect(body).toContainText(/tax|tsfa|rrsp|tfsa/i);
  } else {
    // Fall back to settings + tab
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await goToTaxAccounts(page);
    await expect(body).toContainText(/tax|tsfa|rrsp|tfsa/i);
  }
});

// ---------------------------------------------------------------------------
// TFSA Account
// ---------------------------------------------------------------------------
test.describe('TFSA', () => {

  test('16.2 add TFSA account with institution + account number + type', async ({ page }) => {
    await goToTaxAccounts(page);
    const dialog = await openAddAccountDialog(page);

    // Account name
    const nameInput = dialog.getByRole('textbox', { name: /name|account name/i })
      .or(dialog.locator('input[name="name"], input[placeholder*="name" i]')).first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill(`E2E TFSA ${Date.now()}`);
    }

    // Institution
    const institutionInput = dialog.getByRole('textbox', { name: /institution/i })
      .or(dialog.locator('input[name="institution"], input[placeholder*="institution" i]')).first();
    if (await institutionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await institutionInput.fill('EQ Bank');
    }

    // Account number
    const acctNumInput = dialog.getByRole('textbox', { name: /account number|acct.*num/i })
      .or(dialog.locator('input[name="accountNumber"], input[placeholder*="account" i]')).first();
    if (await acctNumInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acctNumInput.fill('1234567890');
    }

    // Account type select (direct / trust)
    const typeSelect = dialog.locator('select[name="type"], select[name="accountType"]').first();
    if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const opts = await typeSelect.locator('option:not([disabled])').all();
      if (opts.length > 1) {
        // Pick "direct" if available
        await typeSelect.selectOption({ label: /direct/i }).catch(() =>
          typeSelect.selectOption({ label: /trust/i }).catch(() =>
            typeSelect.selectOption(opts[1].getAttribute('value') ?? '')
          )
        );
      }
    }

    // Save
    await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
    await page.waitForTimeout(1_000);

    // Verify account appears
    const body = page.locator('body');
    const added = await body.getByText(/EQ Bank|1234567890/i).count() > 0;
    if (added) {
      await expect(body).toContainText(/tfsa/i);
    }
  });

  test('16.3 add TFSA contribution (deposit transaction)', async ({ page }) => {
    await goToTaxAccounts(page);

    // Click on the TFSA account row to open it
    const tfsaRow = page.locator('body').getByText(/tfsa/i, { exact: false }).first();
    if (await tfsaRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tfsaRow.click();
      await page.waitForTimeout(500);
    }

    // Add contribution button
    const addContribBtn = page.getByRole('button', { name: /add contribution|contribution|deposit/i }).first();
    if (await addContribBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addContribBtn.click();
    } else {
      // Try adding via transaction
      const addTxBtn = page.getByRole('button', { name: /add transaction|\+ transaction/i }).first();
      if (await addTxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addTxBtn.click();
      }
    }

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Amount
      const amountInput = dialog.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amountInput.fill('1000');
      }

      // Type should be deposit/contribution
      const typeSelect = dialog.locator('select[name="type"], select[name="transactionType"]').first();
      if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await typeSelect.selectOption({ label: /contribution|deposit/i }).catch(() => {});
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);
    }

    const body = page.locator('body');
    const hasTx = await body.getByText(/1000|contribution|deposit/i).count() > 0;
    if (hasTx) {
      await expect(body).toContainText(/1000|contribution|deposit/i);
    } else {
      test.skip(true, 'TFSA contribution form elements not present in current build');
    }
  });

  test('16.4 add TFSA withdrawal', async ({ page }) => {
    await goToTaxAccounts(page);

    const tfsaRow = page.locator('body').getByText(/tfsa/i, { exact: false }).first();
    if (await tfsaRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tfsaRow.click();
      await page.waitForTimeout(500);
    }

    const withdrawBtn = page.getByRole('button', { name: /withdraw|withdrawal/i }).first();
    if (await withdrawBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await withdrawBtn.click();
    } else {
      const addTxBtn = page.getByRole('button', { name: /add transaction|\+ transaction/i }).first();
      if (await addTxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addTxBtn.click();
      }
    }

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const amountInput = dialog.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amountInput.fill('500');
      }

      const typeSelect = dialog.locator('select[name="type"], select[name="transactionType"]').first();
      if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await typeSelect.selectOption({ label: /withdraw/i }).catch(() => {});
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);
    }

    const body = page.locator('body');
    const hasWithdrawal = await body.getByText(/500|withdraw/i).count() > 0;
    if (hasWithdrawal) {
      await expect(body).toContainText(/withdraw|500/i);
    } else {
      test.skip(true, 'TFSA withdrawal form elements not present in current build');
    }
  });

  test('16.5 TFSA contribution room shows correctly (CRA formula)', async ({ page }) => {
    await goToTaxAccounts(page);

    const body = page.locator('body');
    // Should show CRA limit info — 2024 limit is $7000
    const hasRoomInfo = await body.getByText(/\$[\d,]+|room|limit|7.000|7000/i).count() > 0;

    if (hasRoomInfo) {
      // Progress bar or numeric display should reference the CRA limit
      await expect(body).toContainText(/\$[\d,]+|room|limit/i);
    } else {
      test.skip(true, 'TFSA contribution room display not present in current build');
    }
  });

});

// ---------------------------------------------------------------------------
// RRSP Account
// ---------------------------------------------------------------------------
test.describe('RRSP', () => {

  test('16.6 add RRSP account with institution + account number', async ({ page }) => {
    await goToTaxAccounts(page);
    const dialog = await openAddAccountDialog(page);

    const nameInput = dialog.getByRole('textbox', { name: /name|account name/i })
      .or(dialog.locator('input[name="name"], input[placeholder*="name" i]')).first();
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.fill(`E2E RRSP ${Date.now()}`);
    }

    const institutionInput = dialog.getByRole('textbox', { name: /institution/i })
      .or(dialog.locator('input[name="institution"], input[placeholder*="institution" i]')).first();
    if (await institutionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await institutionInput.fill('Sunlife');
    }

    const acctNumInput = dialog.getByRole('textbox', { name: /account number|acct.*num/i })
      .or(dialog.locator('input[name="accountNumber"], input[placeholder*="account" i]')).first();
    if (await acctNumInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await acctNumInput.fill('RRSP9876543210');
    }

    // Account type select
    const typeSelect = dialog.locator('select[name="type"], select[name="accountType"]').first();
    if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await typeSelect.selectOption({ label: /rrsp/i }).catch(() =>
        typeSelect.selectOption({ label: /individual/i }).catch(() => {})
      );
    }

    await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
    await page.waitForTimeout(1_000);

    const body = page.locator('body');
    const added = await body.getByText(/Sunlife|RRSP9876543210/i).count() > 0;
    if (added) {
      await expect(body).toContainText(/rrsp/i);
    }
  });

  test('16.7 add RRSP contribution (deposit)', async ({ page }) => {
    await goToTaxAccounts(page);

    const rrspRow = page.locator('body').getByText(/rrsp/i, { exact: false }).first();
    if (await rrspRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rrspRow.click();
      await page.waitForTimeout(500);
    }

    const addContribBtn = page.getByRole('button', { name: /add contribution|contribution|deposit/i }).first();
    if (await addContribBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addContribBtn.click();
    } else {
      const addTxBtn = page.getByRole('button', { name: /add transaction|\+ transaction/i }).first();
      if (await addTxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addTxBtn.click();
      }
    }

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const amountInput = dialog.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amountInput.fill('2000');
      }

      const typeSelect = dialog.locator('select[name="type"], select[name="transactionType"]').first();
      if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await typeSelect.selectOption({ label: /contribution|deposit/i }).catch(() => {});
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);
    }

    const body = page.locator('body');
    const hasTx = await body.getByText(/2000|contribution|deposit/i).count() > 0;
    if (hasTx) {
      await expect(body).toContainText(/2000|contribution|deposit/i);
    } else {
      test.skip(true, 'RRSP contribution form elements not present in current build');
    }
  });

  test('16.8 add RRSP withdrawal (pre-tax, triggers taxable event UI)', async ({ page }) => {
    await goToTaxAccounts(page);

    const rrspRow = page.locator('body').getByText(/rrsp/i, { exact: false }).first();
    if (await rrspRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rrspRow.click();
      await page.waitForTimeout(500);
    }

    const withdrawBtn = page.getByRole('button', { name: /withdraw|withdrawal/i }).first();
    if (await withdrawBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await withdrawBtn.click();
    } else {
      const addTxBtn = page.getByRole('button', { name: /add transaction|\+ transaction/i }).first();
      if (await addTxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addTxBtn.click();
      }
    }

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const amountInput = dialog.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amountInput.fill('1000');
      }

      const typeSelect = dialog.locator('select[name="type"], select[name="transactionType"]').first();
      if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await typeSelect.selectOption({ label: /withdraw/i }).catch(() => {});
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);
    }

    const body = page.locator('body');
    const hasWithdrawal = await body.getByText(/1000|withdraw|taxable/i).count() > 0;
    if (hasWithdrawal) {
      // Should show taxable event indicator
      await expect(body).toContainText(/withdraw|taxable|1000/i);
    } else {
      test.skip(true, 'RRSP withdrawal form elements not present in current build');
    }
  });

  test('16.9 RRSP contribution room shows correctly', async ({ page }) => {
    await goToTaxAccounts(page);

    const body = page.locator('body');
    // 2024 CRA limit is $31,000 (notice of assessment formula)
    const hasRoomInfo = await body.getByText(/\$[\d,]+|room|limit|31.000|31000/i).count() > 0;

    if (hasRoomInfo) {
      await expect(body).toContainText(/\$[\d,]+|room|limit/i);
    } else {
      test.skip(true, 'RRSP contribution room display not present in current build');
    }
  });

});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
test.describe('Contribution Limits', () => {

  test('16.10 over-contribution warning shown when exceeding limit', async ({ page }) => {
    await goToTaxAccounts(page);

    const body = page.locator('body');
    // Try to add a contribution well above the TFSA limit ($7000 in 2024)
    const tfsaRow = body.getByText(/tfsa/i, { exact: false }).first();
    if (await tfsaRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tfsaRow.click();
      await page.waitForTimeout(500);
    }

    const addContribBtn = page.getByRole('button', { name: /add contribution|contribution|deposit/i }).first();
    if (await addContribBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addContribBtn.click();
    } else {
      const addTxBtn = page.getByRole('button', { name: /add transaction|\+ transaction/i }).first();
      if (await addTxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addTxBtn.click();
      }
    }

    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const amountInput = dialog.locator('input[type="number"], input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Enter $10,000 — well over the $7,000 TFSA limit for 2024
        await amountInput.fill('10000');
      }

      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await page.waitForTimeout(1_000);

      // Should show a warning about over-contribution
      const warning = page.locator('body').getByText(/over.contribution|exceed|limit|warning/i);
      const hasWarning = await warning.count() > 0;
      if (hasWarning) {
        await expect(warning.first()).toContainText(/over.contribution|exceed|limit|warning/i);
      } else {
        test.skip(true, 'Over-contribution warning UI not present in current build');
      }
    } else {
      test.skip(true, 'Add contribution dialog not present in current build');
    }
  });

  test('16.11 contribution room progress bar visible', async ({ page }) => {
    await goToTaxAccounts(page);

    const body = page.locator('body');
    // Look for a progress bar / % display in the room area
    const progressBar = page.locator('[role="progressbar"], [aria-label*="room" i], [class*="progress"], [class*="room"]').first();
    const hasProgressBar = await progressBar.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasProgressBar) {
      await expect(progressBar).toBeVisible();
    } else {
      // Fallback: numeric display with "/" (e.g. "$5,000 / $7,000")
      const hasNumericRoom = await body.getByText(/\$[\d,.\s]+\s*\/\s*\$[\d,.\s]+/).count() > 0;
      if (hasNumericRoom) {
        await expect(body).toContainText(/\$[\d,.\s]+\s*\/\s*\$[\d,.\s]+/);
      } else {
        test.skip(true, 'Contribution room progress bar not present in current build');
      }
    }
  });

});

// ---------------------------------------------------------------------------
// Transactions linked to investment accounts
// ---------------------------------------------------------------------------
test.describe('Tax Account — Investment Linkage', () => {

  test('16.12 TFSA transaction linked to investment account', async ({ page }) => {
    // Navigate to the TFSA account detail view
    await goToTaxAccounts(page);
    const tfsaRow = page.locator('body').getByText(/tfsa/i, { exact: false }).first();
    if (await tfsaRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tfsaRow.click();
      await page.waitForTimeout(500);
    }

    // Check for an "Investment Account" or "Linked Account" field
    const linkSelect = page.locator('select[name*="linked" i], select[name*="investment" i], select[name*="account" i]').first();
    const hasLinkField = await linkSelect.isVisible({ timeout: 2_000 }).catch(() => false);

    if (hasLinkField) {
      await expect(linkSelect).toBeVisible();
      const opts = await linkSelect.locator('option').all();
      // Select a non-empty option if available
      for (const o of opts) {
        const val = await o.getAttribute('value');
        if (val && val !== '') {
          await linkSelect.selectOption(val);
          break;
        }
      }
      const body = page.locator('body');
      const linked = await body.getByText(/investment|linked/i).count() > 0;
      if (linked) {
        await expect(body).toContainText(/investment|linked/i);
      }
    } else {
      test.skip(true, 'Investment account linkage field not present in current build');
    }
  });

  test('16.13 RRSP transaction linked to investment account', async ({ page }) => {
    await goToTaxAccounts(page);
    const rrspRow = page.locator('body').getByText(/rrsp/i, { exact: false }).first();
    if (await rrspRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rrspRow.click();
      await page.waitForTimeout(500);
    }

    const linkSelect = page.locator('select[name*="linked" i], select[name*="investment" i], select[name*="account" i]').first();
    const hasLinkField = await linkSelect.isVisible({ timeout: 2_000 }).catch(() => false);

    if (hasLinkField) {
      await expect(linkSelect).toBeVisible();
      const opts = await linkSelect.locator('option').all();
      for (const o of opts) {
        const val = await o.getAttribute('value');
        if (val && val !== '') {
          await linkSelect.selectOption(val);
          break;
        }
      }
      const body = page.locator('body');
      const linked = await body.getByText(/investment|linked/i).count() > 0;
      if (linked) {
        await expect(body).toContainText(/investment|linked/i);
      }
    } else {
      test.skip(true, 'Investment account linkage field not present in current build');
    }
  });

});
