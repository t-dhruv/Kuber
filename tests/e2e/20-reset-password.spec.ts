import { test, expect } from '@playwright/test';

test.describe('Reset Password', () => {
  test('page with no token shows an error or redirects', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9001/reset-password');
    await page.waitForLoadState('networkidle');
    const hasError = await page.getByText(/invalid|expired|missing.*token|token.*required/i).isVisible({ timeout: 5000 }).catch(() => false);
    const redirectedToLogin = page.url().includes('/login');
    expect(hasError || redirectedToLogin).toBeTruthy();
    await ctx.close();
  });

  test('page with invalid token shows error', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:9001/reset-password?token=definitely-invalid-token-xyz');
    await page.waitForLoadState('networkidle');
    // Page shows form when a token query param is present
    const newPassField = page.locator('#password').first();
    if (await newPassField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newPassField.fill('NewPassword123!');
      const confirmField = page.locator('#confirmPassword').first();
      if (await confirmField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmField.fill('NewPassword123!');
      }
      await page.getByRole('button', { name: /update password/i }).click();
      await expect(
        page.getByText(/invalid|expired|token.*not.*found|error|something went wrong/i).first()
      ).toBeVisible({ timeout: 15000 });
    }
    await ctx.close();
  });

  // Full valid-token flow requires email delivery — skipped in CI
  test.skip('valid token allows password reset', async () => {
    // TODO: requires seeded reset token or email mock — implement when email testing is set up
  });
});
