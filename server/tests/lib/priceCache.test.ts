import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock yahoo-finance2 ──────────────────────────────────────────────────────
// priceCache.ts does:
//   const YahooFinance = yahooFinanceModule as unknown as new (...) => { quote, historical }
//   const yf = new YahooFinance({ suppressNotices: ... })
// We need the default export to be a constructor whose instances have quote() / historical().
// vi.mock is hoisted so mocks must be created with vi.hoisted().

const { mockQuote, mockHistorical } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
  mockHistorical: vi.fn(),
}));

vi.mock('yahoo-finance2', () => ({
  // The constructor — every `new YahooFinance(...)` returns the same mock instance.
  default: function MockYahooFinance(_opts?: object) {
    return { quote: mockQuote, historical: mockHistorical };
  },
}));

// Import AFTER mock is established so the module uses our mock constructor.
import { getQuote, getQuotes, getLiveBenchmarks, clearCacheForTesting } from '../../src/lib/priceCache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // must match module constant

function makeQuoteResponse(price = 100) {
  return {
    regularMarketPrice: price,
    regularMarketPreviousClose: price - 1,
    regularMarketChange: 1,
    regularMarketChangePercent: 1.0,
    currency: 'USD',
    shortName: 'Test Corp',
  };
}

/** Advance fake timers past the cache TTL so the next call re-fetches. */
function expireCache() {
  vi.advanceTimersByTime(CACHE_TTL_MS + 1);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getQuote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuote.mockReset();
    mockHistorical.mockReset();
    clearCacheForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls yahooFinance.quote() on the first request for a symbol', async () => {
    mockQuote.mockResolvedValueOnce(makeQuoteResponse(150));

    const result = await getQuote('AAPL');

    expect(mockQuote).toHaveBeenCalledTimes(1);
    expect(mockQuote).toHaveBeenCalledWith('AAPL');
    expect(result?.price).toBe(150);
  });

  it('normalises symbol to upper-case before fetching', async () => {
    mockQuote.mockResolvedValueOnce(makeQuoteResponse(200));

    await getQuote('msft');

    expect(mockQuote).toHaveBeenCalledWith('MSFT');
  });

  it('returns the cached value on a second call within the TTL', async () => {
    mockQuote.mockResolvedValueOnce(makeQuoteResponse(300));

    const first = await getQuote('GOOG');
    // Do NOT advance timers — still within TTL
    const second = await getQuote('GOOG');

    expect(mockQuote).toHaveBeenCalledTimes(1); // only one network call
    expect(second?.price).toBe(first?.price);
  });

  it('re-fetches after the TTL expires', async () => {
    mockQuote
      .mockResolvedValueOnce(makeQuoteResponse(100))
      .mockResolvedValueOnce(makeQuoteResponse(110));

    await getQuote('TSLA');
    expireCache();
    const afterExpiry = await getQuote('TSLA');

    expect(mockQuote).toHaveBeenCalledTimes(2);
    expect(afterExpiry?.price).toBe(110);
  });

  it('returns null when yahooFinance throws and there is no stale cache', async () => {
    mockQuote.mockRejectedValueOnce(new Error('network error'));

    const result = await getQuote('UNKNOWN');

    expect(result).toBeNull();
  });

  it('returns the stale cached value when yahooFinance throws after TTL', async () => {
    // First successful fetch to populate cache
    mockQuote.mockResolvedValueOnce(makeQuoteResponse(50));
    await getQuote('STALE');

    // Expire cache then make the next fetch fail
    expireCache();
    mockQuote.mockRejectedValueOnce(new Error('timeout'));

    const result = await getQuote('STALE');

    expect(result?.price).toBe(50); // stale value served
  });

  it('maps yahoo response fields to CachedQuote correctly', async () => {
    mockQuote.mockResolvedValueOnce({
      regularMarketPrice: 42,
      regularMarketPreviousClose: 40,
      regularMarketChange: 2,
      regularMarketChangePercent: 5.0,
      currency: 'CAD',
      shortName: 'Foo Inc',
    });

    const q = await getQuote('FOO');

    expect(q).toMatchObject({
      price: 42,
      previousClose: 40,
      dayChange: 2,
      dayChangePercent: 5,
      currency: 'CAD',
      shortName: 'Foo Inc',
    });
    expect(q?.fetchedAt).toBeTypeOf('number');
  });

  it('uses price as previousClose when regularMarketPreviousClose is missing', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 77 });

    const q = await getQuote('NOPREV');
    expect(q?.previousClose).toBe(77);
  });
});

