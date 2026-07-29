import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mirrors the `trust proxy` configuration applied in src/index.ts. Building a
// minimal app here keeps the test from importing index.ts, which starts a
// listening server and connects to the database.
function buildApp(hops: number) {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/echo-ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('trust proxy configuration', () => {
  it('resolves req.ip to the real client when one proxy hop is trusted', async () => {
    const res = await request(buildApp(1)).get('/echo-ip').set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
  });

  it('gives different clients different ips so rate-limit buckets differ', async () => {
    const app = buildApp(1);

    const a = await request(app).get('/echo-ip').set('X-Forwarded-For', '203.0.113.7');
    const b = await request(app).get('/echo-ip').set('X-Forwarded-For', '203.0.113.9');

    expect(a.body.ip).not.toBe(b.body.ip);
  });

  it('ignores forged left-most entries beyond the trusted hop count', async () => {
    // A client forging an extra hop must not be able to control the resolved ip.
    const res = await request(buildApp(1))
      .get('/echo-ip')
      .set('X-Forwarded-For', '1.2.3.4, 203.0.113.7');

    expect(res.body.ip).toBe('203.0.113.7');
    expect(res.body.ip).not.toBe('1.2.3.4');
  });

  it('does not trust forwarded headers when hops is 0', async () => {
    const res = await request(buildApp(0)).get('/echo-ip').set('X-Forwarded-For', '203.0.113.7');

    expect(res.body.ip).not.toBe('203.0.113.7');
  });
});
