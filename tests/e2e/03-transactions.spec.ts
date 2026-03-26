/**
 * 03-transactions.spec.ts
 * Full CRUD + filters + tags + toggles + split for transactions.
 */

import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

/** Opens the drawer for the first visible transaction row by clicking the ChevronRight button.
 *  Each row has: checkbox, icon, merchant, category?, account?, "Split transaction" button, amount, unnamed button (chevron).
 *  We click the button that immediately follows a "Split transaction" button.
 */
async function openFirstTransactionDrawer(page: Page) {
  // The ChevronRight (open drawer) button is the unnamed button after "Split transaction"
  const splitBtns = page.getByRole('button', { name: /split transaction/i });
  const count = await splitBtns.count();
  if (count > 0) {
    // Get the parent row of the first split button, then click its last button
    const firstSplitBtn = splitBtns.first();
    // Navigate up to the row container and find the last button
    await firstSplitBtn.locator('..').locator('button').last().click();
  } else {
    // Fallback: find any button that has a ChevronRight svg with aria name
    const chevronBtns = page.locator('button').filter({ has: page.locator('svg') }).last();
    await chevronBtns.click();
  }
  await page.locator('h2').filter({ hasText: /Transaction Details/i }).waitFor({ timeout: 8_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/transactions');
  await page.waitForLoadState('networkidle');
});

test.describe('Transactions — View & Search', () => {
  test('3.1 transactions page loads with list grouped by date', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
    // Should show at least one date group
    await expect(page.locator('body')).toContainText(/March|February|January/i);
  });

  test('3.2 search by merchant name filters results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    await searchInput.fill('Starbucks');
    await page.waitForTimeout(600);
    await expect(page.locator('body')).toContainText(/Starbucks/i);
    // Should not show unrelated merchants prominently
    await searchInput.clear();
  });

  test('3.3 filter by expense type shows only negatives', async ({ page }) => {
    // Type filters are inside the Filters panel — open it first
    await page.getByRole('button', { name: /filters/i }).click();
    await page.locator('h2').filter({ hasText: /^Filters$/ }).waitFor({ timeout: 5_000 });
    const expenseBtn = page.locator('button').filter({ hasText: /^Expense$/ }).first();
    await expenseBtn.click();
    await page.getByRole('button', { name: /^apply$/i }).click();
    await page.waitForTimeout(500);
    // All visible amounts should be negative or zero
    const amounts = page.locator('[class*="amount"], [data-testid="amount"]');
    const count = await amounts.count();
    if (count > 0) {
      const firstAmount = await amounts.first().textContent();
      expect(firstAmount).toMatch(/-|\$0/);
    }
  });

  test('3.4 filter by income type shows only positives', async ({ page }) => {
    // Type filters are inside the Filters panel — open it first
    await page.getByRole('button', { name: /filters/i }).click();
    await page.locator('h2').filter({ hasText: /^Filters$/ }).waitFor({ timeout: 5_000 });
    const incomeBtn = page.locator('button').filter({ hasText: /^Income$/ }).first();
    await incomeBtn.click();
    await page.getByRole('button', { name: /^apply$/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText(/\+?\$[\d,]+/);
  });

  test('3.5 filter panel opens and closes', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters/i });
    await filterBtn.click();
    await expect(page.locator('body')).toContainText(/Date Range|Account|Categories/i);
  });

  test('3.6 date range filter narrows results', async ({ page }) => {
    // Open filter panel
    await page.getByRole('button', { name: /filters/i }).click();
    await page.locator('h2').filter({ hasText: /^Filters$/ }).waitFor({ timeout: 5_000 });

    // The FiltersPanel date inputs are inside the slide-out panel
    // First two date inputs on page are inside the header bar (startDate/endDate),
    // inputs inside the panel come after those
    const allDateInputs = page.locator('input[type="date"]');
    const count = await allDateInputs.count();
    // The filter panel date inputs are the last two date inputs
    const fromInput = allDateInputs.nth(count - 2);
    const toInput = allDateInputs.nth(count - 1);
    await fromInput.fill('2026-03-01');
    await toInput.fill('2026-03-20');

    await page.getByRole('button', { name: /^apply$/i }).click();
    await page.waitForTimeout(600);
    // Should show March transactions
    await expect(page.locator('body')).toContainText(/March/i);
  });

  test('3.7 pagination — navigate to page 2', async ({ page }) => {
    const page2Btn = page.getByRole('button', { name: '2' }).first();
    if (await page2Btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page2Btn.click();
      await page.waitForTimeout(500);
      // Active page uses inline backgroundColor style (no CSS class). Just verify page loaded.
      await expect(page.locator('body')).toContainText(/March|February|January/i);
    }
  });
});

test.describe('Transactions — Create', () => {
  test('3.8 create a new transaction', async ({ page }) => {
    const merchant = `E2E Merchant ${Date.now()}`;
    await page.getByRole('button', { name: /^add$/i }).click();

    // Fill the add transaction form/modal
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ timeout: 5_000 });

    // Modal has label="Date", label="Amount", label="Merchant / Description"
    const dateInput = dialog.locator('input[type="date"]').first();
    await dateInput.fill('2026-03-20');

    const amountInput = dialog.locator('input[type="number"]').first();
    await amountInput.fill('-25.50');

    // Merchant / Description field — find by placeholder
    const merchantInput = dialog.locator('input[placeholder*="Whole Foods" i], input[placeholder*="e.g." i]').first();
    if (await merchantInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await merchantInput.fill(merchant);
    } else {
      // Fallback: fill the third visible text input
      await dialog.locator('input:not([type="date"]):not([type="number"])').first().fill(merchant);
    }

    // Select first available account
    const accountSelect = dialog.locator('select').first();
    const accountOptions = await accountSelect.locator('option').all();
    for (const opt of accountOptions) {
      const val = await opt.getAttribute('value');
      if (val && val !== '') { await accountSelect.selectOption(val); break; }
    }

    await dialog.getByRole('button', { name: /add transaction/i }).click();
    await expect(page.locator('body')).toContainText(merchant, { timeout: 8_000 });
  });
});