// ─── getQuotes ────────────────────────────────────────────────────────────────

describe('getQuotes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuote.mockReset();
    mockHistorical.mockReset();
    clearCacheForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batch-fetches multiple symbols and returns a Map keyed by upper-case symbol', async () => {
    mockQuote
      .mockResolvedValueOnce(makeQuoteResponse(10))
      .mockResolvedValueOnce(makeQuoteResponse(20));

    const result = await getQuotes(['aapl', 'msft']);

    expect(result.size).toBe(2);
    expect(result.has('AAPL')).toBe(true);
    expect(result.has('MSFT')).toBe(true);
    expect(result.get('AAPL')?.price).toBe(10);
    expect(result.get('MSFT')?.price).toBe(20);
  });

  it('de-duplicates repeated symbols', async () => {
    mockQuote.mockResolvedValueOnce(makeQuoteResponse(55));

    const result = await getQuotes(['SPY', 'spy', 'SPY']);

    expect(mockQuote).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(1);
  });

  it('omits failed symbols from the result Map', async () => {
    mockQuote
      .mockResolvedValueOnce(makeQuoteResponse(100))
      .mockRejectedValueOnce(new Error('bad symbol'));

    const result = await getQuotes(['GOOD', 'BAD']);

    expect(result.has('GOOD')).toBe(true);
    expect(result.has('BAD')).toBe(false);
  });

  it('returns an empty Map when all symbols fail', async () => {
    mockQuote.mockRejectedValue(new Error('down'));

    const result = await getQuotes(['X', 'Y']);

    expect(result.size).toBe(0);
  });
});

// ─── getLiveBenchmarks ────────────────────────────────────────────────────────

describe('getLiveBenchmarks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuote.mockReset();
    mockHistorical.mockReset();
    clearCacheForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const PERIODS = ['1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;

  function makeHistoricalRows(startClose: number, endClose: number) {
    const start = new Date('2023-01-01');
    const end = new Date('2024-01-01');
    return [
      { date: start, close: startClose },
      { date: end, close: endClose },
    ];
  }

  it('returns fallback values when yahooFinance.historical throws', async () => {
    mockHistorical.mockRejectedValue(new Error('Yahoo down'));

    const result = await getLiveBenchmarks();

    // All periods must be present
    for (const period of PERIODS) {
      expect(result[period]).toBeDefined();
      expect(result[period].sp500).toBeTypeOf('number');
      expect(result[period].usBonds).toBeTypeOf('number');
      expect(result[period].usStocks).toBeTypeOf('number');
    }
  });

  it('returns cached benchmarks on second call within TTL', async () => {
    // First call: historical returns minimal data
    mockHistorical.mockResolvedValue(makeHistoricalRows(100, 110));

    const first = await getLiveBenchmarks();
    // Do NOT advance time — still within TTL
    const second = await getLiveBenchmarks();

    // historical is called 3 symbols × 6 periods = 18 times on first call only
    const callCount = mockHistorical.mock.calls.length;
    expect(callCount).toBe(18); // no additional calls for second invocation
    expect(second).toBe(first); // same object reference from cache
  });

  it('re-fetches benchmarks after TTL expires', async () => {
    mockHistorical.mockResolvedValue(makeHistoricalRows(100, 120));

    await getLiveBenchmarks();
    const firstCallCount = mockHistorical.mock.calls.length;

    expireCache();
    mockHistorical.mockResolvedValue(makeHistoricalRows(100, 130));
    await getLiveBenchmarks();

    expect(mockHistorical.mock.calls.length).toBe(firstCallCount * 2);
  });

  it('computes period returns as a rounded percentage', async () => {
    // 100 → 115 = 15% return
    mockHistorical.mockResolvedValue(makeHistoricalRows(100, 115));

    const result = await getLiveBenchmarks();

    // All three symbols get the same mock data, so sp500/usBonds/usStocks should all be 15
    for (const period of PERIODS) {
      expect(result[period].sp500).toBe(15);
    }
  });

  it('returns 0 for a period when fewer than 2 data points are returned', async () => {
    mockHistorical.mockResolvedValue([{ date: new Date(), close: 100 }]); // only 1 row

    const result = await getLiveBenchmarks();

    for (const period of PERIODS) {
      expect(result[period].sp500).toBe(0);
    }
  });
});

