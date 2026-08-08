/**
 * US national spending benchmarks used by the `benchmarks` standard report.
 *
 * Moved here from `routeModules/reports.ts` by plan 006 so the standard report
 * contract owns the table. The legacy `/reports/benchmarks` route reads it through
 * `benchmarkEntries()` and `mapBenchmarkCategory()` until plan 008 retires that route.
 */

export interface BenchmarkDefinition {
  label: string;
  monthlyAvg: number;
  pctOfIncome: number;
}

export const BLS_BENCHMARKS: Record<string, BenchmarkDefinition> = {
  housing: { label: 'Housing', monthlyAvg: 2025, pctOfIncome: 33.0 },
  transportation: { label: 'Transportation', monthlyAvg: 985, pctOfIncome: 16.1 },
  food: { label: 'Food', monthlyAvg: 770, pctOfIncome: 12.6 },
  healthcare: { label: 'Healthcare', monthlyAvg: 470, pctOfIncome: 7.7 },
  entertainment: { label: 'Entertainment', monthlyAvg: 270, pctOfIncome: 4.4 },
  personal: { label: 'Personal Care', monthlyAvg: 75, pctOfIncome: 1.2 },
  education: { label: 'Education', monthlyAvg: 115, pctOfIncome: 1.9 },
  clothing: { label: 'Clothing', monthlyAvg: 130, pctOfIncome: 2.1 },
  utilities: { label: 'Utilities', monthlyAvg: 370, pctOfIncome: 6.0 },
  misc: { label: 'Miscellaneous', monthlyAvg: 175, pctOfIncome: 2.9 },
};

const CATEGORY_MAP: [RegExp, string][] = [
  [/hous|rent|mortg/i, 'housing'],
  [/transport|auto|car|gas|fuel|parking|uber|lyft|rideshare/i, 'transportation'],
  [/food|grocer|restaur|dining|fast.?food|coffee|cafe/i, 'food'],
  [/health|medical|pharma|drug|dental|vision|doctor/i, 'healthcare'],
  [/entertain|netflix|spotify|hulu|subscri|stream|movie|theater/i, 'entertainment'],
  [/personal|hair|salon|gym|fitness/i, 'personal'],
  [/educat|tuition|school|book/i, 'education'],
  [/cloth|apparel|fashion/i, 'clothing'],
  [/util|electric|water|internet|phone|cable/i, 'utilities'],
];

/** Map a Category name onto a benchmark key. Anything unmatched falls into `misc`. */
export function mapBenchmarkCategory(name: string): string {
  for (const [pattern, key] of CATEGORY_MAP) {
    if (pattern.test(name)) return key;
  }
  return 'misc';
}

/** The benchmark table as an ordered list, one entry per benchmark key. */
export function benchmarkEntries(): Array<{ key: string } & BenchmarkDefinition> {
  return Object.entries(BLS_BENCHMARKS).map(([key, definition]) => ({ key, ...definition }));
}

/**
 * Whole months covered by an inclusive date range, matching the legacy
 * `/reports/benchmarks` calculation so the two outputs stay comparable.
 */
export function benchmarkMonths(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.max(1, Math.round((end - start) / (30 * 24 * 3600 * 1000)));
}

export const BENCHMARK_SOURCE_WARNING =
  'Benchmark figures come from the U.S. Bureau of Labor Statistics, Consumer Expenditure Survey 2023 national averages, and are not adjusted for household size or region.';
