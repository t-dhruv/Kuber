import { chromium, FullConfig } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:9001';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e+default@kuber-e2e.test';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2E-Password123!';
const STATE_PATH = 'tests/e2e/.auth/user.json';

async function tryLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<boolean> {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function ensureUserExists(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto(`${BASE_URL}/signup`);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('User');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  const confirmPassword = page.locator('#confirmPassword');
  if (await confirmPassword.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await confirmPassword.fill(password);
  }
  const household = page.locator('#householdName');
  if (await household.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await household.fill('E2E Household');
  }

  await page.getByRole('button', { name: /sign up|create account/i }).click();
  await page.waitForTimeout(1_500);

  const bodyText = (await page.locator('body').textContent()) ?? '';
  if (/already|exists|taken|registered/i.test(bodyText)) return;

  await page
    .waitForURL((url) => !url.pathname.startsWith('/signup'), {
      timeout: 15_000,
    })
    .catch(() => {});
}

async function ensureSeedAccount(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/accounts`);
  await page.waitForLoadState('networkidle');

  const body = (await page.locator('body').textContent()) ?? '';
  // If at least one account already exists, nothing to do
  if (/checking|savings|credit|investment/i.test(body)) return;

  // Create a seed checking account via the UI
  const addBtn = page.getByRole('button', { name: /add account/i }).first();
  if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return;
  await addBtn.click();

  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5_000 });

  await dialog.getByRole('textbox', { name: /account name/i }).fill('E2E Checking');

  const typeSelect = dialog.getByRole('combobox', { name: /account type/i });
  if (await typeSelect.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await typeSelect.selectOption({ label: 'Checking' }).catch(() => {});
  }

  const balanceInput = dialog.getByRole('spinbutton', { name: /starting balance/i });
  if (await balanceInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await balanceInput.fill('5000');
  }

  await dialog.getByRole('button', { name: /add account/i }).click();
  // Wait for the account to appear
  await page.waitForTimeout(1_000);
}

export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let loggedIn = await tryLogin(page, TEST_EMAIL, TEST_PASSWORD);

  if (!loggedIn) {
    await ensureUserExists(page, TEST_EMAIL, TEST_PASSWORD);
    // If signup redirected us into the app we're done
    if (!new URL(page.url()).pathname.startsWith('/signup')) {
      loggedIn = true;
    } else {
      loggedIn = await tryLogin(page, TEST_EMAIL, TEST_PASSWORD);
    }
  }

  if (!loggedIn) {
    throw new Error(
      `[global-setup] Could not log in as ${TEST_EMAIL}. Is the app running at ${BASE_URL}?`,
    );
  }

  // Dismiss onboarding modal for all tests: set localStorage flag so the
  // "Welcome to Kuber!" wizard never appears during the test run.
  await page.evaluate(() => {
    localStorage.setItem('kuber-onboarding-done', '1');
  });

  // Ensure the e2e user has at least one seed account so tests that assert on
  // account data (balances, account options, grouped headers) don't fail on an
  // empty household.  We check first to avoid creating duplicates.
  await ensureSeedAccount(page);

  // Persist auth cookies + localStorage so each test skips the login flow.
  await context.storageState({ path: STATE_PATH });

  await browser.close();
}
