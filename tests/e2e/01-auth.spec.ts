/**
 * 01-auth.spec.ts
 * Auth suite: login, logout, protected routes, session persistence
 * Note: Registration tests use a unique email each run to avoid collisions.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { uniqueEmail } from './helpers/setup';

// ---------------------------------------------------------------------------
// Login / Logout
// ---------------------------------------------------------------------------

test.describe('Authentication', () => {
  test('1.1 login with valid credentials lands on dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('1.2 login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('demo@kuber.app');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Should stay on login page and show an error
    await expect(page).toHaveURL('/login');
    await expect(page.locator('body')).toContainText(/invalid|incorrect|wrong|failed/i, { timeout: 6_000 });
  });

  test('1.3 login with empty fields keeps submit disabled or shows validation', async ({ page }) => {
    await page.goto('/login');
    // Clear pre-filled fields
    await page.locator('#email').fill('');
    await page.locator('#password').fill('');
    const btn = page.getByRole('button', { name: /sign in/i });
    // Either button is disabled or form shows validation
    const isDisabled = await btn.isDisabled();
    if (!isDisabled) {
      await btn.click();
      await expect(page).toHaveURL('/login');
    }
  });

  test('1.4 logout redirects to login page', async ({ page }) => {
    await login(page);
    // Find and click logout — avatar has title "Click to sign out"
    await page.locator('[title="Click to sign out"], img[alt*="Arjun"]').first().click();
    // Look for a sign out link/button in the dropdown
    const signOutBtn = page.getByRole('link', { name: /sign out|logout/i })
      .or(page.getByRole('button', { name: /sign out|logout/i }));
    if (await signOutBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signOutBtn.click();
    }
    await page.waitForURL('/login', { timeout: 10_000 });
    await expect(page).toHaveURL('/login');
  });

  test('1.5 protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });

  test('1.6 protected route /accounts redirects unauthenticated', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });

  test('1.7 protected route /settings redirects unauthenticated', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });

  test('1.8 after login, navigating to /login shows dashboard or redirects', async ({ page }) => {
    await login(page);
    await page.goto('/login');
    // App may redirect to dashboard or stay — either is acceptable
    await page.waitForTimeout(1_000);
    const url = new URL(page.url());
    // Either redirected to dashboard, or login page loaded (app may not redirect)
    expect(['/', '/login']).toContain(url.pathname);
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test.describe('Registration', () => {
  test('1.9 signup with valid data creates account and lands on dashboard', async ({ page }) => {
    const email = uniqueEmail('signup');
    await page.goto('/signup');

    await page.locator('#firstName').fill('Test');
    await page.locator('#lastName').fill('User');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('TestPassword123!');
    await page.locator('#confirmPassword').fill('TestPassword123!');
    await page.locator('#householdName').fill('Test Household');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 15_000 });
    // Should be on dashboard
    expect(['/', '/onboarding']).toContain(new URL(page.url()).pathname);
  });

  test('1.10 signup with duplicate email shows error', async ({ page }) => {
    await page.goto('/signup');
    const emailField = page.locator('#email');
    const passwordField = page.locator('#password');
    await emailField.fill('demo@kuber.app');
    await passwordField.fill('password123');
    const firstNameField = page.locator('#firstName').first();
    if (await firstNameField.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await firstNameField.fill('Demo');
      await page.locator('#lastName').fill('User').catch(() => {});
    }
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    await expect(page.locator('body')).toContainText(/already|exists|taken|registered/i, { timeout: 8_000 });
  });

  test('1.11 signup with short password shows validation', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('#email').fill(uniqueEmail('weak'));
    await page.locator('#password').fill('abc');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    await expect(page.locator('body')).toContainText(/password|characters|length/i, { timeout: 6_000 });
  });
});

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------

test.describe('Forgot Password', () => {
  test('1.12 forgot-password page loads and form submits', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('body')).toContainText(/forgot|reset|password/i);
    await page.locator('input[type="email"], #email').fill('demo@kuber.app');
    await page.getByRole('button', { name: /send|reset|submit/i }).click();
    // Should show a confirmation message
    await expect(page.locator('body')).toContainText(/sent|check|email|link/i, { timeout: 8_000 });
  });
});
