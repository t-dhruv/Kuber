import { test, expect } from './fixtures';
import { signIn, waitForToast } from './helpers';
import { ACCOUNT_NAME } from './constants';

/**
 * "Create their Household, add an Account, and record a Transaction" is the
 * definition of done for 1.0. This is the second of those three, and it runs
 * against the same Instance the first-run spec claimed.
 */

// Each test signs in for itself; see signIn for why a shared session cannot be
// carried on disk.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

test.describe('Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('the Owner adds an Account @smoke', async ({ page }) => {
    await page.goto('/accounts');

    await page.getByRole('button', { name: /add account/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByLabel('Account Name').fill(ACCOUNT_NAME);
    await dialog.getByLabel('Account Type').selectOption('checking');
    await dialog.getByLabel('Starting Balance').fill('5000');
    await dialog.getByRole('button', { name: /add account/i }).click();

    await waitForToast(page, /account added/i);
    await expect(page.getByText(ACCOUNT_NAME).first()).toBeVisible({ timeout: 10_000 });
  });

  test('the Account survives a reload', async ({ page }) => {
    // Proves the Account was persisted, not just rendered optimistically.
    await page.goto('/accounts');
    await expect(page.getByText(ACCOUNT_NAME).first()).toBeVisible({ timeout: 15_000 });
  });
});
