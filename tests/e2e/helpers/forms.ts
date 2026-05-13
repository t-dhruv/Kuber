import { Page, expect } from '@playwright/test';

export async function fillByLabel(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: false }).fill(value);
}

export async function selectByLabel(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: false }).selectOption(value);
}

export async function waitForToast(page: Page, text: string | RegExp) {
  await expect(
    page.locator('[role="status"], [data-sonner-toast], .toast, [class*="toast"], [class*="notify"]').filter({ hasText: text })
  ).toBeVisible({ timeout: 8000 });
}

export async function openModal(page: Page, triggerText: string | RegExp) {
  await page.getByRole('button', { name: triggerText }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
}

export async function submitModal(page: Page, buttonText: string | RegExp) {
  await page.getByRole('dialog').getByRole('button', { name: buttonText }).click();
}
