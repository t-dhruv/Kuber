import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHousehold, createTestApp, resetDatabase } from './harness';

// Issue #161. Helmet, CORS, the per-route rate limiters and proxy trust are all
// configured in src/app.ts — and until this file existed, nothing exercised any
// of them. The route tests mount one router on a bare Express app, so every one
// of these controls is upstream of the seam they can see.
//
// Everything here asserts on what a client observes: response headers, status
// codes, and which bucket a request lands in. The limiters no longer carry a
// `skip` for NODE_ENV=test, so this suite runs against the same limiter code a
// Self-hoster runs.

const CLIENT_URL = 'http://localhost:3000';
const FOREIGN_ORIGIN = 'http://evil.example';

/** Two client addresses, from the RFC 5737 documentation range. */
const CLIENT_A = '203.0.113.10';
const CLIENT_B = '203.0.113.11';

const envKeys = ['TRUST_PROXY', 'AUTH_RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_WINDOW_MS'] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('security headers', () => {
  it('are present on a response', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-src 'none'");
    expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('do not advertise the framework', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('carry a request id a Self-hoster can quote in a bug report', async () => {
    const res = await request(createTestApp()).get('/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('are present on an error response too, not only a happy path', async () => {
    const res = await request(createTestApp()).get('/api/v1/accounts');

    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('CORS', () => {
  // A browser hands a cross-origin response to the page only when
  // Access-Control-Allow-Origin matches the origin that asked — and with
  // credentials in play, the wildcard is not allowed to match anything. So the
  // rejection of a foreign origin is exactly "the header does not name it",
  // which is what these tests assert.
  //
  // Kuber does not fail the request itself, and should not: a caller with no
  // Origin at all is not a browser — curl, the API token surface, a mobile
  // client — and authentication, not CORS, is what guards those.

  it('grants the configured client origin, with credentials', async () => {
    const res = await request(createTestApp()).get('/health').set('Origin', CLIENT_URL);

    expect(res.headers['access-control-allow-origin']).toBe(CLIENT_URL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant a foreign origin', async () => {
    const res = await request(createTestApp()).get('/health').set('Origin', FOREIGN_ORIGIN);

    expect(res.headers['access-control-allow-origin']).not.toBe(FOREIGN_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('does not grant a foreign origin on the preflight either', async () => {
    const res = await request(createTestApp())
      .options('/api/v1/auth/login')
      .set('Origin', FOREIGN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).not.toBe(FOREIGN_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('varies on Origin, so a shared cache cannot serve one origin another’s response', async () => {
    const res = await request(createTestApp()).get('/health').set('Origin', CLIENT_URL);

    expect(res.headers['vary']).toContain('Origin');
  });

  it('does not let a foreign origin read a response by sending credentials', async () => {
    const fixture = await createHousehold();
    const res = await request(createTestApp())
      .post('/api/v1/auth/login')
      .set('Origin', FOREIGN_ORIGIN)
      .send({ email: fixture.user.email, password: fixture.password });

    // The request itself succeeds — Kuber is not a browser and cannot pretend
    // to be one — but nothing tells the browser to hand the body to the page.
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).not.toBe(FOREIGN_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('the auth rate limiter', () => {
  // The limiter's job is to slow a brute-force attempt against one client
  // without locking out the rest of the Household, so "which bucket" is the
  // whole behaviour. A limit of 2 keeps the test to a handful of requests.

  const LIMIT = 2;

  /** An attempt that always fails auth, so only the limiter can change the status. */
  function attemptLogin(app: ReturnType<typeof createTestApp>, clientAddress?: string) {
    const req = request(app).post('/api/v1/auth/login');
    if (clientAddress) req.set('X-Forwarded-For', clientAddress);
    return req.send({ email: 'nobody@example.test', password: 'wrong-password' });
  }

  function appWithLimit(trustProxy: string) {
    process.env.AUTH_RATE_LIMIT_MAX = String(LIMIT);
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = String(15 * 60 * 1000);
    process.env.TRUST_PROXY = trustProxy;
    return createTestApp();
  }

  it('lets a client through up to the limit, then refuses', async () => {
    const app = appWithLimit('1');

    for (let i = 0; i < LIMIT; i++) {
      const allowed = await attemptLogin(app, CLIENT_A);
      expect(allowed.status).not.toBe(429);
    }

    const refused = await attemptLogin(app, CLIENT_A);
    expect(refused.status).toBe(429);
    expect(refused.body.error).toMatch(/too many requests/i);
  });

  it('buckets per client address rather than globally', async () => {
    const app = appWithLimit('1');

    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    expect((await attemptLogin(app, CLIENT_A)).status).toBe(429);

    // Another User on the same LAN is unaffected by the first's burst.
    expect((await attemptLogin(app, CLIENT_B)).status).not.toBe(429);
  });

  it('tells a refused client what the limit was and when it resets', async () => {
    const app = appWithLimit('1');

    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    const refused = await attemptLogin(app, CLIENT_A);

    // Only on the refusal: the auth limiter short-circuits there, so its own
    // headers survive. On an allowed request the general /api/ limiter runs
    // afterwards and overwrites the same RateLimit-* names with its own budget.
    expect(refused.status).toBe(429);
    expect(refused.headers['ratelimit-limit']).toBe(String(LIMIT));
    expect(refused.headers['ratelimit-remaining']).toBe('0');
    expect(Number(refused.headers['ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('does not spend the rest of the API budget on the same client', async () => {
    const app = appWithLimit('1');

    // Exhaust the auth budget entirely.
    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    expect((await attemptLogin(app, CLIENT_A)).status).toBe(429);

    // The same client still reaches the rest of the API: the strict limit is
    // scoped to /api/v1/auth, so a brute-force attempt against login cannot
    // lock its owner out of the app they are already signed into.
    const elsewhere = await request(app)
      .get('/api/v1/accounts')
      .set('X-Forwarded-For', CLIENT_A);
    expect(elsewhere.status).toBe(401);
  });
});

describe('client addresses behind a reverse proxy', () => {
  // `trust proxy` is a HOP COUNT, never `true`. With `true`, Express takes the
  // left-most X-Forwarded-For entry, which the client writes — so an attacker
  // gets a fresh rate-limit bucket per request by varying a header. Counting
  // hops from the right reads the entry the trusted proxy appended, which the
  // client cannot control.

  const LIMIT = 2;

  function attemptLogin(app: ReturnType<typeof createTestApp>, forwardedFor: string) {
    return request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email: 'nobody@example.test', password: 'wrong-password' });
  }

  function appWithLimit(trustProxy: string) {
    process.env.AUTH_RATE_LIMIT_MAX = String(LIMIT);
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = String(15 * 60 * 1000);
    process.env.TRUST_PROXY = trustProxy;
    return createTestApp();
  }

  it('resolves the client the trusted proxy reported, not the proxy itself', async () => {
    const app = appWithLimit('1');

    // One hop trusted: supertest's own socket is the proxy, so the single
    // forwarded entry is the client. Two different entries are two clients.
    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    expect((await attemptLogin(app, CLIENT_A)).status).toBe(429);
    expect((await attemptLogin(app, CLIENT_B)).status).not.toBe(429);
  });

  it('ignores forwarded entries a client prepends to escape its bucket', async () => {
    const app = appWithLimit('1');

    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    expect((await attemptLogin(app, CLIENT_A)).status).toBe(429);

    // The client writes the left-most entry. With a hop count, the right-most
    // (proxy-appended) one still decides the bucket, so this stays refused.
    const forged = await attemptLogin(app, `198.51.100.7, ${CLIENT_A}`);
    expect(forged.status).toBe(429);
  });

  it('ignores the forwarded header entirely when no proxy is trusted', async () => {
    const app = appWithLimit('0');

    // TRUST_PROXY=0 is the directly-exposed deployment: every request is
    // bucketed by its socket address, so varying the header changes nothing.
    for (let i = 0; i <= LIMIT; i++) await attemptLogin(app, CLIENT_A);
    expect((await attemptLogin(app, CLIENT_B)).status).toBe(429);
  });
});
