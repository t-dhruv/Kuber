import { test, expect } from '@playwright/test';

test.describe('Review Queue', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transactions/review');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with correct heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /review ai suggestions/i })).toBeVisible();
  });

  test('breadcrumb shows AI Review not Transactions', async ({ page }) => {
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb.getByText('AI Review')).toBeVisible();
    await expect(breadcrumb.getByText('Transactions')).not.toBeVisible();
  });

  test('only AI Review is active in sidebar — not Transactions', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /app navigation/i });
    const aiReviewLink = nav.getByRole('link', { name: /ai review/i });
    await expect(aiReviewLink).toBeVisible();
    const txLink = nav.getByRole('link', { name: /^transactions$/i });
    const txClass = await txLink.getAttribute('class');
    expect(txClass).not.toMatch(/accent/);
  });

  test('empty state renders when no transactions need review', async ({ page }) => {
    const hasEmpty = await page.getByText(/all caught up|no transactions need review/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasItems = await page.locator('[class*="border"][class*="rounded"]').count() > 0;
    expect(hasEmpty || hasItems).toBeTruthy();
  });

  test('Re-run AI button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /re-run ai/i })).toBeVisible();
  });

  test('Back to Transactions link works when empty', async ({ page }) => {
    const backLink = page.getByRole('button', { name: /back to transactions/i });
    if (await backLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backLink.click();
      await expect(page).toHaveURL(/\/transactions$/);
    }
  });

  test('page has no JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
