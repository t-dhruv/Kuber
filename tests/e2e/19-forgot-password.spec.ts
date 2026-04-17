import { test, expect } from '@playwright/test';

test.describe('Forgot Password', () => {
  test('authenticated user is redirected away from /forgot-password', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/forgot-password');
  });

  test('page loads when not authenticated', async ({ browser }) => {
    // Pass storageState: undefined to override the project default (authenticated user)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9001/forgot-password');
    // Page has h1 "Kuber" and button "Send reset link"
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible({ timeout: 10000 });
    await ctx.close();
  });

  test('submitting unknown email shows success message without leaking account existence', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9001/forgot-password');
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible({ timeout: 10000 });
    await page.locator('#email').fill('nonexistent-user-xyz@nowhere.test');
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(
      page.getByText(/check your email|link sent|if.*account.*exists|sent.*reset/i)
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not found|no account|doesn't exist/i)).not.toBeVisible();
    await ctx.close();
  });

  test('Back to sign in link navigates to login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9001/forgot-password');
    await expect(page.getByRole('link', { name: /back to sign in/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: /back to sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await ctx.close();
  });
});
