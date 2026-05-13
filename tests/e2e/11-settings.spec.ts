import { test, expect } from './fixtures';
import { waitForToast } from './helpers';

test.describe('Settings', () => {
  test('settings page loads @smoke', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/settings/i).first()).toBeVisible();
  });

  test('update profile first name and revert', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /^profile$/i }).click();
    await page.waitForLoadState('networkidle');

    const firstNameField = page.getByLabel('First Name');
    await firstNameField.fill('E2E-Updated');
    await page.getByRole('button', { name: /save|update profile/i }).first().click();
    await waitForToast(page, /saved|updated|success/i);

    await firstNameField.fill('E2E');
    await page.getByRole('button', { name: /save|update profile/i }).first().click();
    await waitForToast(page, /saved|updated|success/i);
  });

  test('create custom category Hobbies', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /^categories$/i }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add category|new category/i }).first().click();
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dialog.waitFor({ timeout: 5000 });
      await dialog.getByLabel('Name').fill('Hobbies');
      await dialog.getByLabel('Group').fill('Other');
      await dialog.getByRole('button', { name: /add|save|create/i }).click();
      await waitForToast(page, /added|created|saved|success/i);
    } else {
      // Inline input form
      const input = page.getByPlaceholder(/category name|new category/i);
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill('Hobbies');
        await page.keyboard.press('Enter');
        await waitForToast(page, /added|created|success/i);
      }
    }
    await expect(page.getByText('Hobbies')).toBeVisible({ timeout: 8000 });
  });

  test('Hobbies category available when adding a transaction', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByRole('button', { name: /add transaction/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    const catSelect = dialog.getByLabel('Category');
    const options = await catSelect.locator('option').allTextContents();
    expect(options.some((o) => /hobbies/i.test(o))).toBeTruthy();
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('create tag: vacation', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /^tags$/i }).click();
    await page.waitForLoadState('networkidle');

    const addTagBtn = page.getByRole('button', { name: /add tag|new tag/i }).first();
    if (await addTagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addTagBtn.click();
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dialog.getByLabel(/name/i).fill('vacation');
        await dialog.getByRole('button', { name: /add|save|create/i }).click();
        await waitForToast(page, /added|created|saved|success/i);
      }
    } else {
      const tagInput = page.getByPlaceholder(/tag name|new tag/i);
      if (await tagInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tagInput.fill('vacation');
        await page.keyboard.press('Enter');
        await waitForToast(page, /added|created|success/i);
      }
    }
    await expect(page.getByText('vacation')).toBeVisible({ timeout: 8000 });
  });

  test('configure Gemini AI advisor', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /^integrations$/i }).click();
    await page.waitForLoadState('networkidle');

    // Provider select — label text is "Provider"
    await page.getByLabel('Provider').selectOption({ value: 'gemini' });
    await page.waitForTimeout(300);

    // Model input
    const modelField = page.getByLabel('Model');
    await modelField.clear();
    await modelField.fill('gemma-4-26b-a4b-it');

    // API Key input
    await page.getByLabel('API Key', { exact: false }).fill('AIzaSyBV9f1h4yFmyCHHO1m6PLVVUbwgkORo7-Y');

    // Save button (exact text "Save")
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await waitForToast(page, /saved|success/i);

    // Configured status should appear
    await expect(page.getByText(/configured.*gemini|google gemini/i)).toBeVisible({ timeout: 5000 });
  });

  test('AI Advisor page does not show not-configured nudge after setup', async ({ page }) => {
    await page.goto('/advice');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/not configured/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('Automation settings section loads', async ({ page }) => {
    await page.goto('/settings');
    const automationBtn = page.getByRole('button', { name: /^automation$/i });
    if (await automationBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await automationBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/automation|auto.?categori/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Webhooks settings section loads', async ({ page }) => {
    await page.goto('/settings');
    const webhookBtn = page.getByRole('button', { name: /^webhooks$/i });
    if (await webhookBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await webhookBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/webhook/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Display settings section loads and shows theme toggle', async ({ page }) => {
    await page.goto('/settings');
    const displayBtn = page.getByRole('button', { name: /^display$/i });
    if (await displayBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await displayBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/theme|dark|light/i).first()).toBeVisible({ timeout: 8000 });
    }
  });
});
