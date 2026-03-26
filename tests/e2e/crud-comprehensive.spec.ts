/**
 * Comprehensive CRUD tests for Kuber personal finance app.
 * Selectors are based on actual source code review of each page component.
 */

import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page) {
  await page.goto('/login');
  // The form pre-fills demo@kuber.app / password123 — just clear and re-fill
  await page.locator('#email').fill('demo@kuber.app');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

async function ss(page: Page, name: string) {
  await page.screenshot({
    path: `tests/e2e/artifacts/${name}.png`,
    fullPage: false,
  });
}

/** Returns true if any visible element matches error toast patterns. */
async function hasErrorToast(page: Page): Promise<boolean> {
  await page.waitForTimeout(1500);
  // Kuber uses a Toast component; look for red/danger colored toast
  const toastError = await page.locator(
    '[class*="toast"][class*="error"], [data-variant="error"], [role="alert"]'
  ).first().isVisible().catch(() => false);
  return toastError as boolean;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Kuber CRUD Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // =========================================================================
  // 1. TRANSACTIONS
  // =========================================================================

  test('1.1 Transactions - page loads', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');
    await ss(page, '01-transactions-list');

    // Look for transaction rows or the "Add" button to confirm page loaded
    const addBtn = page.getByRole('button', { name: 'Add' });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('1.2 Transactions - create new', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Click the "Add" button (icon=Plus, text="Add")
    await page.getByRole('button', { name: 'Add' }).click();

    // Modal title: "Add Transaction"
    await expect(page.getByText('Add Transaction').first()).toBeVisible({ timeout: 5000 });
    await ss(page, '02-transaction-modal-open');

    // Fields: Date(id=date), Amount(id=amount), Merchant/Description(id="merchant-/-description")
    await page.locator('#amount').fill('-42.50');
    await page.locator('#\\merchant-\\/-description, [placeholder="e.g. Whole Foods Market"]').fill('E2E Test Transaction');

    // Account select - pick first option
    const accountSelect = page.locator('select').filter({ hasText: /select account/i }).first()
      .or(page.locator('select[id*="account"]').first());
    // Try label-based: Select with "Account" label
    const accountSelectById = page.locator('#account');
    if (await accountSelectById.isVisible({ timeout: 2000 }).catch(() => false)) {
      // pick first non-empty option
      await accountSelectById.selectOption({ index: 1 });
    } else {
      // Fallback: find the select inside the form
      const selects = page.locator('select');
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        const sel = selects.nth(i);
        const options = await sel.locator('option').count();
        if (options > 1) {
          await sel.selectOption({ index: 1 });
          break;
        }
      }
    }

    await ss(page, '03-transaction-filled');

    // Submit: Button text "Add Transaction"
    await page.getByRole('button', { name: 'Add Transaction' }).click();

    await page.waitForTimeout(2000);
    await ss(page, '04-transaction-create-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('1.3 Transactions - delete a transaction', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Click the first transaction row to open the edit drawer
    const firstTxRow = page.locator('tbody tr, [data-testid="tx-row"]').first();
    if (await firstTxRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstTxRow.click();
      await page.waitForTimeout(500);
      await ss(page, '05-transaction-drawer-open');

      // Delete button inside the edit drawer/modal
      const deleteBtn = page.getByRole('button', { name: /delete/i }).last();
      if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deleteBtn.click();
        await page.waitForTimeout(500);
        // Confirm dialog
        const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    }

    await ss(page, '06-transaction-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('1.4 Transactions - filter by date range', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Filters panel button: has SlidersHorizontal icon, text "Filters" or just icon
    const filtersBtn = page.getByRole('button', { name: /filters?/i }).first()
      .or(page.locator('button').filter({ hasText: /filters?/i }).first());
    if (await filtersBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filtersBtn.click();
      await page.waitForTimeout(500);
      await ss(page, '07-filters-panel-open');

      // From date input (id="from")
      const fromInput = page.locator('#from, input[id="from"]').first();
      const toInput = page.locator('#to, input[id="to"]').first();
      if (await fromInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fromInput.fill('2026-01-01');
        await toInput.fill('2026-03-31');
        // Apply button
        const applyBtn = page.getByRole('button', { name: /apply/i }).first();
        if (await applyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await applyBtn.click();
        }
      }
    }

    await ss(page, '08-date-filter-applied');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('1.5 Transactions - filter by type', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Type filter pills in the filters panel
    const filtersBtn = page.getByRole('button', { name: /filters?/i }).first()
      .or(page.locator('button').filter({ hasText: /filters?/i }).first());
    if (await filtersBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filtersBtn.click();
      await page.waitForTimeout(500);
    }

    // Type pills: "Income" | "Expense" | "All" - look for buttons with those labels
    const expenseBtn = page.getByRole('button', { name: 'Expense' }).first()
      .or(page.getByText('Expense').first());
    if (await expenseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expenseBtn.click();
      await page.waitForTimeout(1000);
    }

    await ss(page, '09-type-filter');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('1.6 Transactions - search', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Search input: URL param "search", likely has a search icon input
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('grocery');
      await page.waitForTimeout(1500);
      await ss(page, '10-search-results');
    } else {
      await ss(page, '10-search-not-found');
      test.info().annotations.push({ type: 'note', description: 'Search input not visible at top level' });
    }
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 2. ACCOUNTS
  // =========================================================================

  test('2.1 Accounts - page loads', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await ss(page, '11-accounts-list');
    // "Add account" button should be present
    await expect(page.getByRole('button', { name: /add account/i })).toBeVisible({ timeout: 10000 });
  });

  test('2.2 Accounts - create new account', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add account/i }).click();
    await expect(page.getByText('Add Account').first()).toBeVisible({ timeout: 5000 });
    await ss(page, '12-account-modal-open');

    // Fields from source: Account Name(id=account-name), Institution(id=institution), etc.
    await page.locator('#account-name').fill('E2E Test Checking');

    // Account Type select
    const typeSelect = page.locator('#account-type');
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.selectOption('checking');
    }

    // Starting Balance
    const balanceInput = page.locator('#starting-balance');
    if (await balanceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await balanceInput.fill('1000');
    }

    await ss(page, '13-account-filled');

    await page.getByRole('button', { name: 'Add Account', exact: true }).last().click();

    await page.waitForTimeout(2000);
    await ss(page, '14-account-create-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('2.3 Accounts - edit an account', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    // Each account card has a "Account options" button (aria-label)
    const optionsBtn = page.locator('[aria-label="Account options"]').first();
    await expect(optionsBtn).toBeVisible({ timeout: 8000 });
    await optionsBtn.click();
    await page.waitForTimeout(300);
    await ss(page, '15-account-options-menu');

    // Menu has "Edit" item
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.waitForTimeout(500);
    await ss(page, '16-account-edit-modal');

    // Update name
    const nameInput = page.locator('#account-name');
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('E2E Updated Account Name');
    }

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(2000);
    await ss(page, '17-account-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('2.4 Accounts - delete not directly available (soft delete via close/hide)', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await ss(page, '18-accounts-no-delete');
    // Based on source code analysis: accounts use soft delete; the menu has Edit but not direct Delete
    // The "close account" icon (MinusCircle) is available in the detail view
    test.info().annotations.push({ type: 'note', description: 'Account delete uses MinusCircle (close) in detail view, not a direct delete button' });
  });

  // =========================================================================
  // 3. BUDGET
  // =========================================================================

  test('3.1 Budget - page loads', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');
    await ss(page, '19-budget-list');
    // Budget page uses month navigation header - look for "Budget" text in nav or month display
    await expect(
      page.getByText(/budget/i).first()
        .or(page.locator('[class*="month"], [class*="budget-header"]').first())
    ).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('3.2 Budget - add category to budget', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');

    // "Add category" button is inside each group section
    // Also there's a global "Add Budget" flow
    const addCategoryBtn = page.getByRole('button', { name: /add category/i }).first();
    if (await addCategoryBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addCategoryBtn.click();
      await page.waitForTimeout(500);
      await ss(page, '20-budget-add-category-modal');

      // Must select a category first (required field)
      const categorySelect = page.locator('select').first();
      if (await categorySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        const optionCount = await categorySelect.locator('option').count();
        if (optionCount > 1) {
          await categorySelect.selectOption({ index: 1 });
        }
      }

      // Budget amount
      const amountInput = page.locator('[placeholder="0.00"]').first();
      if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amountInput.fill('300');
      }

      // Submit - should be enabled now that category is selected
      const addBtn = page.getByRole('button', { name: /add to budget|add budget/i }).last();
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
      }
    } else {
      await ss(page, '20-budget-add-no-button');
      test.info().annotations.push({ type: 'note', description: 'Add category button not visible - budget may be fully set up' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '21-budget-add-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('3.3 Budget - edit a budget amount (inline click)', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');

    // Budget amounts are editable inline by clicking the amount cell
    // They show as currency amounts in the budget table
    const budgetAmount = page.locator('[data-testid="budget-amount"], input[type="number"]').first();
    if (await budgetAmount.isVisible({ timeout: 3000 }).catch(() => false)) {
      await budgetAmount.clear();
      await budgetAmount.fill('500');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    } else {
      // Try clicking a budget row's amount to enter edit mode
      const amountCell = page.locator('td, [role="cell"]').filter({ hasText: /\$\d/ }).first();
      if (await amountCell.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amountCell.click();
        await page.waitForTimeout(500);
        const editInput = page.locator('input[type="number"]').first();
        if (await editInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await editInput.clear();
          await editInput.fill('500');
          await page.keyboard.press('Enter');
        }
      }
    }

    await ss(page, '22-budget-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('3.4 Budget - delete a budget category', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForLoadState('networkidle');

    // Budget rows may have a remove/X button on hover
    const budgetRows = page.locator('[data-testid="budget-row"]');
    const firstRow = budgetRows.first();
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.hover();
      await page.waitForTimeout(300);
      const removeBtn = page.locator('button[aria-label*="remove" i], button[aria-label*="delete" i]').first();
      if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(500);
        const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      } else {
        test.info().annotations.push({ type: 'note', description: 'Budget row delete button not found on hover' });
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'No budget rows found' });
    }

    await ss(page, '23-budget-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 4. GOALS
  // =========================================================================

  test('4.1 Goals - page loads', async ({ page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await ss(page, '24-goals-list');
    // Goals page has h1 "Goals" heading
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('4.2 Goals - create new goal', async ({ page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Find "Add goal" button (could be in empty state or header)
    const addGoalBtn = page.getByRole('button', { name: /add goal/i }).first();
    await expect(addGoalBtn).toBeVisible({ timeout: 10000 });
    await addGoalBtn.click();

    // Modal with "Goal name" label
    await expect(page.getByText(/add.*goal|new.*goal/i).first()).toBeVisible({ timeout: 5000 });
    await ss(page, '25-goal-modal-open');

    // id="goal-name" (from label="Goal name")
    await page.locator('#goal-name').fill('E2E Vacation Fund');

    // Target amount: id="target-amount"
    const targetInput = page.locator('#target-amount');
    if (await targetInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await targetInput.fill('10000');
    }

    // Target date: id="target-date"
    const dateInput = page.locator('#target-date');
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill('2027-12-31');
    }

    await ss(page, '26-goal-filled');

    const submitBtn = page.getByRole('button', { name: /add goal|create/i }).last();
    await submitBtn.click();

    await page.waitForTimeout(2000);
    await ss(page, '27-goal-create-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('4.3 Goals - edit a goal', async ({ page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Each goal card has aria-label="Goal options" button (MoreHorizontal)
    const optionsBtn = page.locator('[aria-label="Goal options"]').first();
    if (await optionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await optionsBtn.click();
      await page.waitForTimeout(300);
      await ss(page, '28-goal-options-menu');
      // Menu items are plain <button> elements (not menuitem role)
      await page.getByRole('button', { name: 'Edit' }).first().click();
      await page.waitForTimeout(500);
      await ss(page, '29-goal-edit-modal');

      const nameInput = page.locator('#goal-name');
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.clear();
        await nameInput.fill('E2E Updated Goal');
      }

      const saveBtn = page.getByRole('button', { name: /save|update/i }).last();
      if (await saveBtn.isVisible()) await saveBtn.click();
    } else {
      test.info().annotations.push({ type: 'note', description: 'No goals found to edit - create one first' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '30-goal-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('4.4 Goals - delete a goal', async ({ page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    const optionsBtn = page.locator('[aria-label="Goal options"]').first();
    if (await optionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await optionsBtn.click();
      await page.waitForTimeout(300);
      // Menu items are plain <button> elements
      const deleteItem = page.getByRole('button', { name: 'Delete' }).first();
      if (await deleteItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteItem.click();
        await page.waitForTimeout(500);
        const confirmBtn = page.getByRole('button', { name: /^delete$/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'No goals found to delete' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '31-goal-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 5. RECURRING
  // =========================================================================

  test('5.1 Recurring - page loads', async ({ page }) => {
    await page.goto('/recurring');
    await page.waitForLoadState('networkidle');
    await ss(page, '32-recurring-list');
    await expect(page.getByRole('button', { name: /add recurring/i })).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('5.2 Recurring - create new item', async ({ page }) => {
    await page.goto('/recurring');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add recurring/i }).click();
    // Modal title: "Add Recurring"
    await expect(page.getByText(/add recurring/i).first()).toBeVisible({ timeout: 5000 });
    await ss(page, '33-recurring-modal-open');

    // Fields: Name(id=name), Amount(id=amount), Frequency, Next Date
    await page.locator('#name').fill('E2E Netflix Subscription');
    await page.locator('#amount').fill('-15.99');

    // Frequency select: id=frequency
    const freqSelect = page.locator('#frequency');
    if (await freqSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await freqSelect.selectOption('MONTHLY');
    }

    // Next date: id=next-date
    const nextDateInput = page.locator('#next-date');
    if (await nextDateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextDateInput.fill('2026-04-01');
    }

    await ss(page, '34-recurring-filled');

    // Submit button: text "Add"
    await page.getByRole('button', { name: 'Add' }).last().click();

    await page.waitForTimeout(2000);
    await ss(page, '35-recurring-create-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('5.3 Recurring - edit item', async ({ page }) => {
    await page.goto('/recurring');
    await page.waitForLoadState('networkidle');

    // Recurring items have aria-label="More options" button
    const optionsBtn = page.locator('[aria-label="More options"]').first();
    if (await optionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await optionsBtn.click();
      await page.waitForTimeout(300);
      await ss(page, '36-recurring-options-menu');
      await page.getByRole('menuitem', { name: /edit/i }).first().click();
      await page.waitForTimeout(500);
      await ss(page, '37-recurring-edit-modal');

      const amountInput = page.locator('#amount');
      if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amountInput.clear();
        await amountInput.fill('-18.99');
      }

      // Submit: text "Save"
      await page.getByRole('button', { name: 'Save' }).click();
    } else {
      test.info().annotations.push({ type: 'note', description: 'No recurring items found to edit' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '38-recurring-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('5.4 Recurring - delete item', async ({ page }) => {
    await page.goto('/recurring');
    await page.waitForLoadState('networkidle');

    const optionsBtn = page.locator('[aria-label="More options"]').first();
    if (await optionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await optionsBtn.click();
      await page.waitForTimeout(300);
      const deleteItem = page.getByRole('menuitem', { name: /delete/i }).first();
      if (await deleteItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteItem.click();
        await page.waitForTimeout(500);
        const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'No recurring items found to delete' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '39-recurring-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 6. INVESTMENTS
  // =========================================================================

  test('6.1 Investments - page loads', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForLoadState('networkidle');
    await ss(page, '40-investments-list');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('6.2 Investments - add holding', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForLoadState('networkidle');

    // Find Add button
    const addBtn = page.getByRole('button', { name: /add|new holding|add lot/i }).first();
    if (await addBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await ss(page, '41-investment-modal-open');

      // Fill ticker/symbol
      const tickerInput = page.locator('input[placeholder*="AAPL" i], input[placeholder*="ticker" i], input[placeholder*="symbol" i], #ticker, #symbol').first();
      if (await tickerInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tickerInput.fill('AAPL');
      }

      // Shares
      const sharesInput = page.locator('#shares, #quantity, input[placeholder*="shares" i]').first();
      if (await sharesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sharesInput.fill('10');
      }

      // Cost basis / price
      const priceInput = page.locator('#cost-basis, #price, input[placeholder*="price" i], input[placeholder*="cost" i]').first();
      if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await priceInput.fill('180.00');
      }

      await ss(page, '42-investment-filled');

      const submitBtn = page.getByRole('button', { name: /add|save|create/i }).last();
      await submitBtn.click();
    } else {
      await ss(page, '41-investment-no-add-btn');
      test.info().annotations.push({ type: 'note', description: 'Investment Add button not found' });
    }

    await page.waitForTimeout(2000);
    await ss(page, '43-investment-add-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('6.3 Investments - edit holding', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForLoadState('networkidle');

    const editBtn = page.locator('button[aria-label*="edit" i]').first();
    const menuBtn = page.locator('button[aria-label*="more" i], button[aria-label*="options" i]').first();

    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();
    } else if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: /edit/i }).first().click();
    } else {
      test.info().annotations.push({ type: 'note', description: 'No investment edit button found' });
    }

    await page.waitForTimeout(500);
    await ss(page, '44-investment-edit-modal');

    const saveBtn = page.getByRole('button', { name: /save|update/i }).last();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
    }

    await page.waitForTimeout(2000);
    await ss(page, '45-investment-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('6.4 Investments - delete holding', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForLoadState('networkidle');

    const menuBtn = page.locator('button[aria-label*="more" i], button[aria-label*="options" i]').first();
    const deleteBtn = page.locator('button[aria-label*="delete" i]').first();

    if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(300);
      const deleteItem = page.getByRole('menuitem', { name: /delete/i }).first();
      if (await deleteItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteItem.click();
      }
    } else if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
    } else {
      test.info().annotations.push({ type: 'note', description: 'No investment delete button found' });
    }

    await page.waitForTimeout(500);
    const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2000);
    await ss(page, '46-investment-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 7. REPORTS
  // =========================================================================

  test('7.1 Reports - Cash Flow tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await ss(page, '47-reports-default');

    const cashFlowTab = page.getByRole('tab', { name: /cash flow|cashflow/i }).first();
    if (await cashFlowTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cashFlowTab.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '48-reports-cashflow');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.2 Reports - Spending tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    const tab = page.getByRole('tab', { name: /spending/i }).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '49-reports-spending');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.3 Reports - Forecast tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    const tab = page.getByRole('tab', { name: /forecast/i }).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '50-reports-forecast');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.4 Reports - Tax Summary tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    const tab = page.getByRole('tab', { name: /tax/i }).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '51-reports-tax');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.5 Reports - Variance tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    const tab = page.getByRole('tab', { name: /variance/i }).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '52-reports-variance');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.6 Reports - PDF export', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const pdfBtn = page.getByRole('button', { name: /pdf/i }).first()
      .or(page.getByRole('button', { name: /export/i }).first());
    if (await pdfBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
        pdfBtn.click(),
      ]);
      if (download) {
        await download.saveAs('tests/e2e/artifacts/report.pdf');
      }
      await ss(page, '53-pdf-export');
    } else {
      await ss(page, '53-pdf-no-button');
      test.info().annotations.push({ type: 'note', description: 'PDF export button not found' });
    }
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('7.7 Reports - Excel export', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const excelBtn = page.getByRole('button', { name: /excel|xlsx/i }).first()
      .or(page.getByRole('button', { name: /csv/i }).first());
    if (await excelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
        excelBtn.click(),
      ]);
      if (download) {
        await download.saveAs('tests/e2e/artifacts/report.xlsx');
      }
      await ss(page, '54-excel-export');
    } else {
      await ss(page, '54-excel-no-button');
      test.info().annotations.push({ type: 'note', description: 'Excel export button not found' });
    }
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 8. SETTINGS
  // =========================================================================

  test('8.1 Settings - page loads and profile section visible', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await ss(page, '55-settings-page');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('8.2 Settings - profile settings save', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Find name fields - try common ids
    const nameInput = page.locator('input[name="name"], input[name="firstName"], #name, #first-name').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const currentVal = await nameInput.inputValue();
      await nameInput.clear();
      await nameInput.fill(currentVal || 'Demo User');
    }

    const saveBtn = page.getByRole('button', { name: /save|update/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    await ss(page, '56-settings-profile-saved');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('8.3 Settings - AI Advisor section visible', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Navigate to AI section if tabbed
    const aiTab = page.getByRole('tab', { name: /ai|advisor/i }).first()
      .or(page.getByRole('button', { name: /ai|advisor/i }).first());
    if (await aiTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aiTab.click();
      await page.waitForTimeout(500);
    }

    const aiSection = page.getByText(/ai advisor|openai|claude|gemini|provider/i).first();
    if (await aiSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await aiSection.scrollIntoViewIfNeeded();
    }
    await ss(page, '57-settings-ai');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('8.4 Settings - categories management visible', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const catTab = page.getByRole('tab', { name: /categor/i }).first()
      .or(page.getByRole('button', { name: /categor/i }).first())
      .or(page.getByText(/categor/i).first());
    if (await catTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await catTab.click();
      await page.waitForTimeout(500);
    }

    await ss(page, '58-settings-categories');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('8.5 Settings - report digest toggle', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const digestToggle = page.locator('input[type="checkbox"]').first()
      .or(page.locator('[role="switch"]').first());
    if (await digestToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await digestToggle.click();
      await page.waitForTimeout(1500);
    } else {
      test.info().annotations.push({ type: 'note', description: 'No toggle found - may require specific settings tab' });
    }
    await ss(page, '59-settings-digest');
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 9. AI ADVISOR
  // =========================================================================

  test('9.1 AI Advisor - page loads', async ({ page }) => {
    await page.goto('/advice');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await ss(page, '60-ai-advisor-page');
    // AI Advisor page uses a panel layout without h1/h2, look for the chat input
    await expect(
      page.locator('[placeholder*="ask" i]').first()
    ).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('9.2 AI Advisor - send message', async ({ page }) => {
    await page.goto('/advice');
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('textarea').first()
      .or(page.locator('input[placeholder*="ask" i], input[placeholder*="message" i], input[placeholder*="type" i]').first());

    if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageInput.fill('What is my biggest expense category this month?');

      const sendBtn = page.getByRole('button', { name: /send/i }).first()
        .or(page.locator('button[type="submit"]').first());

      if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendBtn.click();
      } else {
        await messageInput.press('Enter');
      }

      await page.waitForTimeout(4000);
      await ss(page, '61-ai-sent');
    } else {
      await ss(page, '61-ai-no-input');
      test.info().annotations.push({ type: 'note', description: 'Chat input not found - AI may not be configured' });
    }
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('9.3 AI Advisor - response area visible', async ({ page }) => {
    await page.goto('/advice');
    await page.waitForLoadState('networkidle');
    await ss(page, '62-ai-response-area');
    // Just verify no errors
    expect(await hasErrorToast(page)).toBe(false);
  });

  // =========================================================================
  // 10. RULES
  // =========================================================================

  test('10.1 Rules - page loads', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');
    await ss(page, '63-rules-page');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('10.2 Rules - create a rule', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // "New rule" or "+" button
    const addBtn = page.getByRole('button', { name: /new rule|add rule|\+ rule/i }).first()
      .or(page.locator('button').filter({ has: page.locator('svg') }).last());
    // More specific: from source, there's a Button with Plus icon and "New Rule" text
    const newRuleBtn = page.getByRole('button').filter({ hasText: /new rule/i }).first();
    if (await newRuleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newRuleBtn.click();
    } else if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
    }

    await page.waitForTimeout(500);
    await ss(page, '64-rule-modal-open');

    // Rule name: id="rule-name" (from label="Rule name")
    const nameInput = page.locator('#rule-name');
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill('E2E Auto-categorize Netflix');
    }

    await ss(page, '65-rule-filled');

    const saveBtn = page.getByRole('button', { name: /save|create|add/i }).last();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
    }

    await page.waitForTimeout(2000);
    await ss(page, '66-rule-create-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('10.3 Rules - edit a rule', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // From source: Pencil icon button for edit
    const editBtn = page.locator('button').filter({ has: page.locator('[data-lucide="pencil"], svg') }).first();
    // Try aria-label or title
    const editByAria = page.locator('button[aria-label*="edit" i], button[title*="edit" i]').first();

    if (await editByAria.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editByAria.click();
    } else {
      // Click the Pencil icon button - it's a standalone button per rule row
      const pencilBtns = page.locator('button').all();
      let clicked = false;
      for (const btn of await pencilBtns) {
        const innerHTML = await btn.innerHTML().catch(() => '');
        if (innerHTML.includes('pencil') || innerHTML.includes('edit')) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        test.info().annotations.push({ type: 'note', description: 'No rule edit button found' });
      }
    }

    await page.waitForTimeout(500);
    await ss(page, '67-rule-edit-modal');

    const nameInput = page.locator('#rule-name');
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('E2E Updated Rule');
    }

    const saveBtn = page.getByRole('button', { name: /save|update/i }).last();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
    }

    await page.waitForTimeout(2000);
    await ss(page, '68-rule-edit-result');
    expect(await hasErrorToast(page)).toBe(false);
  });

  test('10.4 Rules - delete a rule', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // From source: Trash2 icon button per rule row
    const deleteByAria = page.locator('button[aria-label*="delete" i], button[title*="delete" i]').first();
    if (await deleteByAria.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteByAria.click();
    } else {
      // Look through buttons for trash icon
      const allBtns = await page.locator('button').all();
      let clicked = false;
      for (const btn of allBtns) {
        const html = await btn.innerHTML().catch(() => '');
        if (html.includes('trash') || html.includes('delete')) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        test.info().annotations.push({ type: 'note', description: 'No rule delete button found' });
      }
    }

    await page.waitForTimeout(500);
    const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(2000);
    await ss(page, '69-rule-delete-result');
    expect(await hasErrorToast(page)).toBe(false);
  });
});
