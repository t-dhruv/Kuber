import { describe, expect, it, vi } from 'vitest';
import { Router } from 'express';
import request from 'supertest';
import { makeRouteTestApp } from './integrationHarness';

describe('makeRouteTestApp', () => {
  it('mounts a router with authenticated household context', async () => {
    const router = Router();
    router.get('/context', (req: any, res) => {
      res.json({
        userId: req.userId,
        householdId: req.householdId,
        hasLogger: typeof req.log?.error === 'function',
      });
    });

    const res = await request(makeRouteTestApp(router, {
      userId: 'user-test',
      householdId: 'household-test',
    })).get('/context');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-test',
      householdId: 'household-test',
      hasLogger: true,
    });
  });

  it('allows per-test logger assertions', async () => {
    const log = { error: vi.fn(), info: vi.fn(), child: vi.fn(() => log) };
    const router = Router();
    router.get('/log', (req: any, res) => {
      req.log.error({ route: 'log' }, 'route log');
      res.json({ ok: true });
    });

    const res = await request(makeRouteTestApp(router, { log })).get('/log');

    expect(res.status).toBe(200);
    expect(log.error).toHaveBeenCalledWith({ route: 'log' }, 'route log');
  });
});
