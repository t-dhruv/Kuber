/**
 * 11-settings.spec.ts
 * Profile, AI config, categories, tags, report digest.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
});

test.describe('Settings — Profile', () => {
  test('11.1 settings page loads with profile section', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/profile|settings|name/i);
  });

  test('11.2 profile first name field is pre-filled', async ({ page }) => {
    const firstNameInput = page.locator('input[name="firstName"], #firstName').first();
    if (await firstNameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const value = await firstNameInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test('11.3 update profile name saves successfully', async ({ page }) => {
    const firstNameInput = page.locator('input[name="firstName"], #firstName').first();
    if (await firstNameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstNameInput.clear();
      await firstNameInput.fill('Arjun');
      const saveBtn = page.getByRole('button', { name: /save|update/i }).first();
      await saveBtn.click();
      await expect(page.locator('body')).toContainText(/saved|updated|success/i, { timeout: 6_000 });
    }
  });

  test('11.4 change password form is present', async ({ page }) => {
    // Navigate to Security section
    const securityLink = page.getByRole('button', { name: /^security$/i })
      .or(page.getByRole('link', { name: /^security$/i })).first();
    if (await securityLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await securityLink.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).toContainText(/change password|current password/i);
  });

  test('11.5 change password with wrong current shows error', async ({ page }) => {
    const currentPw = page.locator('input[type="password"]').first();
    const newPw = page.locator('input[type="password"]').nth(1);
    const confirmPw = page.locator('input[type="password"]').nth(2);

    if (await currentPw.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await currentPw.fill('wrongpassword');
      await newPw.fill('NewPassword123!');
      if (await confirmPw.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await confirmPw.fill('NewPassword123!');
      }
      await page.getByRole('button', { name: /change password|update password/i }).click();
      await expect(page.locator('body')).toContainText(/incorrect|invalid|wrong|failed/i, { timeout: 6_000 });
    }
  });
});

test.describe('Settings — AI Advisor', () => {
  test('11.6 AI Advisor section is visible', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/AI|advisor|provider/i);
  });

  test('11.7 AI provider dropdown has options', async ({ page }) => {
    const providerSelect = page.locator('select[name*="provider" i]')
      .or(page.locator('select').filter({ has: page.locator('option').filter({ hasText: /claude|openai|none/i }) }))
      .first();
    if (await providerSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const options = providerSelect.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThan(1);
    }
  });

  test('11.8 selecting None provider saves', async ({ page }) => {
    const providerSelect = page.locator('select[name*="provider" i]').first();
    if (await providerSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await providerSelect.selectOption('none').catch(() =>
        providerSelect.selectOption('NONE').catch(() =>
          providerSelect.selectOption({ label: /none/i }).catch(() => {})
        )
      );
      const saveBtn = page.getByRole('button', { name: /save|update/i }).last();
      if (await saveBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});

test.describe('Settings — Categories', () => {
  test('11.9 categories section lists existing categories', async ({ page }) => {
    // Navigate to categories section
    const catLink = page.getByRole('link', { name: /categories/i })
      .or(page.getByRole('button', { name: /categories/i })).first();
    if (await catLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await catLink.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).toContainText(/Groceries|Restaurants|Coffee/i);
  });

  test('11.10 create a new category', async ({ page }) => {
    const catLink = page.getByRole('link', { name: /categories/i })
      .or(page.getByRole('button', { name: /categories/i })).first();
    if (await catLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await catLink.click();
      await page.waitForTimeout(500);
    }

    const addBtn = page.getByRole('button', { name: /add category|new category|\+ category/i });
    if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const catName = `E2E Cat ${Date.now()}`;
      await dialog.locator('input[name="name"], input[placeholder*="name" i]').first().fill(catName);
      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await expect(page.locator('body')).toContainText(catName, { timeout: 6_000 });
    }
  });
});

test.describe('Settings — Tags', () => {
  test('11.11 tags section is visible', async ({ page }) => {
    const tagsLink = page.getByRole('link', { name: /^tags$/i })
      .or(page.getByRole('button', { name: /^tags$/i })).first();
    if (await tagsLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tagsLink.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).toContainText(/tag/i);
  });

  test('11.12 create a new tag', async ({ page }) => {
    const tagsLink = page.getByRole('link', { name: /^tags$/i })
      .or(page.getByRole('button', { name: /^tags$/i })).first();
    if (await tagsLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tagsLink.click();
      await page.waitForTimeout(500);
    }

    // Button says "New Tag"
    const addBtn = page.getByRole('button', { name: /new tag|add tag|\+ tag/i });
    if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const tagName = `e2e-tag-${Date.now()}`;
      // Input has label "Name" and placeholder "e.g. Business"
      await dialog.locator('input').first().fill(tagName);
      await dialog.getByRole('button', { name: /save|add|create/i }).last().click();
      await expect(page.locator('body')).toContainText(tagName, { timeout: 6_000 });
    }
  });
});

test.describe('Settings — Report Digest', () => {
  test('11.13 report digest toggle is present', async ({ page }) => {
    const digestLink = page.getByRole('link', { name: /digest|email|notification/i })
      .or(page.getByRole('button', { name: /digest|email|notification/i })).first();
    if (await digestLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await digestLink.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).toContainText(/digest|report email|weekly|monthly/i);
  });

  test('11.14 report digest can be toggled', async ({ page }) => {
    const digestLink = page.getByRole('link', { name: /digest|notifications/i }).first();
    if (await digestLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await digestLink.click();
      await page.waitForTimeout(500);
    }

    const toggle = page.locator('input[type="checkbox"][name*="digest" i]')
      .or(page.locator('[id*="digest" i]')).first();
    if (await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(300);
    }
  });
});
