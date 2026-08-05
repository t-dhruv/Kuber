import { test, expect } from './fixtures';
import { signIn, waitForToast } from './helpers';
import { ACCOUNT_NAME, MERCHANT } from './constants';

/**
 * The last step of the definition of done: a stranger who installed Kuber from
 * the published images can record a Transaction. Everything upstream of this —
 * the images, the three-service stack, the migrations, the first-run signup,
 * the session — has to have worked for this to pass.
 */

// Each test signs in for itself; see signIn for why a shared session cannot be
// carried on disk.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

test.describe('Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('the Owner records a Transaction against the Account @smoke', async ({ page }) => {
    await page.goto('/transactions');

    await page.getByRole('button', { name: /add transaction/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByLabel('Amount').fill('42.50');
    await dialog.getByLabel('Merchant / Description').fill(MERCHANT);
    // Exact, so this cannot match "From Account" or "To Account" if the form
    // ever renders the transfer variant.
    await dialog.getByLabel('Account', { exact: true }).selectOption({ label: ACCOUNT_NAME });

    await dialog.getByRole('button', { name: /add expense/i }).click();

    await waitForToast(page, /added|created|success/i);
    await expect(page.getByText(MERCHANT).first()).toBeVisible({ timeout: 10_000 });
  });

  test('the Transaction survives a reload', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByText(MERCHANT).first()).toBeVisible({ timeout: 15_000 });
  });
});
