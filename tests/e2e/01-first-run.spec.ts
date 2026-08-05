import { test, expect } from './fixtures';
import { STORAGE_STATE_PATH, writeCredentials } from './credentials';

/**
 * The defect this guards: every fresh Instance used to lock its Owner out
 * permanently. Signup always issued a verification token and login refused
 * unverified Users, but with no email provider configured the message was never
 * sent — so the first User was told to check an inbox that would never receive
 * anything, and login returned 403 forever.
 *
 * This spec is the whole reason the suite runs against a fresh Compose stack.
 * It runs first, and it spends the Instance's one open signup: registration
 * closes as soon as a Household exists.
 */

// No storage state — this spec creates the session everything else reuses.
test.use({ storageState: { cookies: [], origins: [] } });

// Retrying would re-run the signup against an Instance that now has a
// Household, so the retry would fail for a reason unrelated to the defect. One
// attempt, one honest result.
test.describe.configure({ retries: 0, mode: 'serial' });

const password = 'E2E-Password123!';
const householdName = 'E2E Household';
const email = `owner+${Date.now()}@kuber.test`;

test.describe('First run', () => {
  test('the first User signs up and lands in the app, with no email provider @smoke', async ({
    page,
  }) => {
    await page.goto('/signup');

    await page.locator('#firstName').fill('Ada');
    await page.locator('#lastName').fill('Lovelace');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#confirmPassword').fill(password);
    await page.locator('#householdName').fill(householdName);

    await page.getByRole('button', { name: /sign up|create account/i }).click();

    // The precise regression. With no provider configured there is nothing to
    // verify and no inbox to point at, so this screen must not appear.
    await expect(
      page.getByRole('heading', { name: /check your email/i }),
      'Signup asked for email verification on an Instance with no email provider',
    ).toBeHidden();

    // Signed in means routed off /signup into the app.
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/dashboard|net worth|accounts/i).first()).toBeVisible({
      timeout: 15_000,
    });

    writeCredentials({ email, password, householdName });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  });

  test('registration closes once the Household exists', async ({ browser }) => {
    // The other half of the trade: signup is unconditional without this, so
    // skipping verification would leave an internet-exposed Instance open to
    // strangers. Default behaviour closes it after the first Household.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto('/signup');
    await page.locator('#firstName').fill('Second');
    await page.locator('#lastName').fill('Stranger');
    await page.locator('#email').fill(`stranger+${Date.now()}@kuber.test`);
    await page.locator('#password').fill(password);
    await page.locator('#confirmPassword').fill(password);
    await page.locator('#householdName').fill('Not Your Household');

    await page.getByRole('button', { name: /sign up|create account/i }).click();

    await expect(page.getByText(/registration is closed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/signup/);

    await context.close();
  });
});
