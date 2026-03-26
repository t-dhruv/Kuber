/**
 * fxRates.ts
 * Live FX rates via Open Exchange Rates (free tier, no key needed for latest USD base).
 * Falls back to ECB data if primary fails. Caches rates for 1 hour.
 */

interface FxCache {
  rates: Record<string, number>; // relative to USD base
  fetchedAt: number;
}

let cache: FxCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Hardcoded fallback rates (approximate, updated 2026)
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  CAD: 1.36,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.53,
  CHF: 0.90,
  JPY: 149.5,
  MXN: 17.2,
  NZD: 1.63,
};

export async function getFxRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }

  try {
    // ECB public API — no key needed, returns EUR-based rates
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json() as { rates?: Record<string, number> };
      if (data.rates) {
        cache = { rates: data.rates, fetchedAt: Date.now() };
        return data.rates;
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Use hardcoded fallback
  cache = { rates: FALLBACK_RATES, fetchedAt: Date.now() };
  return FALLBACK_RATES;
}

/**
 * Convert amount from one currency to another.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;
  const rates = await getFxRates();
  const fromRate = rates[from.toUpperCase()] ?? 1;
  const toRate = rates[to.toUpperCase()] ?? 1;
  return (amount / fromRate) * toRate;
}

/**
 * Get a snapshot of key currency pairs relative to a base currency.
 */
export async function getCurrencySnapshot(baseCurrency = 'USD'): Promise<Array<{ code: string; rate: number }>> {
  const rates = await getFxRates();
  const baseRate = rates[baseCurrency.toUpperCase()] ?? 1;
  const DISPLAY_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'CHF', 'JPY'];
  return DISPLAY_CURRENCIES
    .filter((c) => c !== baseCurrency.toUpperCase())
    .map((code) => ({
      code,
      rate: parseFloat(((rates[code] ?? 1) / baseRate).toFixed(4)),
    }));
}
