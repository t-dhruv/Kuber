import { Page } from '@playwright/test';

/**
 * Log in via the Kuber login page.
 *
 * The login form uses id="email" and id="password" inputs.
 * After successful login the app redirects to "/" (the dashboard root).
 */
export async function login(
  page: Page,
  email = 'demo@kuber.app',
  password = 'password123',
) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Dashboard is mounted at "/" — wait for the URL to leave /login
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 10_000,
  });
}
