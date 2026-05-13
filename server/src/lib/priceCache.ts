import yahooFinanceModule from 'yahoo-finance2';
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('priceCache');

// yahoo-finance2 v3: default export is the class, must instantiate
const YahooFinance = yahooFinanceModule as unknown as new (opts?: object) => {
  quote(symbol: string): Promise<{
    regularMarketPrice?: number;
    regularMarketPreviousClose?: number;
    regularMarketChange?: number;
    regularMarketChangePercent?: number;
    currency?: string;
    shortName?: string;
  }>;
  historical(
    symbol: string,
    opts: { period1: string | Date; period2: string | Date; interval?: string }
  ): Promise<Array<{ date: Date; close: number }>>;
};
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CachedQuote {
  price: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  currency: string;
  shortName: string;
  dividendYield: number; // e.g. 0.025 for 2.5%
  fetchedAt: number;
}

const cache = new Map<string, CachedQuote>();

async function fetchFromYahoo(symbol: string): Promise<CachedQuote> {
  const q = await yf.quote(symbol);
  if (!q) throw new Error(`No data returned for ${symbol}`);
  const price = q.regularMarketPrice ?? 0;
  return {
    price,
    previousClose: q.regularMarketPreviousClose ?? price,
    dayChange: Math.round((q.regularMarketChange ?? 0) * 100) / 100,
    dayChangePercent: Math.round((q.regularMarketChangePercent ?? 0) * 100) / 100,
    currency: q.currency ?? 'USD',
    shortName: q.shortName ?? symbol,
    dividendYield: (q as any).dividendYield ?? (q as any).trailingAnnualDividendYield ?? 0,
    fetchedAt: Date.now(),
  };
}

export async function getQuote(symbol: string): Promise<CachedQuote | null> {
  const upper = symbol.toUpperCase();
  const cached = cache.get(upper);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const quote = await fetchFromYahoo(upper);
    cache.set(upper, quote);
    return quote;
  } catch (err) {
    if (cached) return cached; // serve stale rather than nothing
    log.warn({ err, ticker: upper }, 'Failed to fetch price');
    return null;
  }
}

/** Batch-fetch multiple symbols in parallel, each respecting its own cache TTL */
export async function getQuotes(symbols: string[]): Promise<Map<string, CachedQuote>> {
  const unique = [...new Set(symbols.map(s => s.toUpperCase()))];
  const results = await Promise.allSettled(unique.map(s => getQuote(s)));
  const map = new Map<string, CachedQuote>();
  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      map.set(unique[i], result.value);
    }
  }
  return map;
}

export function getCacheStatus() {
  return Array.from(cache.entries()).map(([symbol, q]) => ({
    symbol,
    ageSeconds: Math.round((Date.now() - q.fetchedAt) / 1000),
    price: q.price,
  }));
}


// ─── Live Benchmarks ──────────────────────────────────────────────────────────

export interface BenchmarkReturns {
  sp500: number;
  usBonds: number;
  usStocks: number;
}

export type BenchmarkPeriod = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

/** Hardcoded fallback values used when Yahoo Finance is unavailable */
const BENCHMARK_FALLBACK: Record<BenchmarkPeriod, BenchmarkReturns> = {
  '1M':  { sp500: 1.8,  usBonds: 0.3,  usStocks: 1.9  },
  '3M':  { sp500: 5.1,  usBonds: 0.8,  usStocks: 5.4  },
  '6M':  { sp500: 9.3,  usBonds: 1.5,  usStocks: 9.8  },
  'YTD': { sp500: 12.0, usBonds: 2.1,  usStocks: 12.5 },
  '1Y':  { sp500: 18.5, usBonds: 3.2,  usStocks: 19.2 },
  '5Y':  { sp500: 82.0, usBonds: 10.5, usStocks: 87.0 },
};

interface BenchmarkCacheEntry {
  data: Record<BenchmarkPeriod, BenchmarkReturns>;
  fetchedAt: number;
}

let benchmarkCache: BenchmarkCacheEntry | null = null;

/** Compute period start date for a given BenchmarkPeriod */
function periodStartDate(period: BenchmarkPeriod): Date {
  const now = new Date();
  switch (period) {
    case '1M': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3M': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6M': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case 'YTD': return new Date(now.getFullYear(), 0, 1);
    case '1Y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case '5Y': return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  }
}

/** Fetch historical close prices and compute percent return for all periods */
async function fetchPeriodReturn(symbol: string, period: BenchmarkPeriod): Promise<number> {
  const start = periodStartDate(period);
  // Add one extra day buffer so we always get at least one prior data point
  const bufferedStart = new Date(start);
  bufferedStart.setDate(bufferedStart.getDate() - 5);

  const rows = await yf.historical(symbol, {
    period1: bufferedStart,
    period2: new Date(),
    interval: '1d',
  });

  if (rows.length < 2) return 0;

  // Find the first row on or after the true start date
  const startRow = rows.find(r => r.date >= start) ?? rows[0];
  const endRow = rows[rows.length - 1];

  if (!startRow.close || !endRow.close || startRow.close === 0) return 0;

  return Math.round(((endRow.close - startRow.close) / startRow.close) * 10000) / 100;
}

/**
 * Returns live benchmark returns for SPY (S&P 500), BND (US Bonds), and VTI (US Stocks)
 * across all supported periods. Results are cached for 15 minutes.
 * Falls back to hardcoded values if Yahoo Finance is unavailable.
 */
export async function getLiveBenchmarks(): Promise<Record<BenchmarkPeriod, BenchmarkReturns>> {
  if (benchmarkCache && Date.now() - benchmarkCache.fetchedAt < CACHE_TTL_MS) {
    return benchmarkCache.data;
  }

  const periods: BenchmarkPeriod[] = ['1M', '3M', '6M', 'YTD', '1Y', '5Y'];
  const symbols = ['SPY', 'BND', 'VTI'] as const;

  try {
    // Fetch all symbol×period combinations in parallel
    const [spyResults, bndResults, vtiResults] = await Promise.all(
      symbols.map(symbol =>
        Promise.all(periods.map(period => fetchPeriodReturn(symbol, period)))
      )
    );

    const data = {} as Record<BenchmarkPeriod, BenchmarkReturns>;
    periods.forEach((period, i) => {
      data[period] = {
        sp500:    spyResults[i],
        usBonds:  bndResults[i],
        usStocks: vtiResults[i],
      };
    });

    benchmarkCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    log.warn({ err }, 'getLiveBenchmarks failed, using fallback');
    // Return stale cache if available, otherwise hardcoded fallback
    return benchmarkCache?.data ?? BENCHMARK_FALLBACK;
  }
}

/** Clear all in-memory caches. Intended for use in tests only. */
export function clearCacheForTesting(): void {
  cache.clear();
  benchmarkCache = null;
}
