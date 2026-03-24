import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Authentication', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/login/);
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('demo@kuber.app');
    await page.locator('#password').fill('wrong-password-xyz');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The ErrorBox component renders the server's error message.
    // Acceptable messages: "Invalid credentials", "Sign in failed", etc.
    const errorEl = page.locator('[style*="color-danger"]').first();
    await expect(errorEl).toBeVisible({ timeout: 8_000 });
  });

  test('login with valid credentials succeeds', async ({ page }) => {
    await login(page);
    // After login the app lands on the root dashboard route.
    await expect(page).toHaveURL('/');
    // Ensure the authenticated shell is rendered (sidebar/header present).
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });
});
