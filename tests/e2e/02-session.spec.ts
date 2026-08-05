import { test, expect } from './fixtures';
import { readCredentials } from './credentials';

/**
 * The defect this guards: a Self-hoster on `http://192.168.1.50` logged in
 * successfully, then got bounced when the access token expired, with nothing in
 * any log explaining why. The refresh cookie set `Secure` whenever
 * `NODE_ENV=production`, and browsers discard `Secure` cookies over plain HTTP.
 *
 * The access token is deliberately never persisted — the auth store drops it on
 * rehydrate — so every page load has to re-mint one from the refresh cookie.
 * That makes a reload the real session-refresh path, not a proxy for it.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

// The CI stack runs over plain HTTP, as a LAN Instance does, so it sets
// COOKIE_SECURE=false. Override when pointing this suite at an HTTPS Instance.
const expectSecureCookie = /^(true|1|yes|on)$/i.test(process.env.E2E_COOKIE_SECURE ?? '');

test.describe('Session', () => {
  test('the Owner logs in @smoke', async ({ page }) => {
    const { email, password } = readCredentials();

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByText(/dashboard|net worth|accounts/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the refresh cookie carries Secure according to configuration', async ({ page }) => {
    const { email, password } = readCredentials();

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((cookie) => /refresh/i.test(cookie.name));

    // A Secure cookie over plain HTTP is not stored at all, so its mere
    // presence here is the LAN defect's absence.
    expect(refreshCookie, 'No refresh cookie was stored by the browser').toBeDefined();
    expect(refreshCookie!.httpOnly).toBe(true);
    expect(refreshCookie!.secure).toBe(expectSecureCookie);
  });

  test('the session survives a reload, which re-mints the access token @smoke', async ({
    page,
  }) => {
    const { email, password } = readCredentials();

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    // The store keeps no access token across a reload, so staying signed in
    // here means the refresh cookie made a round trip and was accepted.
    await page.reload();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByText(/dashboard|net worth|accounts/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
