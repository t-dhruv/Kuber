export interface InvestmentPerformanceInput {
  contributed: number;
  currentValue: number;
  dividends: number;
  realizedGains: number;
  unrealizedGains: number;
  fees: number;
}

export interface InvestmentPerformanceSummary {
  contributions: number;
  marketGain: number;
  income: number;
  realizedGains: number;
  unrealizedGains: number;
  fees: number;
}

export function summarizeInvestmentPerformance(
  input: InvestmentPerformanceInput,
): InvestmentPerformanceSummary {
  return {
    contributions: input.contributed,
    marketGain: input.currentValue - input.contributed,
    income: input.dividends,
    realizedGains: input.realizedGains,
    unrealizedGains: input.unrealizedGains,
    fees: input.fees,
  };
}
