export type InvestmentEventType = 'buy' | 'sell' | 'dividend' | 'transfer' | 'fee' | 'other';

export interface ReportTransactionInput {
  type: string;
  isTransfer?: boolean;
  investmentType?: InvestmentEventType | null;
}

export interface ReportTransactionClassification {
  cashFlow: boolean;
  netWorth: boolean;
  investmentRelevant: boolean;
}

const CASH_FLOW_EXCLUDED_TYPES = new Set(['transfer', 'investment_buy']);
const INVESTMENT_RELEVANT_TYPES = new Set(['investment_buy', 'investment_sell', 'investment_dividend']);
const INVESTMENT_RELEVANT_EVENT_TYPES = new Set<InvestmentEventType>(['buy', 'sell', 'dividend']);

export function shouldExcludeFromCashFlow(input: ReportTransactionInput): boolean {
  if (input.isTransfer === true) return true;
  if (CASH_FLOW_EXCLUDED_TYPES.has(input.type)) return true;
  return input.investmentType === 'buy';
}

export function classifyReportTransaction(
  input: ReportTransactionInput,
): ReportTransactionClassification {
  const investmentRelevant =
    INVESTMENT_RELEVANT_TYPES.has(input.type) ||
    (input.investmentType != null && INVESTMENT_RELEVANT_EVENT_TYPES.has(input.investmentType));

  return {
    cashFlow: !shouldExcludeFromCashFlow(input),
    netWorth: true,
    investmentRelevant,
  };
}
