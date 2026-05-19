import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fxRouter from '../../src/routes/fx';
import { getCurrencySnapshot, getFxRates } from '../../src/lib/fxRates';

vi.mock('../../src/lib/fxRates', () => ({
  getFxRates: vi.fn(),
  getCurrencySnapshot: vi.fn(),
}));

function makeApp() {
  const app = express();
  app.use('/fx', fxRouter);
  return app;
}

describe('fx routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns USD-based FX rates', async () => {
    vi.mocked(getFxRates).mockResolvedValue({ CAD: 1.37, EUR: 0.92 } as any);

    const res = await request(makeApp()).get('/fx/rates');

    expect(res.status).toBe(200);
    expect(res.body.base).toBe('USD');
    expect(res.body.rates).toEqual({ CAD: 1.37, EUR: 0.92 });
    expect(res.body.cachedAt).toEqual(expect.any(String));
  });

  it('returns 502 when FX rates cannot be loaded', async () => {
    vi.mocked(getFxRates).mockRejectedValue(new Error('provider down'));

    const res = await request(makeApp()).get('/fx/rates');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('FX rates unavailable');
  });

  it('normalizes snapshot base currency to uppercase', async () => {
    vi.mocked(getCurrencySnapshot).mockResolvedValue({ USD: 0.73, EUR: 0.67 } as any);

    const res = await request(makeApp()).get('/fx/snapshot?base=cad');

    expect(res.status).toBe(200);
    expect(getCurrencySnapshot).toHaveBeenCalledWith('CAD');
    expect(res.body).toEqual({ base: 'CAD', rates: { USD: 0.73, EUR: 0.67 } });
  });
});


