import { Page, expect } from '@playwright/test';
import { readCredentials } from './credentials';

/**
 * The key the onboarding wizard writes when the Owner dismisses it.
 * See client/src/components/onboarding/OnboardingWizard.tsx.
 */
const ONBOARDING_DISMISSED_KEY = 'kuber-onboarding-done';

/**
 * Sign the suite's one Owner in, in this page's own browser context.
 *
 * Specs cannot share a saved storage state: `POST /auth/refresh` rotates the
 * refresh token and deletes the old one, so the cookie a saved state holds is
 * spent by the first context that loads it. Every later context — the next
 * spec, and every retry — would present a token the server has already deleted
 * and get bounced to /login. Logging in per test mints a fresh token instead.
 */
export async function signIn(page: Page) {
  const { email, password } = readCredentials();

  await suppressOnboarding(page);

  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/**
 * Mark onboarding as already dismissed, before any app code runs.
 *
 * An Owner with no Accounts gets the onboarding wizard, whose full-screen
 * overlay swallows clicks on the page behind it. The wizard mounts only once
 * the accounts query resolves, so dismissing it through the UI is a race;
 * setting the same key it sets on "Skip setup" is not. The wizard itself is
 * the first-run spec's business, not the Account and Transaction specs'.
 */
export async function suppressOnboarding(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '1');
  }, ONBOARDING_DISMISSED_KEY);
}

/**
 * Wait for a Sonner toast notification matching the given pattern.
 * Sonner renders toasts with [data-sonner-toast] attribute.
 */
export async function waitForToast(page: Page, pattern: RegExp, timeout = 10_000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: pattern });
  await expect(toast.first()).toBeVisible({ timeout });
}
