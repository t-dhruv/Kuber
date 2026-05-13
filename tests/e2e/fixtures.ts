import { test as base, expect } from '@playwright/test';

const IGNORED_PAGE_ERRORS = [
  /ResizeObserver loop completed with undelivered notifications/i,
  /ResizeObserver loop limit exceeded/i,
];

export const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors: string[] = [];
    const serverFailures: string[] = [];

    page.on('pageerror', (error) => {
      const message = error.message;
      if (!IGNORED_PAGE_ERRORS.some((pattern) => pattern.test(message))) {
        pageErrors.push(message);
      }
    });

    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();

      if (status >= 500 && url.includes('/api/')) {
        serverFailures.push(`${status} ${url}`);
      }
    });

    await use(page);

    expect(pageErrors, 'Unexpected uncaught page errors').toEqual([]);
    expect(serverFailures, 'Unexpected 5xx API responses').toEqual([]);
  },
});

export { expect };
