import { Page } from '@playwright/test';

/**
 * Log in via the Kuber login page.
 *
 * The login form uses id="email" and id="password" inputs.
 * After successful login the app redirects to "/" (the dashboard root).
 */
export const TEST_USER_EMAIL =
  process.env.E2E_TEST_EMAIL ?? 'e2e+default@kuber-e2e.test';
export const TEST_USER_PASSWORD =
  process.env.E2E_TEST_PASSWORD ?? 'E2E-Password123!';

async function tryLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 8_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function ensureUserExists(page: Page, email: string, password: string) {
  await page.goto('/signup');

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
  await page.waitForTimeout(1_000);

  const bodyText = (await page.locator('body').textContent()) ?? '';
  if (/already|exists|taken|registered/i.test(bodyText)) {
    return;
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), {
    timeout: 12_000,
  });
}

export async function login(
  page: Page,
  email = TEST_USER_EMAIL,
  password = TEST_USER_PASSWORD,
) {
  // When running with storageState (global-setup), the auth session is already
  // loaded into the browser context.  The app's React Router will redirect
  // authenticated users away from /login — wait briefly for that to happen.
  await page.goto('/login');
  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 4_000 })
    .catch(() => {});
  if (!new URL(page.url()).pathname.startsWith('/login')) {
    // Already authenticated via storageState — nothing more to do.
    return;
  }

  const loggedIn = await tryLogin(page, email, password);
  if (loggedIn) return;

  await ensureUserExists(page, email, password);

  // If signup redirected to authenticated area we're done; otherwise retry login
  if (!new URL(page.url()).pathname.startsWith('/signup')) {
    return;
  }

  const loggedInAfterSignup = await tryLogin(page, email, password);
  if (!loggedInAfterSignup) {
    throw new Error('E2E login failed even after signup fallback');
  }
}
