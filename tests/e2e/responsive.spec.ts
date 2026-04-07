/**
 * responsive.spec.ts
 * Viewport-specific UI tests covering desktop, tablet, and mobile breakpoints.
 *
 * Run via the dedicated playwright config:
 *   npx playwright test --config=playwright.responsive.config.ts
 *
 * Architecture:
 * - The companion global-setup script logs in once and saves browser storage
 *   state so no test directly calls the auth endpoint.  This keeps us well
 *   below the rate limit (20 req / 15 min).
 * - Each viewport group restores that auth state via storageState fixture.
 * - The login-page overflow test deliberately uses a fresh (unauthenticated)
 *   context so it sees the actual login page, not a redirect.
 *
 * Layout notes (source of truth: AppShell.tsx / BottomNav.tsx / Sidebar.tsx):
 * - BottomNav: aria-label="Bottom navigation", Tailwind `flex md:hidden` →
 *   display:none at ≥768 px.  We check bounding-box size, not Playwright
 *   toBeVisible(), because the element is always in the DOM.
 * - Sidebar: <aside aria-label="Main navigation">, always in DOM, translated
 *   off-screen via -translate-x-full on mobile; we check getBoundingClientRect().x.
 * - Overflow tolerance: 5 px to accommodate scrollbar widths.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { test, expect, Page, BrowserContext } from '@playwright/test';

// Auth state written by the global-setup script
const AUTH_STATE_FILE = path.join(os.tmpdir(), 'kuber-e2e-auth-state.json');

// ---------------------------------------------------------------------------
// Viewport matrix
// ---------------------------------------------------------------------------

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'iPad',    width: 768,  height: 1024 },
  { name: 'mobile',  width: 375,  height: 812 },
] as const;

// Pages to smoke-check for load + overflow
const smokePages = [
  { path: '/',             label: 'dashboard' },
  { path: '/transactions', label: 'transactions' },
  { path: '/budget',       label: 'budget' },
  { path: '/goals',        label: 'goals' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the element has non-zero rendered dimensions. */
async function isRenderedVisible(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, selector);
}

/** Returns scrollWidth and innerWidth for overflow comparison. */
async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; windowWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    windowWidth: window.innerWidth,
  }));
}

/** Capture a screenshot to tests/screenshots/. */
async function shot(page: Page, name: string) {
  const dir = path.join('tests', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
}

// ---------------------------------------------------------------------------
// Test suites — one per viewport
// ---------------------------------------------------------------------------

for (const vp of viewports) {
  // Breakpoints match Tailwind md: (768px):
  //   BottomNav   → flex md:hidden  → hidden at >=768px
  //   Sidebar     → -translate-x-full md:translate-x-0 → on-screen at >=768px
  const isMobile           = vp.width < 768;
  const isSidebarOnScreen  = vp.width >= 768;  // md: breakpoint
  const isDesktop          = vp.width >= 1024; // for future use

  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    // All authenticated tests in this block share the pre-created auth state
    test.use({
      viewport:     { width: vp.width, height: vp.height },
      storageState: AUTH_STATE_FILE,
    });

    // -----------------------------------------------------------------------
    // 1. Login page — deliberately uses a fresh unauthenticated context
    //    so we see the login form, not a redirect to dashboard.
    // -----------------------------------------------------------------------

    test('login page renders without horizontal overflow', async ({ browser }) => {
      const ctx: BrowserContext = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        // no storageState — we want the unauthenticated login page
      });
      const pg = await ctx.newPage();

      await pg.goto('http://localhost:9001/login');
      await pg.waitForLoadState('networkidle');
      await shot(pg, `${vp.name}-login`);

      const { scrollWidth, windowWidth } = await horizontalOverflow(pg);
      await ctx.close();

      expect(
        scrollWidth,
        `Horizontal overflow on login at ${vp.name}: scrollWidth=${scrollWidth} windowWidth=${windowWidth}`,
      ).toBeLessThanOrEqual(windowWidth + 5);
    });

    // -----------------------------------------------------------------------
    // 2. Authenticated page smoke — restores auth state, no login call needed
    // -----------------------------------------------------------------------

    for (const sp of smokePages) {
      test(`${sp.label} page loads without horizontal overflow`, async ({ page }) => {
        await page.goto(sp.path);
        await page.waitForLoadState('networkidle');
        await shot(page, `${vp.name}-${sp.label}`);

        const { scrollWidth, windowWidth } = await horizontalOverflow(page);
        expect(
          scrollWidth,
          `Horizontal overflow on ${sp.label} at ${vp.name}: scrollWidth=${scrollWidth} windowWidth=${windowWidth}`,
        ).toBeLessThanOrEqual(windowWidth + 5);
      });
    }

    // -----------------------------------------------------------------------
    // 3. Bottom nav visibility
    //    mobile (<768 px)   → display:flex  → isRenderedVisible = true
    //    tablet/desktop     → display:none  → isRenderedVisible = false
    // -----------------------------------------------------------------------

    test('bottom nav visibility matches breakpoint', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const bottomNav = page.locator('[aria-label="Bottom navigation"]');
      await expect(bottomNav).toBeAttached(); // always in DOM

      const visible = await isRenderedVisible(page, '[aria-label="Bottom navigation"]');

      if (isMobile) {
        expect(visible, 'BottomNav should be visible on mobile').toBe(true);
      } else {
        expect(visible, `BottomNav should be hidden on ${vp.name}`).toBe(false);
      }

      await shot(page, `${vp.name}-bottom-nav`);
    });

    // -----------------------------------------------------------------------
    // 4. Sidebar on-screen / off-screen
    //    desktop (≥1024 px) → bounding rect x ≥ 0 (on-screen)
    //    mobile / tablet    → bounding rect x < 0 (translated off-screen)
    // -----------------------------------------------------------------------

    test('sidebar visibility matches breakpoint', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const sidebarRect = await page.evaluate(() => {
        const el = document.querySelector('aside[aria-label="Main navigation"]');
        if (!el) return null;
        return el.getBoundingClientRect().toJSON();
      });

      expect(sidebarRect, 'Sidebar <aside> should be in the DOM').not.toBeNull();

      if (isSidebarOnScreen) {
        // At >=768px (md: breakpoint) the sidebar translates to x=0 (on-screen)
        expect(
          sidebarRect!.x,
          `Sidebar should be on-screen at ${vp.name} (x=${sidebarRect!.x})`,
        ).toBeGreaterThanOrEqual(0);
      } else {
        // On mobile (<768px) the sidebar is translated off-screen to the left
        expect(
          sidebarRect!.x,
          `Sidebar should be off-screen on ${vp.name} (x=${sidebarRect!.x})`,
        ).toBeLessThan(0);
      }
    });

    // -----------------------------------------------------------------------
    // 5. Main content area is rendered
    // -----------------------------------------------------------------------

    test('main content area is rendered and accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mainVisible = await isRenderedVisible(page, '#main-content');
      expect(mainVisible, 'Main content area should be rendered and have dimensions').toBe(true);
    });
  });
}
