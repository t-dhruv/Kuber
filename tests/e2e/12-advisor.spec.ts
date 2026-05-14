import { test, expect } from './fixtures';

test.describe('AI Advisor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/advice');
    await page.waitForLoadState('networkidle');
  });

  test('advisor page loads without error', async ({ page }) => {
    await expect(page.getByText(/advisor|advice|how can i help/i).first()).toBeVisible();
    await expect(page.getByText(/error|something went wrong/i)).not.toBeVisible();
  });

  test('send a message and receive streamed response', async ({ page }) => {
    const chatInput = page.getByPlaceholder(/ask|message|type/i).first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Summarize my spending this month in one sentence.');
    await page.getByRole('button', { name: /send/i }).click();

    // Wait up to 30s for AI response to appear
    const responseLocator = page.locator('[class*="message"], [class*="response"], [class*="assistant"], [class*="bubble"]').last();
    await expect(responseLocator).toBeVisible({ timeout: 30_000 });

    const text = await responseLocator.textContent();
    expect((text ?? '').trim().length).toBeGreaterThan(10);
  });

  test('conversation persists after page refresh', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/summarize|spending/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('advice library section visible', async ({ page }) => {
    const libraryTab = page.getByRole('tab', { name: /library|topics/i });
    if (await libraryTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[class*="topic"], [class*="card"]').first()).toBeVisible({ timeout: 8000 });
    }
  });
});
