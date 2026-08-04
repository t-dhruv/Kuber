import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHousehold, createTestApp, resetDatabase } from './harness';

// ADR-0002. The refresh cookie used to take its `Secure` flag from
// NODE_ENV === 'production', and .env.example ships NODE_ENV=production. Browsers
// discard Secure cookies over plain HTTP everywhere except localhost, so a
// Self-hoster on http://192.168.1.50 logged in, kept the access token for fifteen
// minutes, and was then bounced with nothing in any log to explain it.
//
// These assertions are on the Set-Cookie attributes the browser actually reads,
// at the seam that boots the real entry point. A mocked response object would
// happily report whatever it was handed.

/** The `refreshToken` Set-Cookie header from a response, or undefined. */
function refreshCookie(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith('refreshToken='));
}

/** Attributes are case-insensitive per RFC 6265. */
function hasAttribute(cookie: string, attribute: string): boolean {
  return cookie.split(';').some((part) => part.trim().toLowerCase() === attribute.toLowerCase());
}

const originalCookieSecure = process.env.COOKIE_SECURE;

afterEach(() => {
  if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = originalCookieSecure;
});

describe('the refresh cookie honours COOKIE_SECURE', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('sets Secure by default, when COOKIE_SECURE is not configured at all', async () => {
    delete process.env.COOKIE_SECURE;
    const fixture = await createHousehold();

    const res = await request(createTestApp())
      .post('/api/v1/auth/login')
      .send({ email: fixture.user.email, password: fixture.password });

    expect(res.status).toBe(200);
    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(hasAttribute(cookie!, 'Secure')).toBe(true);
  });

  it('sets Secure when COOKIE_SECURE is enabled', async () => {
    process.env.COOKIE_SECURE = 'true';
    const fixture = await createHousehold();

    const res = await request(createTestApp())
      .post('/api/v1/auth/login')
      .send({ email: fixture.user.email, password: fixture.password });

    expect(res.status).toBe(200);
    expect(hasAttribute(refreshCookie(res)!, 'Secure')).toBe(true);
  });

  it('omits Secure when COOKIE_SECURE is disabled', async () => {
    process.env.COOKIE_SECURE = 'false';
    const fixture = await createHousehold();

    const res = await request(createTestApp())
      .post('/api/v1/auth/login')
      .send({ email: fixture.user.email, password: fixture.password });

    expect(res.status).toBe(200);
    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(hasAttribute(cookie!, 'Secure')).toBe(false);
  });

  it('keeps the cookie HttpOnly whether or not Secure is set', async () => {
    const fixture = await createHousehold();

    for (const setting of ['true', 'false']) {
      process.env.COOKIE_SECURE = setting;
      const res = await request(createTestApp())
        .post('/api/v1/auth/login')
        .send({ email: fixture.user.email, password: fixture.password });

      expect(res.status).toBe(200);
      expect(hasAttribute(refreshCookie(res)!, 'HttpOnly')).toBe(true);
    }
  });

  it('rotates the cookie on refresh without reintroducing Secure', async () => {
    // The defect this closes: the cookie survives the first response but the
    // refresh that rotates it fifteen minutes later must not re-add Secure, or
    // the session dies one rotation later instead of immediately.
    process.env.COOKIE_SECURE = 'false';
    const fixture = await createHousehold();
    const app = createTestApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.user.email, password: fixture.password });
    expect(login.status).toBe(200);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie(login)!.split(';')[0]);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(hasAttribute(refreshCookie(refreshed)!, 'Secure')).toBe(false);
  });
});