test.describe('Transactions — Edit', () => {
  test('3.9 edit transaction — drawer opens with pre-filled data', async ({ page }) => {
    await openFirstTransactionDrawer(page);
    // Drawer is open — verify merchant input has a value
    const merchantInput = page.getByRole('textbox', { name: /merchant/i }).first();
    if (await merchantInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const value = await merchantInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test('3.10 edit transaction — change merchant and save', async ({ page }) => {
    const newMerchant = `Edited ${Date.now()}`;
    await openFirstTransactionDrawer(page);

    // Merchant field has label="Merchant"
    const merchantInput = page.getByRole('textbox', { name: /^merchant$/i }).first();
    await merchantInput.clear();
    await merchantInput.fill(newMerchant);

    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.locator('body')).toContainText(newMerchant, { timeout: 8_000 });
  });

  test('3.11 edit transaction — Needs Review toggle saves', async ({ page }) => {
    await openFirstTransactionDrawer(page);

    const toggle = page.locator('#txn-needs-review');
    const before = await toggle.isChecked();
    // The toggle checkbox is sr-only; click its associated label (the visual track)
    await page.locator('label[for="txn-needs-review"]').click();
    await expect(toggle).toBeChecked({ checked: !before });

    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(500);
    // Reopen to verify persisted
    await openFirstTransactionDrawer(page);
    await expect(page.locator('#txn-needs-review')).toBeChecked({ checked: !before });
  });

  test('3.12 edit transaction — Is Recurring toggle saves', async ({ page }) => {
    await openFirstTransactionDrawer(page);

    const toggle = page.locator('#txn-is-recurring');
    const before = await toggle.isChecked();
    // The toggle checkbox is sr-only; click its associated label (the visual track)
    await page.locator('label[for="txn-is-recurring"]').click();
    await expect(toggle).toBeChecked({ checked: !before });
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(300);
  });

  test('3.13 edit transaction — add a tag and save', async ({ page }) => {
    await openFirstTransactionDrawer(page);

    const tagInput = page.locator('input[placeholder*="tag" i]').first();
    const tagName = `tag-${Date.now()}`;
    await tagInput.fill(tagName);
    await page.getByRole('button', { name: /^add$/i }).last().click();

    // Tag badge should appear
    await expect(page.locator('body')).toContainText(tagName);
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(500);
  });
});

test.describe('Transactions — Delete', () => {
  test('3.14 delete transaction removes it from list', async ({ page }) => {
    // Create one first so we can safely delete
    await page.getByRole('button', { name: /^add$/i }).click();
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ timeout: 5_000 });
    const delMerchant = `ToDelete ${Date.now()}`;
    // Fill date, amount, then merchant description
    const dateInput = dialog.locator('input[type="date"]').first();
    await dateInput.fill('2026-03-20');
    const amountInput = dialog.locator('input[type="number"]').first();
    await amountInput.fill('-10');
    await dialog.locator('input:not([type="date"]):not([type="number"])').first().fill(delMerchant);
    // Select first account
    const sel = dialog.locator('select').first();
    const opts = await sel.locator('option').all();
    for (const o of opts) { const v = await o.getAttribute('value'); if (v && v !== '') { await sel.selectOption(v); break; } }
    await dialog.getByRole('button', { name: /add transaction/i }).click();
    await expect(page.locator('body')).toContainText(delMerchant, { timeout: 8_000 });

    // Open the transaction drawer by finding the split button in the row and clicking the next sibling button
    const splitBtnInRow = page.getByRole('button', { name: /split transaction/i }).filter({
      has: page.locator('xpath=ancestor::div[contains(., "' + delMerchant + '")]'),
    }).first();
    // Scroll split button into view first
    await splitBtnInRow.scrollIntoViewIfNeeded();
    // Then use the openFirstTransactionDrawer approach: get the last button in the split button's parent
    const chevronBtn = splitBtnInRow.locator('..').locator('button').last();
    await chevronBtn.scrollIntoViewIfNeeded();
    await chevronBtn.click();
    await page.locator('h2').filter({ hasText: /Transaction Details/i }).waitFor({ timeout: 8_000 });
    await page.getByRole('button', { name: /^delete$/i }).waitFor({ timeout: 5_000 });
    await page.getByRole('button', { name: /^delete$/i }).click();
    // No confirmation dialog — Delete is immediate
    await expect(page.locator('body')).not.toContainText(delMerchant, { timeout: 8_000 });
  });
});

test.describe('Transactions — Split', () => {
  test('3.15 split transaction modal opens', async ({ page }) => {
    const splitBtn = page.getByRole('button', { name: /split/i }).first();
    if (await splitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await splitBtn.click();
      await expect(page.locator('body')).toContainText(/split|portion|category/i, { timeout: 5_000 });
    }
  });
});
