import { Page, expect } from '@playwright/test';

/**
 * Wait for a Sonner toast notification matching the given pattern.
 * Sonner renders toasts with [data-sonner-toast] attribute.
 */
export async function waitForToast(page: Page, pattern: RegExp, timeout = 10_000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: pattern });
  await expect(toast.first()).toBeVisible({ timeout });
}
