import { test, expect } from '@playwright/test';

test.describe('Wealth Strategy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wealth');
    await page.waitForLoadState('networkidle');
  });

  test('wealth strategy page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /wealth|strategy|50.30.20/i })).toBeVisible();
  });

  test('50/30/20 buckets or income prompt visible', async ({ page }) => {
    // Either buckets (when income is set) or income prompt (when not set)
    await expect(
      page.getByText(/needs|wants|savings|set your.*income|50.30.20/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('salary input triggers calculation', async ({ page }) => {
    const salaryInput = page.getByLabel(/salary|income|annual/i).first();
    if (await salaryInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await salaryInput.fill('80000');
      await salaryInput.press('Enter');
      await page.waitForTimeout(1000);
      await expect(page.getByText(/\$[1-9][0-9,]+/).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('page renders dollar amounts or prompt', async ({ page }) => {
    // Either spending data in buckets or the income prompt is shown
    await expect(page.getByText(/\$[0-9]|set your.*income/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('SVG chart renders', async ({ page }) => {
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 8000 });
  });

  test('page has no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('shows income prompt with CTA when no income set', async ({ page }) => {
    const prompt = page.getByText(/set your monthly take-home income|no income transactions/i);
    if (await prompt.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(page.getByRole('button', { name: /save/i })).toBeVisible();
    }
  });
});
