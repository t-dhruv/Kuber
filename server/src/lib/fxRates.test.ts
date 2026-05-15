import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFxRates() {
  vi.resetModules();
  return import('./fxRates');
}

describe('fxRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches and caches live rates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ rates: { USD: 1, CAD: 1.4 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getFxRates } = await loadFxRates();

    await expect(getFxRates()).resolves.toEqual({ USD: 1, CAD: 1.4 });
    await expect(getFxRates()).resolves.toEqual({ USD: 1, CAD: 1.4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to built-in rates when the live fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { getFxRates } = await loadFxRates();

    const rates = await getFxRates();

    expect(rates.USD).toBe(1);
    expect(rates.CAD).toBeGreaterThan(1);
    expect(rates.EUR).toBeGreaterThan(0);
  });

  it('falls back when the live response omits rates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      }),
    );
    const { getFxRates } = await loadFxRates();

    await expect(getFxRates()).resolves.toMatchObject({ USD: 1, CAD: expect.any(Number) });
  });

  it('converts between currencies using uppercased rate codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ rates: { USD: 1, CAD: 1.4, EUR: 0.7 } }),
      }),
    );
    const { convertCurrency } = await loadFxRates();

    await expect(convertCurrency(100, 'cad', 'eur')).resolves.toBeCloseTo(50);
    await expect(convertCurrency(42, 'usd', 'usd')).resolves.toBe(42);
  });

  it('returns display currency snapshots relative to the requested base', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          rates: { USD: 1, CAD: 1.25, EUR: 0.8, GBP: 0.65, AUD: 1.5, CHF: 0.9, JPY: 150 },
        }),
      }),
    );
    const { getCurrencySnapshot } = await loadFxRates();

    await expect(getCurrencySnapshot('CAD')).resolves.toEqual([
      { code: 'USD', rate: 0.8 },
      { code: 'EUR', rate: 0.64 },
      { code: 'GBP', rate: 0.52 },
      { code: 'AUD', rate: 1.2 },
      { code: 'CHF', rate: 0.72 },
      { code: 'JPY', rate: 120 },
    ]);
  });
});
