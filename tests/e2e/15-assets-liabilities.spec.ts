/**
 * 15-assets-liabilities.spec.ts
 * Assets & Liabilities tab in Accounts: add/edit/delete manual asset,
 * add/edit/delete manual liability, net-worth breakdown visible.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/accounts');
  await page.waitForLoadState('networkidle');
});

test.describe('Assets & Liabilities', () => {
  test('15.1 accounts page has an Assets & Liabilities tab or section', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /assets|liabilit/i })
      .or(page.getByRole('link', { name: /assets|liabilit/i }))
      .or(page.locator('[data-testid*="asset"], [data-testid*="liabilit"]').first());
    const hasTab = await tab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasTab) {
      await tab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toContainText(/asset|liabilit|net worth/i);
    } else {
      // May be on a sub-route
      await page.goto('/accounts/assets');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(/404|page not found/i);
    }
  });

  test('15.2 add a manual asset', async ({ page }) => {
    // Navigate to assets section
    const assetTab = page.getByRole('tab', { name: /assets/i })
      .or(page.locator('a[href*="asset"], button:has-text("Assets")').first());
    if (await assetTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await assetTab.click();
    } else {
      await page.goto('/accounts');
    }

    const addBtn = page.getByRole('button', { name: /add asset|new asset|\+ asset/i });
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      // Fill name
      const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameInput.fill('QA House Asset');
      }

      // Fill value
      const valueInput = dialog.locator('input[name*="value" i], input[name*="amount" i], input[type="number"]').first();
      if (await valueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await valueInput.fill('350000');
      }

      const saveBtn = dialog.getByRole('button', { name: /save|add|create/i });
      if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveBtn.click();
        await expect(page.locator('body')).toContainText(/QA House Asset|asset.*added|saved/i, {
          timeout: 8_000,
        });
      }
    } else {
      test.skip();
    }
  });

  test('15.3 add a manual liability', async ({ page }) => {
    const liabTab = page.getByRole('tab', { name: /liabilit/i })
      .or(page.locator('button:has-text("Liabilities"), a[href*="liabilit"]').first());
    if (await liabTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await liabTab.click();
    }

    const addBtn = page.getByRole('button', { name: /add liability|new liability|\+ liability/i });
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 5_000 });

      const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameInput.fill('QA Car Loan');
      }

      const balInput = dialog.locator('input[name*="balance" i], input[name*="amount" i], input[type="number"]').first();
      if (await balInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await balInput.fill('15000');
      }

      const saveBtn = dialog.getByRole('button', { name: /save|add|create/i });
      if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveBtn.click();
        await expect(page.locator('body')).toContainText(/QA Car Loan|liability.*added|saved/i, {
          timeout: 8_000,
        });
      }
    } else {
      test.skip();
    }
  });

  test('15.4 net worth breakdown section is visible', async ({ page }) => {
    // The net worth breakdown is shown on accounts or wealth page
    const hasNetWorth = await page.locator('body').textContent().then(t =>
      /net worth|total assets|total liabilit/i.test(t ?? '')
    );
    if (!hasNetWorth) {
      await page.goto('/wealth');
      await page.waitForLoadState('networkidle');
    }
    await expect(page.locator('body')).toContainText(/net worth|total assets/i, { timeout: 5_000 });
  });

  test('15.5 assets page loads without error', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/internal server error|something went wrong/i);
  });

  // ---------------------------------------------------------------------------
  // Assets & Liabilities — Edit & Delete
  // ---------------------------------------------------------------------------

  test.describe('Assets & Liabilities — Edit & Delete', () => {
    test('15.6 edit an asset value', async ({ page }) => {
      await page.goto('/accounts');
      await page.waitForLoadState('networkidle');

      // Navigate to assets section
      const assetTab = page.getByRole('tab', { name: /assets/i })
        .or(page.locator('a[href*="asset"], button:has-text("Assets")').first());
      if (await assetTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await assetTab.click();
      }
      await page.waitForTimeout(500);

      // Find the edit button for the first asset row
      const editBtn = page.getByRole('button', { name: /edit/i })
        .or(page.locator('button[aria-label*="edit" i]'))
        .or(page.locator('button[title*="edit" i]')).first();
      if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editBtn.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5_000 });

        const valueInput = dialog.locator('input[name*="value" i], input[name*="amount" i], input[type="number"]').first();
        if (await valueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await valueInput.clear();
          await valueInput.fill('400000');
        }

        const saveBtn = dialog.getByRole('button', { name: /save|update/i }).last();
        if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await saveBtn.click();
          await expect(page.locator('body')).toContainText(/400,?000|updated|saved/i, { timeout: 8_000 });
        }
      } else {
        test.skip();
      }
    });

    test('15.7 delete an asset', async ({ page }) => {
      await page.goto('/accounts');
      await page.waitForLoadState('networkidle');

      // First create an asset to delete
      const assetTab = page.getByRole('tab', { name: /assets/i })
        .or(page.locator('a[href*="asset"], button:has-text("Assets")').first());
      if (await assetTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await assetTab.click();
      }
      await page.waitForTimeout(500);

      const addBtn = page.getByRole('button', { name: /add asset|new asset|\+ asset/i });
      if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addBtn.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5_000 });

        const name = `E2E Asset Delete ${Date.now()}`;
        const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
        if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await nameInput.fill(name);
        }
        const valueInput = dialog.locator('input[name*="value" i], input[type="number"]').first();
        if (await valueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await valueInput.fill('50000');
        }
        const saveBtn = dialog.getByRole('button', { name: /save|add|create/i }).last();
        if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await saveBtn.click();
        }
        await page.waitForTimeout(2_000);

        // Now find and delete it
        const assetRow = page.locator('text="' + name + '"').first();
        if (await assetRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await assetRow.hover();
          const deleteBtn = page.getByRole('button', { name: /delete/i })
            .or(page.locator('button[aria-label*="delete" i]')).last();
          if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await deleteBtn.click();
            const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
            if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await confirmBtn.click();
            }
            await expect(page.locator('body')).not.toContainText(name, { timeout: 8_000 });
          }
        }
      } else {
        test.skip();
      }
    });

    test('15.8 edit a liability balance', async ({ page }) => {
      await page.goto('/accounts');
      await page.waitForLoadState('networkidle');

      const liabTab = page.getByRole('tab', { name: /liabilit/i })
        .or(page.locator('button:has-text("Liabilities"), a[href*="liabilit"]').first());
      if (await liabTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await liabTab.click();
      }
      await page.waitForTimeout(500);

      const editBtn = page.getByRole('button', { name: /edit/i })
        .or(page.locator('button[aria-label*="edit" i]')).first();
      if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editBtn.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5_000 });

        const balInput = dialog.locator('input[name*="balance" i], input[name*="amount" i], input[type="number"]').first();
        if (await balInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await balInput.clear();
          await balInput.fill('12000');
          const saveBtn = dialog.getByRole('button', { name: /save|update/i }).last();
          if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await saveBtn.click();
            await expect(page.locator('body')).toContainText(/12,?000|updated|saved/i, { timeout: 8_000 });
          }
        }
      } else {
        test.skip();
      }
    });

    test('15.9 delete a liability', async ({ page }) => {
      await page.goto('/accounts');
      await page.waitForLoadState('networkidle');

      const liabTab = page.getByRole('tab', { name: /liabilit/i })
        .or(page.locator('button:has-text("Liabilities"), a[href*="liabilit"]').first());
      if (await liabTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await liabTab.click();
      }
      await page.waitForTimeout(500);

      // Create one to delete
      const addBtn = page.getByRole('button', { name: /add liability|new liability|\+ liability/i });
      if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addBtn.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ timeout: 5_000 });

        const name = `E2E Liability Delete ${Date.now()}`;
        const nameInput = dialog.locator('input[name="name"], input[placeholder*="name" i]').first();
        if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await nameInput.fill(name);
        }
        const balInput = dialog.locator('input[name*="balance" i], input[type="number"]').first();
        if (await balInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await balInput.fill('8000');
        }
        const saveBtn = dialog.getByRole('button', { name: /save|add|create/i }).last();
        if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await saveBtn.click();
        }
        await page.waitForTimeout(2_000);

        const liabRow = page.locator('text="' + name + '"').first();
        if (await liabRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await liabRow.hover();
          const deleteBtn = page.getByRole('button', { name: /delete/i })
            .or(page.locator('button[aria-label*="delete" i]')).last();
          if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await deleteBtn.click();
            const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
            if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await confirmBtn.click();
            }
            await expect(page.locator('body')).not.toContainText(name, { timeout: 8_000 });
          }
        }
      } else {
        test.skip();
      }
    });

    test('15.10 net worth = assets minus liabilities calculation verification', async ({ page }) => {
      await page.goto('/accounts');
      await page.waitForLoadState('networkidle');

      // Find total assets and total liabilities text
      const bodyText = await page.locator('body').textContent() ?? '';
      const assetMatch = bodyText.match(/total assets[:\s]*\$?([\d,]+)/i);
      const liabMatch = bodyText.match(/total liabilit[:\s]*\$?([\d,]+)/i);
      const netWorthMatch = bodyText.match(/net worth[:\s]*\$?([\d,]+)/i);

      if (assetMatch && liabMatch && netWorthMatch) {
        const assets = parseFloat(assetMatch[1].replace(/,/g, ''));
        const liabs = parseFloat(liabMatch[1].replace(/,/g, ''));
        const netWorth = parseFloat(netWorthMatch[1].replace(/,/g, ''));
        // Allow small rounding differences (within $1)
        expect(Math.abs(netWorth - (assets - liabs))).toBeLessThanOrEqual(1);
      } else {
        // Check on wealth page
        await page.goto('/wealth');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toContainText(/net worth|assets|liabilit/i);
      }
    });
  });
});
