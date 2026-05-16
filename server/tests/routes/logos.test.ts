import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import logosRouter from '../../src/routes/logos';
import { getOrFetchBankLogo, getOrFetchMerchantLogo } from '../../src/services/logoService';

vi.mock('../../src/services/logoService', () => ({
  getOrFetchBankLogo: vi.fn(),
  getOrFetchMerchantLogo: vi.fn(),
}));

function makeApp() {
  const app = express();
  app.use('/logos', logosRouter);
  return app;
}

describe('logo routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a bank name before fetching a logo', async () => {
    const res = await request(makeApp()).get('/logos/bank?name=%20');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name is required');
    expect(getOrFetchBankLogo).not.toHaveBeenCalled();
  });

  it('returns cached bank logo bytes with cache headers', async () => {
    vi.mocked(getOrFetchBankLogo).mockResolvedValue({
      data: Buffer.from('bank-logo'),
      mimeType: 'image/png',
    });

    const res = await request(makeApp()).get('/logos/bank?name=Chase%20Bank');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
    expect(res.body.toString()).toBe('bank-logo');
    expect(getOrFetchBankLogo).toHaveBeenCalledWith('Chase Bank');
  });

  it('returns 404 when no merchant logo is available', async () => {
    vi.mocked(getOrFetchMerchantLogo).mockResolvedValue(null);

    const res = await request(makeApp()).get('/logos/merchant?name=Unknown&domain=unknown.example');

    expect(res.status).toBe(404);
    expect(getOrFetchMerchantLogo).toHaveBeenCalledWith('Unknown', 'unknown.example');
  });
});


